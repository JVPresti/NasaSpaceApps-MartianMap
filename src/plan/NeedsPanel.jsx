import { useShallow } from 'zustand/react/shallow';
import { formatNumber, t } from '../i18n/index.js';
import { CONSUMABLE_RANGE_PCT, CREW_SETTINGS, CREW_SIZES, OBJECTIVE_IDS, RISK_IDS, RISK_SETTINGS, TIME_RANGE_MIN } from '../sim/missionNeeds.js';
import { setNeeds, useMissionStore } from '../state/store.js';
import { formatDuration } from './routePlan.js';
import SourceTag from './SourceTag.jsx';

// The crew's needs at the mission table (8-minute plan, goal 2): what the walk is for, who goes, how long they have,
// what they start with and how much risk they take. Each change goes to the store (setNeeds) and the planner plans the
// route again (useRoutePlanner), so the map beside the panel moves with it. The terrain preference is the route
// profile comparison (RouteProfiles.jsx). The controls are the table's own: a select like the settings language, the
// layer buttons' toggles and the settings sliders. They lock once the EVA has begun, as the profile choice does.

const TIME_STEP_MIN = 5;
const PCT_STEP = 1;

/** One labelled row of the panel. */
function Row({ label, htmlFor, labelId, title, children }) {
  return (
    <div className="needs-row" title={title}>
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span id={labelId}>{label}</span>}
      <div className="needs-control">{children}</div>
    </div>
  );
}

/** A group of toggle buttons, one pressed. */
function Choice({ labelId, options, value, disabled, onChoose, className }) {
  return (
    <div className={'table-layers needs-choice ' + className} role="group" aria-labelledby={labelId}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? 'on' : undefined}
          aria-pressed={value === option.id}
          title={option.title}
          disabled={disabled}
          onClick={() => onChoose(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A slider with its value beside it, as the look sensitivity in the settings. */
function Slider({ id, min, max, step, value, text, disabled, onValue }) {
  return (
    <>
      <input id={id} type="range" className="needs-range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(event) => onValue(Number(event.target.value))} />
      <output htmlFor={id} className="needs-value">{text}</output>
    </>
  );
}

/**
 * @param {{ locked?: boolean }} props locked: the EVA has begun (the store's needs.locked is set at the same moment)
 */
export default function NeedsPanel({ locked = false }) {
  const needs = useMissionStore(useShallow((s) => s.needs));
  const off = locked || needs.locked === true;
  const set = (partial) => { if (!off) setNeeds(partial); };
  const pct = (value) => `${Math.round(value)} %`;

  return (
    <div className="table-panel needs-panel">
      <div className="table-panel-head">
        <p className="table-label" title={t('needs.title.help')}>{t('needs.title')}</p>
        <SourceTag path="route.budget" />
      </div>
      <div className="needs-rows">
        <Row label={t('needs.objective')} htmlFor="needs-objective">
          <select id="needs-objective" className="needs-select" value={needs.objective} disabled={off}
            onChange={(event) => set({ objective: event.target.value })}>
            {OBJECTIVE_IDS.map((id) => <option key={id} value={id}>{t(`needs.objective.${id}`)}</option>)}
          </select>
        </Row>
        <Row label={t('needs.crew')} labelId="needs-crew-label">
          <Choice labelId="needs-crew-label" className="needs-crew" value={needs.crew} disabled={off} onChoose={(crew) => set({ crew })}
            options={CREW_SIZES.map((n) => ({ id: n, label: t(`needs.crew.${n}`), title: t(`needs.crew.${n}.title`, { factor: formatNumber(CREW_SETTINGS[n].workFactor, 1) }) }))} />
        </Row>
        <Row label={t('needs.time')} htmlFor="needs-time" title={t('needs.time.title')}>
          <Slider id="needs-time" min={TIME_RANGE_MIN[0]} max={TIME_RANGE_MIN[1]} step={TIME_STEP_MIN} value={needs.timeMin}
            text={formatDuration(needs.timeMin * 60)} disabled={off} onValue={(timeMin) => set({ timeMin })} />
        </Row>
        <Row label={t('needs.o2')} htmlFor="needs-o2" title={t('needs.o2.title')}>
          <Slider id="needs-o2" min={CONSUMABLE_RANGE_PCT[0]} max={CONSUMABLE_RANGE_PCT[1]} step={PCT_STEP} value={needs.o2Pct}
            text={pct(needs.o2Pct)} disabled={off} onValue={(o2Pct) => set({ o2Pct })} />
        </Row>
        <Row label={t('needs.battery')} htmlFor="needs-battery" title={t('needs.battery.title')}>
          <Slider id="needs-battery" min={CONSUMABLE_RANGE_PCT[0]} max={CONSUMABLE_RANGE_PCT[1]} step={PCT_STEP} value={needs.batteryPct}
            text={pct(needs.batteryPct)} disabled={off} onValue={(batteryPct) => set({ batteryPct })} />
        </Row>
        <Row label={t('needs.risk')} labelId="needs-risk-label">
          <Choice labelId="needs-risk-label" className="needs-risk" value={needs.risk} disabled={off} onChoose={(risk) => set({ risk })}
            options={RISK_IDS.map((id) => ({ id, label: t(`needs.risk.${id}`), title: t(`needs.risk.${id}.title`, { reserve: Math.round(100 * RISK_SETTINGS[id].reserveShare) }) }))} />
        </Row>
      </div>
      {off && <p className="table-note">{t('needs.locked')}</p>}
    </div>
  );
}
