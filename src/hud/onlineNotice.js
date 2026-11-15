// "Offline: playing solo" (#53, plan section 9.7). Reads only the store's online slice, so offline play
// (no ?room=) never shows it.

/** True when a room link gave up reconnecting or lost its seat: the scripted partner is back. */
export const showsOfflineNotice = (online) => !!online && online.code !== null && (online.status === 'offline' || online.status === 'closed');
