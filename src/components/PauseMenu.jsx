import { useEffect, useRef } from 'react';
import ControlsHelp from './ControlsHelp.jsx';
import Modal from './Modal.jsx';
import ModeSwitch from './ModeSwitch.jsx';

const QUALITY = [
  ['auto', 'Auto'],
  ['high', 'High'],
  ['low', 'Low'],
];

function qualityLabel(quality) {
  if (!quality) return 'Reading scene quality…';
  if (quality.pending) return 'Applying scene quality…';
  return quality.auto ? 'Auto (' + quality.tier + ')' : quality.tier;
}

/**
 * Pause dialog. One native modal holds the menu, controls help and restart confirmation, so focus stays
 * inside it and the scene behind is inert. Esc closes a sub-view; on the menu it keeps the pause in Walk
 * (a key press cannot capture the mouse) and resumes in Plan, which needs no lock.
 */
export default function PauseMenu({
  view,
  mode,
  busy,
  notice,
  focusToken,
  quality,
  qualityBusy,
  qualityError,
  onResume,
  onRestartRequest,
  onRestartConfirm,
  onControls,
  onSources,
  onMenu,
  onQuality,
  onModeChange,
  onCancel,
}) {
  const resumeRef = useRef(null);
  const backRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    const target = view === 'controls' ? backRef.current : view === 'restart' ? cancelRef.current : resumeRef.current;
    target?.focus();
    // focusToken lets the menu move focus back to Resume when Escape keeps the pause instead of resuming.
  }, [view, focusToken]);

  const selected = quality && !quality.pending ? (quality.auto ? 'auto' : quality.tier) : null;
  const qualityDisabled = !quality || qualityBusy || quality.pending;

  return (
    <Modal
      labelledBy={view === 'controls' ? 'pause-controls-title' : view === 'restart' ? 'pause-restart-title' : 'pause-menu-title'}
      className="pause-dialog"
      onCancel={onCancel}
    >
      {view === 'menu' && (
        <div className="dialog-body">
          <p className="dialog-kicker">Marswalk</p>
          <h2 id="pause-menu-title" className="dialog-title">EVA paused</h2>
          <p className="dialog-site">
            {mode === 'plan' ? 'Plan view' : 'Walk view'} · mission clock paused
          </p>

          <div className="pause-view-switch" inert={busy ? true : undefined}>
            <span>View</span>
            <ModeSwitch mode={mode} onChange={onModeChange} />
          </div>

          <div className="menu-actions">
            <button
              type="button"
              className="ui-button primary"
              ref={resumeRef}
              data-autofocus="true"
              onClick={onResume}
              disabled={busy}
            >
              {busy ? (mode === 'plan' ? 'Resuming…' : 'Capturing the mouse…') : 'Resume'}
            </button>
            <button type="button" className="ui-button ghost" onClick={onRestartRequest} disabled={busy}>
              Restart EVA
            </button>
            <button type="button" className="ui-button ghost" onClick={onControls} disabled={busy}>
              Controls
            </button>
            <button type="button" className="ui-button ghost" onClick={onSources} disabled={busy}>
              Sources
            </button>
            <p id="sources-note" className="menu-note">
              Credits and the data, artistic and modelled sources.
            </p>
          </div>

          {notice && <p className="dialog-notice" role="alert">{notice}</p>}

          <div className="quality-block">
            <h3 id="quality-label">Scene quality</h3>
            <div className="quality-options" role="group" aria-labelledby="quality-label" aria-describedby="quality-status">
              {QUALITY.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={selected === id ? 'on' : undefined}
                  aria-pressed={selected === id}
                  disabled={qualityDisabled}
                  onClick={() => onQuality(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p id="quality-status" className="quality-status" role="status" aria-live="polite">
              {qualityBusy ? 'Changing scene quality…' : qualityLabel(quality)}
            </p>
            {quality?.gpu && <p className="quality-device">GPU: {quality.gpu}</p>}
            {qualityError && <p className="dialog-error" role="alert">{qualityError}</p>}
          </div>

          {mode === 'plan' && <p className="dialog-footnote">Plan resumes without capturing the mouse.</p>}
        </div>
      )}

      {view === 'controls' && (
        <div className="dialog-body">
          <p className="dialog-kicker">Marswalk</p>
          <h2 id="pause-controls-title" className="dialog-title">Controls</h2>
          <ControlsHelp />
          <div className="dialog-actions">
            <button type="button" className="ui-button primary" ref={backRef} data-autofocus="true" onClick={onMenu}>
              Back to pause menu
            </button>
          </div>
        </div>
      )}

      {view === 'restart' && (
        <div className="dialog-body">
          <p className="dialog-kicker">Marswalk</p>
          <h2 id="pause-restart-title" className="dialog-title">Restart EVA?</h2>
          <p className="dialog-mission" id="restart-warning">
            This resets your position, route, alerts, suit and the mission clock, then returns to the start screen.
            It cannot be undone.
          </p>
          <div className="dialog-actions">
            <button type="button" className="ui-button ghost" ref={cancelRef} data-autofocus="true" onClick={onMenu} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="ui-button danger" onClick={onRestartConfirm} disabled={busy} aria-describedby="restart-warning">
              {busy ? 'Restarting…' : 'Restart EVA'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
