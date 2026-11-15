// Text helpers shared by the online components. Plain functions over the store's `online` slice and the join state.
import { t } from '../i18n/index.js';
import { CLOSE_REPLACED, CLOSE_ROOM_FULL, ROLE, SEATS } from '../onlineLink.js';

export const roleLabel = (role) => (role === ROLE.HABITAT ? t('online.role.habitat') : t('online.role.surface'));
export const otherRole = (role) => (role === ROLE.HABITAT ? ROLE.SURFACE : ROLE.HABITAT);

/** 'connecting' | 'open' | 'offline' | 'closed' as a short label. */
export function statusLabel(status) {
  if (status === 'open') return t('online.status.open');
  if (status === 'offline') return t('online.status.offline');
  if (status === 'closed') return t('online.status.closed');
  return t('online.status.connecting');
}

/** The seat line under a role: "3 of 4 seats left", "Full", or "4 seats" when the client knows nothing yet. */
export function seatsLabel(role, left) {
  if (left === 0) return t('online.seats.full');
  if (Number.isInteger(left)) return t('online.seats.left', { n: left, max: SEATS[role] });
  return t('online.seats.max', { max: SEATS[role] });
}

/**
 * What went wrong with the room, if anything: { kind: 'full' | 'replaced' | 'offline', role? }.
 * `full` is the role the join panel was refused; a closed socket with 4001 later on counts too.
 */
export function onlineIssue(online, full = null, role = null) {
  if (full) return { kind: 'full', role: full };
  if (!online || online.code === null) return null;
  if (online.status === 'closed' && online.closeCode === CLOSE_REPLACED) return { kind: 'replaced' };
  if (online.status === 'closed' && online.closeCode === CLOSE_ROOM_FULL) return { kind: 'full', role: role ?? ROLE.SURFACE };
  if (online.status === 'offline') return { kind: 'offline' };
  return null;
}

export function issueText(issue) {
  if (!issue) return '';
  if (issue.kind === 'full') return t('online.full', { role: roleLabel(issue.role), max: SEATS[issue.role] });
  if (issue.kind === 'replaced') return t('online.replaced');
  return t('online.offline');
}

/** CSS colour of a suit colour index (src/engine/crew.js PLAYER_COLORS are linear 0-1 RGB). */
export function swatch(rgb) {
  if (!Array.isArray(rgb)) return 'transparent';
  return 'rgb(' + rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255)).join(' ') + ')';
}
