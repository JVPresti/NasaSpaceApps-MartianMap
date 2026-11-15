import { useEffect, useRef } from 'react';
import { ControlsPanel } from './ControlsHelp.jsx';
import Modal from './Modal.jsx';

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
 * Pause dialog (#11 design). There is no Plan / Walk switch: once the EVA has begun, End the EVA goes back to the
 * mission table with a fresh EVA. One native modal holds the menu, controls help and restart confirmation, so focus stays
 * inside it and the scene behind is inert. Esc closes a sub-view; on the menu it keeps the pause in Walk
 * (a key press cannot capture the mouse) and resumes in Plan, which needs no lock.
 */
export default function PauseMenu({
  view,
  mode,
  evaBegun = false,
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
  onControlsClose,
  onSources,
  onMenu,
  onQuality,
  onEndRequest,
  onEndConfirm,
  onCancel,
}) {
  const resumeRef = useRef(null);
  const backRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    const target = view === 'controls' ? backRef.current : view === 'restart' || view === 'end' ? cancelRef.current : resumeRef.current;
    target?.focus();
    // focusToken lets the menu move focus back to Resume when Escape keeps the pause instead of resuming.
  }, [view, focusToken]);

  const selected = quality && !quality.pending ? (quality.auto ? 'auto' : quality.tier) : null;
  const qualityDisabled = !quality || qualityBusy || quality.pending;

  return (
    <Modal
      labelledBy={view === 'controls' ? 'pause-controls-title' : view === 'menu' ? 'pause-menu-title' : 'pause-confirm-title'}
      className={view === 'controls' ? 'pause-dialog controls-dialog' : 'pause-dialog'}
      onCancel={onCancel}
    >
      {view === 'menu' && (
        <div className="dialog-body">
          <p className="dialog-kicker">Mission clock paused</p>
          <h2 id="pause-menu-title" className="dialog-title">{evaBegun ? 'EVA paused' : 'Planning paused'}</h2>

          <div className="menu-actions">
            <button
              type="button"
              className="ui-button primary menu-resume"
              ref={resumeRef}
              data-autofocus="true"
              onClick={onResume}
              disabled={busy}
            >
              {busy ? (mode === 'plan' ? 'Resuming…' : 'Capturing the mouse…') : 'Resume'}
            </button>
            <button type="button" className="ui-button ghost" onClick={onControls} disabled={busy}>
              Controls
            </button>
            <button type="button" className="ui-button ghost" onClick={onSources} disabled={busy} title="Credits and the data, artistic and modelled sources">
              Sources
            </button>
            <button type="button" className="ui-button ghost" onClick={onRestartRequest} disabled={busy}>
              Restart the EVA
            </button>
            {evaBegun && (
              <button type="button" className="ui-button ghost" onClick={onEndRequest} disabled={busy}>
                End the EVA and go back to the mission table
              </button>
            )}
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
            {qualityError && <p className="dialog-error" role="alert">{qualityError}</p>}
          </div>
        </div>
      )}

      {view === 'controls' && <ControlsPanel titleId="pause-controls-title" onClose={onControlsClose ?? onMenu} closeRef={backRef} />}

      {(view === 'restart' || view === 'end') && (
        <div className="dialog-body">
          <p className="dialog-kicker">{view === 'end' ? 'End the EVA' : 'Restart'}</p>
          <h2 id="pause-confirm-title" className="dialog-title">{view === 'end' ? 'Back to the mission table?' : 'Restart the EVA?'}</h2>
          <p className="dialog-mission" id="confirm-warning">
            {view === 'end'
              ? 'This ends the EVA: your position, alerts, suit and the mission clock reset, and you plan again at the mission table. It cannot be undone.'
              : 'This resets your position, route, alerts, suit and the mission clock, then returns to the start screen. It cannot be undone.'}
          </p>
          <div className="dialog-actions">
            <button type="button" className="ui-button ghost" ref={cancelRef} data-autofocus="true" onClick={onMenu} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="ui-button danger"
              onClick={view === 'end' ? onEndConfirm : onRestartConfirm}
              disabled={busy}
              aria-describedby="confirm-warning"
            >
              {busy ? 'Working…' : view === 'end' ? 'End the EVA' : 'Restart the EVA'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
