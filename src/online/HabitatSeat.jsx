import { useEffect, useState } from 'react';
import { formatNumber, t } from '../i18n/index.js';
import { addHabitatNote, sendGoCall, sendHabitatRoute } from '../state/habitatHooks.js';
import { useMissionStore } from '../state/store.js';
import CrewOnMap from './CrewOnMap.jsx';
import { ageText, suitCss } from './crewMap.js';
import './online.css';

const EMPTY = [];
const clock = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
const pct = (v) => (Number.isFinite(v) ? formatNumber(v, 0) : '–');

/** Re-renders every second, for "last known · 40 s ago". */
function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

function CrewList() {
  const crew = useMissionStore((s) => s.habitat?.crew ?? EMPTY);
  const now = useNow();
  return (
    <div className="table-panel online-crew">
      <p className="table-label">{t('online.habitat.crew')}</p>
      {crew.length === 0 && <p className="table-note">{t('online.habitat.crew.empty')}</p>}
      <ul>
        {crew.map((c) => (
          <li key={c.id} className={c.lastKnown ? 'last-known' : undefined} style={{ '--c': suitCss(c.color) }}>
            <i aria-hidden="true" />
            <div className="online-crew-who">
              <b>{c.name}</b>
              <small className={c.lastKnown ? 'tone-caution' : undefined}>
                {c.lastKnown
                  ? t('online.habitat.last.known.ago', { time: ageText(now - c.heardAtMs, t) })
                  : t('online.habitat.in.sight', { range: Number.isFinite(c.rangeM) ? Math.round(c.rangeM) : '–' })}
              </small>
            </div>
            <dl>
              <div><dt>{t('online.habitat.oxygen')}</dt><dd>{pct(c.oxygenPct)}<small>%</small></dd></div>
              <div><dt>{t('online.habitat.battery')}</dt><dd>{pct(c.batteryPct)}<small>%</small></dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GoPanel() {
  const go = useMissionStore((s) => s.habitat?.go ?? null);
  const pending = useMissionStore((s) => s.habitat?.sent?.go === 'pending');
  const [why, setWhy] = useState('');
  const call = (value) => { if (sendGoCall(value, why)) setWhy(''); };
  return (
    <div className="table-panel online-go">
      <p className="table-label">{t('online.habitat.go.title')}</p>
      <label className="online-field">
        <span>{t('online.habitat.go.reason')}</span>
        <input type="text" maxLength={80} value={why} onChange={(event) => setWhy(event.target.value)} />
      </label>
      <div className="table-pair">
        <button type="button" className="table-secondary online-go-yes" onClick={() => call(true)}>{t('online.habitat.go.button')}</button>
        <button type="button" className="table-secondary online-go-no" onClick={() => call(false)}>{t('online.habitat.nogo.button')}</button>
      </div>
      <p className="table-note" role="status">
        {pending ? t('online.habitat.go.pending') : go ? (
          <>
            {t('online.habitat.go.last')}: <b className={go.go ? 'tone-ok' : 'tone-warning'}>{t(go.go ? 'online.habitat.go.button' : 'online.habitat.nogo.button')}</b>
            {go.why ? ` · ${go.why}` : ''} · {clock(go.at)}
          </>
        ) : t('online.habitat.go.none')}
      </p>
    </div>
  );
}

function NotePanel({ pick, onSent }) {
  const [label, setLabel] = useState('');
  const [sent, setSent] = useState(false);   // shown until the next point is picked
  const send = (kind) => {
    if (!pick || !addHabitatNote(pick.x, pick.z, label, kind)) return;
    setLabel('');
    setSent(true);
    onSent();
  };
  return (
    <div className="table-panel online-note">
      <p className="table-label">{t('online.habitat.note.title')}</p>
      <p className="table-note online-note-where">
        {pick ? t('online.habitat.note.at', { x: Math.round(pick.x), z: Math.round(pick.z) }) : sent ? t('online.habitat.note.sent') : t('online.habitat.note.hint')}
      </p>
      <label className="online-field">
        <span>{t('online.habitat.note.label')}</span>
        <input type="text" maxLength={64} value={label} onChange={(event) => setLabel(event.target.value)} disabled={!pick} />
      </label>
      <div className="table-pair">
        <button type="button" className="table-secondary" disabled={!pick} onClick={() => send('note')}>{t('online.habitat.note.send')}</button>
        <button type="button" className="table-secondary" disabled={!pick} onClick={() => send('go')}>{t('online.habitat.note.go')}</button>
      </div>
    </div>
  );
}

function RouteOut() {
  const route = useMissionStore((s) => s.route);
  const sentState = useMissionStore((s) => s.habitat?.sent?.route ?? null);
  const sentAt = useMissionStore((s) => s.habitat?.route?.at ?? null);
  const [failed, setFailed] = useState(false);
  const has = Array.isArray(route.path) && route.path.length > 1;
  const send = () => setFailed(sendHabitatRoute(route.path) === 0);
  let status = null;
  if (failed) status = <p className="table-note tone-warning" role="status">{t('online.habitat.route.failed')}</p>;
  else if (sentState === 'pending') status = <p className="table-note" role="status">{t('online.habitat.route.pending')}</p>;
  else if (sentState === 'confirmed') status = <p className="table-note tone-ok" role="status">{t('online.habitat.route.confirmed', { time: clock(sentAt) })}</p>;
  return (
    <>
      <div className="table-panel">
        <p className="table-label">{t('online.habitat.route')}</p>
        <p className="table-text small">
          {has
            ? t('online.habitat.route.summary', { distance: formatNumber((route.distanceM ?? 0) / 1000, 2), time: Math.round((route.etaSec ?? 0) / 60) })
            : t('online.habitat.route.none')}
        </p>
        <p className="table-note">{t('online.habitat.route.sent.line')}</p>
        {status}
      </div>
      <div className="table-actions">
        <button type="button" className="table-primary" disabled={!has || sentState === 'pending'} onClick={send}>{t('online.habitat.send.route')}</button>
      </div>
    </>
  );
}

/**
 * The habitat seat's step at the mission table (#55): the crew list and the go or no-go call on the left, the map with
 * the crew in the middle, a note and the route for the crew on the right. The table passes its own map renderer, so
 * the map is the same one the Route step uses.
 * @param {{ renderMap: (props: object) => import('react').ReactNode }} props
 */
export default function HabitatSeat({ renderMap }) {
  const [pick, setPick] = useState(null);
  return (
    <>
      <section className="table-left">
        <h2 className="table-h">{t('online.habitat.title')}</h2>
        <p className="table-text small">{t('online.habitat.intro')}</p>
        <CrewList />
        <GoPanel />
      </section>
      {renderMap({
        layer: 0,
        title: t('online.habitat.map.title'),
        overlay: (crop) => <CrewOnMap crop={crop} pick={pick} />,
        onPick: (x, z) => setPick({ x, z }),
      })}
      <section className="table-right">
        <NotePanel pick={pick} onSent={() => setPick(null)} />
        <RouteOut />
      </section>
    </>
  );
}
