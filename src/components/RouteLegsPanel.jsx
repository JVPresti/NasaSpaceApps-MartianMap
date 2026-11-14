import { useMissionStore } from '../state/store.js';
import SourceTag from './SourceTag.jsx';
import './RouteLegsPanel.css';

// Time, oxygen and battery per leg of the planned route (#41). Reads route.legs and route.totals, which
// src/sim/legCosts.js keeps in step with route.path. Self-contained so the Plan mode route panel (#17) can host it.

const dash = '–';
const num = (v, digits = 0) => (Number.isFinite(v) ? v.toFixed(digits) : dash);
const min = (sec) => (Number.isFinite(sec) ? (sec / 60).toFixed(1) : dash);
const short = (name) => (name ? name.split(' · ')[0] : dash);

const legsTag = (tag) => 'legs-tag legs-tag-' + tag;
const Tag = ({ path }) => <SourceTag path={path} variant="tag" requireSource className={legsTag} />;

function Row({ label, title, v, total }) {
  return (
    <tr className={total ? 'legs-total' : undefined}>
      <th scope="row" title={title}>{label}</th>
      <td>{num(v.distanceM)}</td>
      <td>+{num(v.climbM)} / −{num(v.descentM)}</td>
      <td>{num(v.maxSlopeDeg, 1)}°</td>
      <td>{min(v.timeSec)}</td>
      <td>{num(v.o2G)} <small>{num(v.o2Pct, 1)}&nbsp;%</small></td>
      <td>{num(v.batteryWh)} <small>{num(v.batteryPct, 1)}&nbsp;%</small></td>
    </tr>
  );
}

export default function RouteLegsPanel() {
  const legs = useMissionStore((s) => s.route.legs);
  const totals = useMissionStore((s) => s.route.totals);

  return (
    <section className="legs-panel" aria-label="Cost per leg">
      <h2>Cost per leg</h2>
      {!totals ? (
        <p className="legs-empty">No planned route yet.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th scope="col">Leg</th>
                <th scope="col">m <Tag path="route.legs.distanceM" /></th>
                <th scope="col">Climb / descent m</th>
                <th scope="col">Max slope</th>
                <th scope="col">min <Tag path="route.legs.timeSec" /></th>
                <th scope="col">O2 g <Tag path="route.legs.o2G" /></th>
                <th scope="col">Battery Wh <Tag path="route.legs.batteryWh" /></th>
              </tr>
            </thead>
            <tbody>
              {legs.map((l, k) => (
                <Row key={k} label={`${k + 1} · ${short(l.to)}`} title={`${l.from ?? 'start'} to ${l.to ?? 'end'}`} v={l} />
              ))}
              <Row label="Total out" v={totals} total />
            </tbody>
          </table>
          <p className={'legs-margin legs-' + totals.status}>
            {totals.roundTrip ? 'Round trip.' : `Walk home ${min(totals.returnTimeSec)} min, ${num(totals.returnO2G)} g O2 with the 20 % pad.`}{' '}
            Back at the habitat: O2 {num(totals.arrivalO2Pct)}&nbsp;%, battery {num(totals.arrivalBatteryPct)}&nbsp;%,
            margin {min(totals.marginSec)} min over the 30 min reserve <Tag path="route.totals.marginSec" />
          </p>
        </>
      )}
    </section>
  );
}
