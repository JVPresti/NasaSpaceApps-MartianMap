// Small hooks the mission table calls (#52, #55). Separate from the components so fast refresh keeps working.
import { t } from '../i18n/index.js';
import { useLanguage } from '../i18n/useLanguage.js';
import { ROLE, useOnlineSession } from '../onlineLink.js';
import { useMissionStore } from '../state/store.js';

export const CREW_TAB = 'crew';

/** The mission table's tabs: the Crew tab joins them while this tab has a room. */
export function useOnlineTabs(tabs) {
  useLanguage();
  const online = useMissionStore((s) => s.online.code !== null);
  return online ? [...tabs, { id: CREW_TAB, label: t('online.crew.tab') }] : tabs;
}

/** True while this tab holds or asks for a habitat seat. */
export function useHabitatSeat() {
  return useOnlineSession((s) => s.handle !== null && s.role === ROLE.HABITAT);
}

