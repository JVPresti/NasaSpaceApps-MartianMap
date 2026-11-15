// Small hooks the mission table calls (#52, #55). Separate from the components so fast refresh keeps working.
import { useEffect } from 'react';
import { t } from '../i18n/index.js';
import { useLanguage } from '../i18n/useLanguage.js';
import { ROLE, useOnlineSession } from '../onlineLink.js';
import { useMissionStore } from '../state/store.js';

export const CREW_TAB = 'crew';

/** The tab to show instead of `tab`, or null to keep it: an open Crew tab goes back to the first step without a room. */
export function tabAfterRoom(online, tab, tabs) {
  return !online && tab === CREW_TAB ? tabs[0].id : null;
}

/**
 * The mission table's tabs: the Crew tab joins them while this tab has a room. Given the table's tab state, it also
 * moves an open Crew tab back to the first step once the room is gone (after Leave).
 */
export function useOnlineTabs(tabs, tab, setTab) {
  useLanguage();
  const online = useMissionStore((s) => s.online.code !== null);
  useEffect(() => {
    const next = tabAfterRoom(online, tab, tabs);
    if (next && setTab) setTab(next);
  }, [online, tab, setTab, tabs]);
  return online ? [...tabs, { id: CREW_TAB, label: t('online.crew.tab') }] : tabs;
}

/**
 * True while this tab holds a habitat seat (`online.me.role === 'habitat'` in the store, M4 reads the same), or asks for
 * one and the room has not answered yet.
 */
export function useHabitatSeat() {
  const seated = useMissionStore((s) => s.online.me?.role === ROLE.HABITAT);
  const asking = useOnlineSession((s) => s.handle !== null && s.role === ROLE.HABITAT);
  return seated || asking;
}

