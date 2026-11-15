import { t } from '../i18n/index.js';
import { useShallow } from 'zustand/react/shallow';
import { useMissionStore } from '../state/store.js';
import { fixed as num, minutesFixed as min } from './routePlan.js';
import SourceTag from './SourceTag.jsx';
import { waypointNumber } from '../sim/waypointNumber.js';

// Time, oxygen and battery per leg of the planned route (#41, first shipped as RouteLegsPanel in #107). Reads
// route.legs and route.totals, which src/sim/legCosts.js keeps in step with route.path. Hosted by RoutePanel.

const short = (name) => (name ? name.split(' · ')[0] : '–');

// Column groups share one source tag in the header row when every column in the group has the same tag.
const TERRAIN = ['route.legs.distanceM', 'route.legs.climbM', 'route.legs.maxSlopeDeg'];
const SUIT = ['route.legs.timeSec', 'route.legs.o2G', 'route.legs.batteryWh'];

function useGroupTag(paths) {
  const tags = useMissionStore(useShallow((s) => paths.map((p) => s.sources[p]?.tag ?? null)));
  return tags.every((t) => t && t === tags[0]);
}

function Head({ label, unit, path, showTag }) {
  return (
    <th scope="col">
      <span className="legs-head-label">{label}</span>
      <span className="unit">{unit}</span>
      {showTag && <SourceTag path={path} />}
    </th>
  );
}

function Row({ label, title, v, total }) {
  return (
    <tr className={total ? 'legs-total' : undefined}>
      <th scope="row" title={title}>{label}</th>
      <td>{num(v.distanceM)}</td>
      <td>+{num(v.climbM)}<span className="legs-sep">/</span>−{num(v.descentM)}</td>
      <td>{num(v.maxSlopeDeg, 1)}</td>
      <td>{min(v.timeSec)}</td>
      <td>{num(v.o2G)}<small>{num(v.o2Pct, 1)}&nbsp;%</small></td>
      <td>{num(v.batteryWh)}<small>{num(v.batteryPct, 1)}&nbsp;%</small></td>
    </tr>
  );
}

/** Per-leg cost table. Renders a short note until the leg cost runner has totals. */
export default function RouteLegs() {
  const legs = useMissionStore((s) => s.route.legs);
  const totals = useMissionStore((s) => s.route.totals);
  const terrainShared = useGroupTag(TERRAIN);
  const suitShared = useGroupTag(SUIT);

  if (!totals) return <p className="legs-empty">{t('ui.no.planned.route.yet')}</p>;

  return (
    <div className="legs-scroll">
      <table className="legs-table">
        <caption className="visually-hidden">{t('ui.distance.climb.slope.time.oxygen.and.battery.for')}</caption>
        <thead>
          <tr className="legs-groups">
            <td />
            <th scope="colgroup" colSpan={3}>{t('ui.terrain')}{terrainShared && <SourceTag path={TERRAIN[0]} />}</th>
            <th scope="colgroup" colSpan={3}>{t('ui.suit.model')}{suitShared && <SourceTag path={SUIT[0]} />}</th>
          </tr>
          <tr>
            <th scope="col" className="legs-leg-head">{t('ui.leg')}</th>
            <Head label={t('ui.dist')} unit={t('units.metres')} path={TERRAIN[0]} showTag={!terrainShared} />
            <Head label={t('ui.climb')} unit={t('units.metres')} path={TERRAIN[1]} showTag={!terrainShared} />
            <Head label={t('ui.slope.155')} unit={t('units.degree')} path={TERRAIN[2]} showTag={!terrainShared} />
            <Head label={t('ui.time')} unit={t('ui.min')} path={SUIT[0]} showTag={!suitShared} />
            <Head label={t('ui.o2')} unit={t('ui.g')} path={SUIT[1]} showTag={!suitShared} />
            <Head label={t('ui.batt')} unit={t('ui.wh')} path={SUIT[2]} showTag={!suitShared} />
          </tr>
        </thead>
        <tbody>
          {legs.map((l, k) => (
            <Row
              key={k}
              label={<><span className="legs-num">{waypointNumber(k + 1)}</span>{short(l.to)}</>}
              title={t('ui.p0.to.p1', { p0: l.from ?? 'start', p1: l.to ?? 'end' })}
              v={l}
            />
          ))}
          <Row label={t('ui.total.out')} v={totals} total />
        </tbody>
      </table>
    </div>
  );
}
