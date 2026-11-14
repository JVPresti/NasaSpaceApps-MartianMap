// What the sampling prompt under the crosshair says (#36). Plain functions over the store's `sampling.status`
// (src/engine/sampling.js status()), tested in samplingPrompt.test.js.

const ROCK = (t) => t.site || 'the rock';

/**
 * @param {{ phase: string, holding: string | null, target: { kind: string, site: string | null, distanceM: number, inReach: boolean } | null,
 *   caseState: string, caseInReach: boolean, actions: { click, photo, stow, case } } | null} status
 * @returns {{ reticle: 'reach' | 'look' | null, items: { key: string, text: string }[], note: string | null }}
 *   reticle: 'reach' when a click samples the target, 'look' when a rock is in view but too far; items: the inputs that do
 *   something now; note: what is going on (a clip, the partner bringing the case, walk closer)
 */
export function samplingPrompt(status) {
  const out = { reticle: null, items: [], note: null };
  if (!status || !status.actions) return out;
  const { phase, target: t, actions: a, caseState: cs, caseInReach } = status;
  // the prompt shows up when the player looks at a rock, or at the ground within reach, or holds a sample: not while
  // walking with the ground ahead in view (the P key still works on any target in the camera's range)
  const shown = t && (t.kind === 'rock' || t.inReach);
  if (a.click) out.items.push({ key: 'Click', text: t.kind === 'rock' ? 'Take rock chips from ' + ROCK(t) : 'Scoop soil' });
  if (a.photo && shown) out.items.push({ key: 'P', text: 'Photograph ' + (t.kind === 'rock' ? ROCK(t) : 'the site') });
  if (a.stow) out.items.push({ key: 'E', text: 'Stow in the sample bag' });
  if (a.case === 'pour') out.items.push({ key: 'F', text: 'Pour into the case' });
  else if (a.case === 'call-case' && phase === 'holding') out.items.push({ key: 'F', text: 'Ask EV2 to set the case down' });
  else if (a.case === 'pick-up-case' && phase === 'idle') out.items.push({ key: 'F', text: 'EV2 takes the case back' });

  if (phase === 'collecting') out.note = 'Sampling…';
  else if (phase === 'stowing') out.note = 'Stowing the sample…';
  else if (phase === 'pouring') out.note = 'Pouring into the case…';
  else if (cs === 'coming') out.note = 'EV2 is bringing the case';
  else if (cs === 'setting-down') out.note = 'EV2 is setting the case down';
  else if (cs === 'picking-up') out.note = 'EV2 is closing the case';
  else if (phase === 'holding' && cs === 'down' && !caseInReach) out.note = 'Walk to the case to pour';
  else if (phase === 'idle' && t && t.kind === 'rock' && !t.inReach) out.note = (t.site || 'Rock') + ' · ' + t.distanceM.toFixed(1) + ' m · walk closer to sample';

  if (shown && (phase === 'idle' || phase === 'holding')) out.reticle = a.click ? 'reach' : 'look';
  return out;
}

/** The checklist rows: what each one means and what ticks it. */
export const CHECKLIST = [
  { id: 'photo', label: 'Photo', how: 'P · site in view' },
  { id: 'texture', label: 'Texture', how: 'seen in the scoop' },
  { id: 'sample', label: 'Sample', how: 'E bag · F case' },
  { id: 'seal', label: 'Seal', how: 'bag or case closed' },
];
