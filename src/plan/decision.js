import { formatNumber, t, translateText } from '../i18n/index.js';
import { shortDuration } from './tableFormat.js';

// Go / no-go at the mission table: one decision from the planner state, the route's suit budget (route.totals,
// src/sim/legCosts.js), the crew's budget (route.budget, src/sim/missionNeeds.js) and the dust opacity against the
// terrain-fix limit (#248). Plain function over t(), so it is tested without a browser.

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * @param {{ planner: { status: string, error?: string | null }, totals: object | null,
 *   budget?: { fits?: boolean, limit?: string | null, usedSec?: number, usableSec?: number } | null,
 *   dust?: { tau: number, limit: number } | null }} input
 *   budget: the crew's budget, only while the route on the table is the planned one (an event re-plan replaces it);
 *   dust: the opacity the crew would walk in and the terrain-fix limit (hazards.json dust.event.nav_fix_tau_max)
 * @returns {{ tone: 'ok' | 'caution' | 'warning' | null, title: string, text: string, go: boolean,
 *   reason: 'error' | 'planning' | 'reserve' | 'budget' | 'dust' | 'caution' | 'go' }}
 */
export function decisionFor({ planner, totals, budget = null, dust = null }) {
  const noGo = (reason, text) => ({ tone: 'warning', title: t('table.decision.no.go'), text, go: false, reason });
  if (planner?.status === 'error') return noGo('error', planner.error ? translateText(planner.error) : t('table.decision.no.route'));
  if (!totals) return { tone: null, title: t('table.decision.planning'), text: t('table.decision.waiting'), go: false, reason: 'planning' };
  if (totals.status === 'warning') return noGo('reserve', t('table.decision.reserve'));
  if (budget && budget.fits === false) {
    if (budget.limit === 'time' && finite(budget.usedSec) && finite(budget.usableSec)) {
      return noGo('budget', t('table.decision.over.time', { used: shortDuration(budget.usedSec), usable: shortDuration(budget.usableSec) }));
    }
    if (budget.limit === 'o2') return noGo('budget', t('table.decision.over.o2'));
    if (budget.limit === 'battery') return noGo('budget', t('table.decision.over.battery'));
    return noGo('budget', t('table.decision.over.time.short'));
  }
  if (dust && finite(dust.tau) && finite(dust.limit) && dust.tau > dust.limit) {
    return noGo('dust', t('table.decision.dust', { tau: formatNumber(dust.tau, 1), limit: formatNumber(dust.limit, 1) }));
  }
  if (totals.status === 'caution') return { tone: 'caution', title: t('table.decision.go.with.care'), text: t('table.decision.small.margin'), go: true, reason: 'caution' };
  return { tone: 'ok', title: t('table.decision.go'), text: t('table.decision.wide.margin'), go: true, reason: 'go' };
}
