import { t, translateText } from '../i18n/index.js';
// Sampling on the helmet HUD (#36): the checklist with the sample count, the prompt under the crosshair, and a shutter
// flash for the helmet camera. Reads only the store (`sampling`, written by src/state/sampling.js about 5 times per second).
import { useShallow } from 'zustand/react/shallow';
import { useMissionStore } from '../state/store.js';
import { CHECKLIST, samplingPrompt } from './samplingPrompt.js';
import { crewName } from './sharedMarkers.js';
import './sampling.css';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Check = ({ on }) => (
  <svg viewBox="0 0 24 24" className="hud-icon hud-check" aria-hidden="true">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" {...S} />
    {on && <path d="M7.5 12.5l3.2 3.2 6-7.2" {...S} strokeWidth={2.4} />}
  </svg>
);

const MATERIAL = { rock: 'chips', ground: 'soil' };
const INTO = { get pouch() { return t('ui.in.the.bag'); }, get case() { return t('ui.in.the.case'); } };
function describe(x) {
  if (!x) return null;
  const what = x.site ? x.site + ' ' + translateText(MATERIAL[x.kind]) : x.kind === 'rock' ? t('ui.rock.chips') : t('ui.soil');
  return what + ' · ' + (INTO[x.into] || '') + (x.sealed ? t('ui.sealed') : '');
}

export function SamplingChecklist() {
  const s = useMissionStore(useShallow((st) => {
    const sp = st.sampling, c = sp.checklist;
    return { count: sp.count, photo: c.photo, texture: c.texture, sample: c.sample, seal: c.seal, last: describe(sp.samples[sp.samples.length - 1]) };
  }));
  return (
    <section className="hud-panel hud-sampling" aria-label={t('ui.sampling.checklist')}>
      <div className="hud-sampling-head"><span>{t('ui.sampling')}</span><b>{s.count}</b><small>{s.count === 1 ? t('ui.sample') : t('ui.samples')}</small></div>
      <ul className="hud-checklist">
        {CHECKLIST.map((row) => (
          <li key={row.id} className={s[row.id] ? 'hud-done' : undefined} aria-label={row.label + (s[row.id] ? t('ui.done') : t('ui.to.do'))}>
            <Check on={s[row.id]} /><span>{row.label}</span><em>{row.how}</em>
          </li>
        ))}
      </ul>
      {s.last && <div className="hud-caption hud-sampling-last">{t('ui.last')}{s.last}</div>}
    </section>
  );
}

const NOTICES = { 'sample-taken': 'online.sample.taken.by', 'case-held': 'online.case.with' };

// Online (#54): who took the sample in the crosshair, who holds the case, and the last refusal. Strings, so the
// shallow compare keeps the prompt from re-rendering when nothing it shows changed. All null offline.
function onlineNames(st) {
  const sh = st.shared, me = st.online?.me?.id ?? null;
  if (!sh || st.online?.status === 'off') return { takenBy: null, caseWith: null, notice: null };
  const sid = st.sampling.status?.target?.sid, held = sid ? sh.samples[sid] : null;
  const n = sh.notice;
  return {
    takenBy: held && held.by !== me ? crewName(st, held.by) : null,
    caseWith: sh.caseHolder && sh.caseHolder !== me ? crewName(st, sh.caseHolder) : null,
    notice: n && NOTICES[n.key] ? t(NOTICES[n.key], { name: crewName(st, n.by) }) : null,
  };
}

function SamplingPrompt() {
  const status = useMissionStore((st) => st.sampling.status);   // a new object only when the status changed (the bridge compares)
  const online = useMissionStore(useShallow(onlineNames));
  const p = samplingPrompt(status, online);
  if (online.notice) p.note = online.notice;
  return (
    <>
      <div className={'hud-reticle hud-reticle-' + p.reticle} aria-hidden="true" />
      {(p.items.length > 0 || p.note) && (
        <div className="hud-sample-prompt" role="status">
          {p.items.map((it) => <div key={it.key} className="hud-prompt-item"><kbd>{it.key}</kbd><span>{it.text}</span></div>)}
          {p.note && <div className="hud-prompt-note">{p.note}</div>}
        </div>
      )}
    </>
  );
}

// Shutter flash: remounted (so replayed) each time the photo count rises
function PhotoFlash() {
  const photos = useMissionStore((st) => st.sampling.photos);
  return photos ? <div key={photos} className="hud-photo-flash" aria-hidden="true" /> : null;
}

/** The crosshair, its prompt and the shutter flash: centred on the view, outside the HUD's right column. */
export function SamplingCrosshair() {
  return (
    <>
      <PhotoFlash />
      <SamplingPrompt />
    </>
  );
}

export default function SamplingPanel() {
  return (
    <>
      <PhotoFlash />
      <SamplingPrompt />
      <SamplingChecklist />
    </>
  );
}
