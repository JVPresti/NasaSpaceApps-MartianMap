import ControlsHelp from './ControlsHelp.jsx';
import Modal from './Modal.jsx';

/**
 * The post-loading start screen. It is a modal dialog, so the scene and top bar behind it are inert.
 * Start captures the mouse in the click itself; the app resumes the mission only after the lock is real.
 */
export default function StartScreen({ mode = 'walk', busy, notice, onStart }) {
  return (
    <Modal labelledBy="start-title" className="start-dialog" onCancel={() => {}}>
      <div className="dialog-body">
        <p className="dialog-kicker">Marswalk</p>
        <h2 id="start-title" className="dialog-title">Cheyava Falls</h2>
        <p className="dialog-site">Neretva Vallis · Jezero crater · Mars</p>

        <p className="dialog-mission">
          Walk to Cheyava Falls and sample the science target in Neretva Vallis, on the floor of Jezero crater.
          Plan the route at the habitat, then switch to Walk: your EVA starts at the airlock, 785 m from the rock in a straight line.
        </p>
        <p className="dialog-source">
          Start position SIM: the foot of the habitat airlock steps, x 535 m east, z 574 m south of Cheyava Falls (HAB entry in shelters.json). Site 18.4975 N, 77.3053 E (DATA: Mars 2020 Perseverance waypoint, sol 1210).
        </p>

        <ControlsHelp />

        {notice && <p className="dialog-notice" role="alert">{notice}</p>}

        <div className="dialog-actions">
          <button type="button" className="ui-button primary" onClick={onStart} disabled={busy} data-autofocus="true">
            {busy ? (mode === 'plan' ? 'Opening…' : 'Capturing the mouse…') : mode === 'plan' ? 'Start in Plan view' : 'Start EVA'}
          </button>
        </div>
        <p className="dialog-footnote">
          {mode === 'plan'
            ? 'Plan view resumes without capturing the mouse. The mission clock and suit stay paused behind this screen.'
            : 'Start captures the mouse for looking around. The mission clock and suit stay paused behind this screen.'}
        </p>
      </div>
    </Modal>
  );
}
