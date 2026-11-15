// ?qa=1: the hooks scripts/quality/score.mjs needs in a production build. It exposes the same window.__marswalk
// measuring hook as development, the mission store and the event control, so each demo state is reproducible
// without timing. Nothing changes for a player who opens the app without the parameter.
import { fireEvent, listEvents } from './state/events.js';
import { useMissionStore } from './state/store.js';
import { createScriptedPartner } from './engine/partnerSource.js';
import { CREW } from './engine/crew.js';

export const QA = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1';

export function exposeQaHooks() {
  if (!QA) return;
  window.__missionStore = useMissionStore;
  window.__marswalkQa = {
    fireEvent, listEvents, engine: null,
    // a partner patrolling a few metres from (x, z), so a teleport does not leave EV2 behind the separation limit
    partnerNear: (x, z) => window.__marswalk?.setPartnerSource(createScriptedPartner({
      id: CREW[1].id, color: CREW[1].color, A: { x: x + 5, z: z + 3 }, B: { x: x + 8, z: z - 4 },
    })),
  };
}

/** EngineView hands the engine over once it is ready, for wrist and stats calls. */
export function setQaEngine(engine) {
  if (QA && window.__marswalkQa) window.__marswalkQa.engine = engine;
}
