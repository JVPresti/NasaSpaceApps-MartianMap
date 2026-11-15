import { useMemo } from 'react';
import { t } from '../i18n/index.js';
import { createSharedMarkersSelector } from '../hud/sharedMarkers.js';
import { toMap } from '../plan/mapLayers.js';
import { useMissionStore } from '../state/store.js';
import { crewMarks, polylinePoints } from './crewMap.js';
import './online.css';

const EMPTY = [];

/**
 * The habitat seat's layer on the mission table map (#55): the crew where the radio last placed them, the route the
 * crew has (dashed), the room's markers and the point picked for a note. MissionMap renders it with its current crop.
 * @param {{ crop: { x0: number, z0: number, size: number }, pick?: { x: number, z: number } | null }} props
 */
export default function CrewOnMap({ crop, pick = null }) {
  const crew = useMissionStore((s) => s.habitat?.crew ?? EMPTY);
  const sentPath = useMissionStore((s) => s.habitat?.route?.path ?? null);
  const selectMarkers = useMemo(() => createSharedMarkersSelector(), []);
  const markers = useMissionStore(selectMarkers);
  const marks = crewMarks(crew, crop);
  const line = polylinePoints(sentPath, crop);
  const picked = pick ? toMap(pick.x, pick.z, crop) : null;

  return (
    <>
      {line && (
        <svg className="table-map-marks online-map-sent" viewBox="0 0 100 100" aria-hidden="true">
          <polyline points={line} />
        </svg>
      )}
      <ul className="online-map-notes" aria-label={t('online.habitat.note.title')}>
        {markers.map((m) => {
          const [u, v] = toMap(m.x, m.z, crop);
          if (u < -2 || u > 102 || v < -2 || v > 102) return null;
          return (
            <li key={m.id} className={'online-map-note kind-' + m.kind} style={{ left: `${u}%`, top: `${v}%`, '--c': m.color }}>
              <i aria-hidden="true" /><span>{m.label}</span>
            </li>
          );
        })}
      </ul>
      {picked && <span className="online-map-pick" style={{ left: `${picked[0]}%`, top: `${picked[1]}%` }} aria-hidden="true" />}
      <ul className="online-map-crew" aria-label={t('online.habitat.crew')}>
        {marks.map((m) => (
          <li key={m.id} className={m.lastKnown ? 'online-map-suit last-known' : 'online-map-suit'} style={{ left: `${m.u}%`, top: `${m.v}%`, '--c': m.color }}>
            <i aria-hidden="true" />
            <span><b>{m.name}</b>{m.lastKnown && <small>{t('online.habitat.last.known')}</small>}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
