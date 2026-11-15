// Other players' markers (#54) for the minimap and the scene. Reads the store's `shared` slice, written by
// src/net/sharedState.js when the link has ?room=; offline the slice is empty and this returns [].
// A marker is drawn in its author's suit colour, or a neutral grey when the author has no colour (the habitat seat) or
// has left. This player's own finds are skipped while they are still in `finds.list`: Finds draws those, with the decision card.
// Plain JavaScript, no React and no three.js.
import { PLAYER_COLORS } from '../engine/crew.js';
import { t } from '../i18n/index.js';
import { crewCss } from './crewColor.js';

export const NEUTRAL = '#d9d2c8';
const NAME_CHARS = 8;

/** A crew member's display name, or "another player" when the id is not in the room now. */
export function crewName(state, id) {
  const e = (state.online?.crew || []).find((c) => c.id === id);
  return e ? e.name : t('online.another.player');
}

function color(crew, author) {
  const e = crew.find((c) => c.id === author);
  return (e && Number.isInteger(e.color) && crewCss(PLAYER_COLORS[e.color])) || NEUTRAL;
}

function label(m, crew, self) {
  if (m.kind === 'note') return m.label || t('online.marker.note');
  if (m.kind === 'go') return t('online.marker.go') + (m.label ? ' ' + m.label : '');
  if (m.author === self) return m.label;
  const e = crew.find((c) => c.id === m.author);
  return (e ? e.name.slice(0, NAME_CHARS).trim() + ' ' : '') + m.label;
}

/**
 * Shared markers to draw: [{ id, label, x, z, status: 'shared', kind, color, author }].
 * @param {{ shared?: object, finds?: object, online?: object }} state store state
 */
export function sharedMarkers(state) {
  const markers = state.shared?.markers;
  if (!Array.isArray(markers) || !markers.length) return [];
  const crew = state.online?.crew || [];
  const self = state.online?.me?.id ?? null;
  const cids = state.shared.findCids || {};
  const drawnByFinds = new Set((state.finds?.list || []).map((f) => cids[f.id]).filter(Boolean));
  const out = [];
  for (const m of markers) {
    if (!Number.isFinite(m?.x) || !Number.isFinite(m?.z) || drawnByFinds.has(m.cid)) continue;
    out.push({ id: 'shared-' + m.cid, label: label(m, crew, self), x: m.x, z: m.z, status: 'shared', kind: m.kind, color: color(crew, m.author), author: m.author });
  }
  return out;
}

/** sharedMarkers with the last result kept while its inputs are the same objects, so subscribers can compare by reference. */
export function createSharedMarkersSelector() {
  let last = null;
  return (state) => {
    const key = [state.shared?.markers, state.shared?.findCids, state.finds?.list, state.online?.crew, state.online?.me];
    if (last && key.every((v, i) => v === last.key[i])) return last.value;
    last = { key, value: sharedMarkers(state) };
    return last.value;
  };
}
