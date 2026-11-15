import { useShallow } from 'zustand/react/shallow';
import { t } from '../i18n/index.js';
import { PROFILE_IDS } from '../sim/routeProfiles.js';
import { chooseRouteProfile, useMissionStore } from '../state/store.js';
import { fixed as num } from './routePlan.js';
import SourceTag from './SourceTag.jsx';

// Route profiles on the mission table (#245): the three routes side by side, one column each, in the colour the map
// draws them in. Choosing a column makes that route the one Walk follows; route.legs, route.totals and go / no-go
// follow route.path. Every number is in route.profiles, written by useRoutePlanner from src/sim/routeProfiles.js.

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

// Rows grouped by where the numbers come from, each group with one source tag, as in the per-leg table (RouteLegs).
const GROUPS = [
  {
    key: 'terrain',
    path: 'route.profiles.distanceM',
    rows: [
      { key: 'distance', unit: 'km', path: 'route.profiles.distanceM', value: (p) => num(p.distanceM / 1000, 2) },
      { key: 'steepest', unit: '°', path: 'route.profiles.steepestSlopeDeg', value: (p) => num(p.steepestSlopeDeg) },
      { key: 'overCaution', unit: 'm', path: 'route.profiles.overCautionM', value: (p) => num(p.overCautionM) },
      { key: 'shadow', unit: '%', path: 'route.profiles.shadowShare', value: (p) => (finite(p.shadowShare) ? num(100 * p.shadowShare) : '–') },
    ],
  },
  {
    key: 'suit',
    path: 'route.profiles.timeSec',
    rows: [
      // Rounded up like the route panel's walk out (routeMetrics), so the chosen column and that tile agree.
      { key: 'time', unit: 'min', path: 'route.profiles.timeSec', value: (p) => (finite(p.timeSec) ? String(Math.ceil(p.timeSec / 60)) : '–') },
      { key: 'o2', unit: 'g', path: 'route.profiles.o2G', value: (p) => num(p.o2G) },
    ],
  },
];

/**
 * @param {{ locked?: boolean }} props locked: the EVA has begun, so the route can no longer be swapped
 */
export default function RouteProfiles({ locked = false }) {
  const { profiles, chosen, path } = useMissionStore(useShallow((s) => ({ profiles: s.route.profiles, chosen: s.route.profile, path: s.route.path })));
  if (!profiles) return <><Heading /><p className="table-note">{t('profiles.waiting')}</p></>;

  // The profile in use is the one whose route is the route: after an event re-plan none is.
  const inUse = PROFILE_IDS.find((id) => profiles[id]?.ok && profiles[id].path === path) ?? null;
  const described = inUse ?? chosen;

  return (
    <>
      <Heading />
      <table className="profiles-table">
        <caption>{t('profiles.caption')}</caption>
        <thead>
          <tr>
            <td />
            {PROFILE_IDS.map((id) => (
              <th key={id} scope="col" className={id === inUse ? 'on' : undefined}>
                <button
                  type="button"
                  className={'profiles-pick profile-' + id}
                  aria-pressed={id === inUse}
                  disabled={locked || !profiles[id]?.ok}
                  title={t(`profiles.${id}.what`)}
                  onClick={() => chooseRouteProfile(id)}
                >
                  {t(`profiles.${id}`)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        {GROUPS.map((group) => (
          <tbody key={group.key}>
            <tr className="profiles-group">
              <th scope="colgroup" colSpan={PROFILE_IDS.length + 1}>{t(`profiles.group.${group.key}`)}<SourceTag path={group.path} /></th>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" title={t(`profiles.row.${row.key}.title`)}>
                  {t(`profiles.row.${row.key}`)}<span className="unit">{row.unit}</span>
                </th>
                {PROFILE_IDS.map((id) => {
                  const profile = profiles[id];
                  if (!profile?.ok) {
                    return <td key={id} className="profiles-none">{row === group.rows[0] && group.key === 'terrain' ? t(profile?.reason === 'no-mast' ? 'profiles.noMast' : 'profiles.noRoute') : ''}</td>;
                  }
                  return <td key={id} className={id === inUse ? 'on' : undefined}>{row.value(profile)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <p className="table-note profiles-what">
        <i className={'profile-swatch profile-' + described} aria-hidden="true" />
        {locked ? t('profiles.locked') : t(`profiles.${described}.what`)}
      </p>
    </>
  );
}

/** The panel heading: the profile weights are our choice, so the SIM tag sits by the title. */
function Heading() {
  return (
    <div className="table-panel-head">
      <p className="table-label">{t('profiles.title')}</p>
      <SourceTag path="route.profiles.weights" />
    </div>
  );
}
