import { t, formatNumber } from '../i18n/index.js';
// What the sampling prompt under the crosshair says (#36). Plain functions over the store's `sampling.status`
// (src/engine/sampling.js status()), tested in samplingPrompt.test.js.

const ROCK = (target) => target.site || t('ui.the.rock');

/**
 * @param {{ phase: string, holding: string | null, target: { kind: string, site: string | null, distanceM: number, inReach: boolean } | null,
 *   caseState: string, caseInReach: boolean, actions: { click, photo, stow, case } } | null} status
 * @returns {{ reticle: 'reach' | 'look' | 'aim', items: { key: string, text: string }[], note: string | null }}
 *   reticle: 'reach' when a click samples the target (its `inReach` with free hands), 'look' when a rock is in view but
 *   too far, 'aim' otherwise, so a small crosshair always marks the screen centre a click samples (#199); items: the inputs that do
 *   something now; note: what is going on (a clip, the partner bringing the case, walk closer)
 */
export function samplingPrompt(status) {
  const out = { reticle: 'aim', items: [], note: null };
  if (!status || !status.actions) return out;
  const { phase, target, actions: a, caseState: cs, caseInReach } = status;
  // the prompt shows up when the player looks at a rock, or at the ground within reach, or holds a sample: not while
  // walking with the ground ahead in view (the P key still works on any target in the camera's range)
  const shown = target && (target.kind === 'rock' || target.inReach);
  if (a.click) out.items.push({ key: t('click'), text: target.kind === 'rock' ? t('sampleRock', { site: ROCK(target) }) : t('ui.scoop.soil') });
  if (a.photo && shown) out.items.push({ key: 'P', text: t('photoSite', { site: target.kind === 'rock' ? ROCK(target) : t('ui.the.site') }) });
  if (a.stow) out.items.push({ key: 'E', get text() { return t('ui.stow.in.the.sample.bag'); } });
  if (a.case === 'pour') out.items.push({ key: 'F', get text() { return t('ui.pour.into.the.case'); } });
  else if (a.case === 'call-case' && phase === 'holding') out.items.push({ key: 'F', get text() { return t('ui.ask.ev2.to.set.the.case.down'); } });
  else if (a.case === 'pick-up-case' && phase === 'idle') out.items.push({ key: 'F', get text() { return t('ui.ev2.takes.the.case.back'); } });

  if (phase === 'collecting') out.note = t('sampling');
  else if (phase === 'stowing') out.note = t('ui.stowing.the.sample');
  else if (phase === 'pouring') out.note = t('ui.pouring.into.the.case');
  else if (cs === 'coming') out.note = t('ui.ev2.is.bringing.the.case');
  else if (cs === 'setting-down') out.note = t('ui.ev2.is.setting.the.case.down');
  else if (cs === 'picking-up') out.note = t('ui.ev2.is.closing.the.case');
  else if (phase === 'holding' && cs === 'down' && !caseInReach) out.note = t('ui.walk.to.the.case.to.pour');
  else if (phase === 'idle' && target && target.kind === 'rock' && !target.inReach) out.note = t('closer', { site: target.site || t('rock'), distance: formatNumber(target.distanceM, 1) });

  if (shown && (phase === 'idle' || phase === 'holding')) out.reticle = a.click ? 'reach' : 'look';
  return out;
}

/** The checklist rows: what each one means and what ticks it. */
export const CHECKLIST = [
  { id: 'photo', get label() { return t('ui.photo'); }, get how() { return t('ui.p.site.in.view'); } },
  { id: 'texture', get label() { return t('ui.texture'); }, get how() { return t('ui.seen.in.the.scoop'); } },
  { id: 'sample', get label() { return t('sampling.checklistSample'); }, get how() { return t('ui.e.bag.f.case'); } },
  { id: 'seal', get label() { return t('ui.seal'); }, get how() { return t('ui.bag.or.case.closed'); } },
];
