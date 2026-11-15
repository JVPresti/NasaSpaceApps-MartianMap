// Sampling in the mission store (#36): the checklist, the sample count and the engine's sampling status.
// The engine reports what happened (engine.onSampling) and what is possible now (engine.getSampling, polled 5 times per
// second); this module turns that into the `sampling` slice. The checklist rules are plain functions, tested in sampling.test.js.
//
// What ticks each checklist item (events from src/engine/sampling.js):
//   photo    the player pressed P with a rock or the ground in the helmet camera's view (up to 8 m). It counts for a sample
//            taken within PHOTO_SITE_M of where the photo was aimed, before or after the scoop.
//   texture  the scoop came up with material the player can see: soil or rock chips (the clip's content time in props.js)
//   sample   the sample is in a container: in the sample bag (stow_sample, at 1.1 s) or landed in the partner's open case
//   seal     the container is closed: the stow clip ended with the bag put away, or the partner closed the lid and took the case
// A sample is counted when it is in a container (`sample`). A sealed checklist stays ticked until the next photo or scoop.
import { claimSample, mayCallCase } from './sharedHooks.js';
import { useMissionStore } from './store.js';

export const SAMPLING_POLL_MS = 200;
export const PHOTO_SITE_M = 3;   // a photo documents a sample taken within this distance of where it was aimed

/** The checklist of the sample in progress. photoAt / siteAt: { x, z } of the photo and of the scoop; sampleId: engine id. */
export function emptyChecklist() {
  return { photo: false, texture: false, sample: false, seal: false, photoAt: null, siteAt: null, sampleId: null };
}

const at = (e) => ({ x: e.x, z: e.z });
const near = (a, b) => !!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) <= PHOTO_SITE_M;

/**
 * Checklist after one engine event. Pure.
 * @param {ReturnType<typeof emptyChecklist>} c
 * @param {{ type: 'photo' | 'collect' | 'texture' | 'secured' | 'sealed', id?: number, x?: number, z?: number }} e
 */
export function nextChecklist(c, e) {
  switch (e.type) {
    case 'photo': {
      if (c.seal || c.sampleId === null) return { ...(c.seal ? emptyChecklist() : c), photo: true, photoAt: at(e) };   // before the scoop
      return near(at(e), c.siteAt) ? { ...c, photo: true, photoAt: at(e) } : c;                                            // after it: same site only
    }
    case 'collect': {   // a new scoop restarts the checklist; an earlier photo of the same site still counts
      const keep = !c.seal && c.photo && near(c.photoAt, at(e));
      return { ...emptyChecklist(), photo: keep, photoAt: keep ? c.photoAt : null, siteAt: at(e), sampleId: e.id };
    }
    case 'texture': return e.id === c.sampleId ? { ...c, texture: true } : c;
    case 'secured': return e.id === c.sampleId ? { ...c, sample: true } : c;
    case 'sealed': return e.id === c.sampleId ? { ...c, seal: true } : c;
    default: return c;
  }
}

/**
 * The `sampling` slice after one engine event. Pure. A sample is added (and counted) when it is secured in a container.
 * @param {{ count: number, photos: number, samples: object[], checklist: object }} s
 * @param {object} e engine event
 * @param {number | null} atSec mission time of the event
 */
export function applySamplingEvent(s, e, atSec = null) {
  const checklist = nextChecklist(s.checklist, e);
  let { count, photos, samples } = s;
  if (e.type === 'photo') photos += 1;
  if (e.type === 'secured' && !samples.some((x) => x.id === e.id)) {
    count += 1;
    samples = [...samples, { id: e.id, kind: e.kind, site: e.site ?? null, x: e.x, z: e.z, into: e.into, photo: checklist.photo, texture: checklist.texture, sealed: false, atSec }];
  }
  if (e.type === 'sealed') samples = samples.map((x) => (x.id === e.id && !x.sealed ? { ...x, sealed: true, photo: x.photo || checklist.photo } : x));
  return { ...s, count, photos, samples, checklist };
}

/**
 * Connects the engine's sampling to the store: events update the checklist and the count at once; the status (target,
 * phase, case, actions) is polled 5 times per second and written only when it changed.
 * @returns {() => void} disconnect
 */
export function connectSampling(engine, store = useMissionStore) {
  if (!engine || typeof engine.onSampling !== 'function') return () => {};
  let last = '';
  const poll = () => {
    const status = engine.getSampling(), key = JSON.stringify(status);
    if (key === last) return;
    last = key;
    store.setState((s) => ({ sampling: { ...s.sampling, status } }));
  };
  // online (#54): the engine asks src/state/sharedHooks.js before a scoop and before calling for the case; offline the
  // hooks answer "go ahead" (claimSample returns null), so nothing changes
  if (typeof engine.setSampleGate === 'function') engine.setSampleGate({ claim: claimSample, mayCallCase });
  const off = engine.onSampling((e) => {
    store.setState((s) => ({ sampling: applySamplingEvent(s.sampling, e, s.mission.elapsedSec) }));
    poll();   // the prompt follows the action at once, not at the next poll
  });
  poll();
  const timer = setInterval(poll, SAMPLING_POLL_MS);
  return () => { off(); clearInterval(timer); if (typeof engine.setSampleGate === 'function') engine.setSampleGate(null); };
}
