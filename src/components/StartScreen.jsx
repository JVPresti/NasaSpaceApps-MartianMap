import { useState } from 'react';
import homeMp4 from '../assets/ui/home.mp4';
import homeWebm from '../assets/ui/home.webm';
import poster from '../assets/ui/surface.webp';
import { ControlsPanel } from './ControlsHelp.jsx';
import Modal from './Modal.jsx';

/**
 * The start screen (#11): the title over a looping video of an astronaut walking on Mars (AI-generated, credited in
 * Sources as artistic; the first frame is the poster and stays still with reduced motion) and one main action, which opens the mission table.
 * Controls and Sources are secondary. It is a modal dialog, so the scene behind it is inert (App also hides the top
 * bar and the table while it is open). Nothing runs behind it: the EVA's clock, suit and events start at Begin EVA.
 */
export default function StartScreen({ busy, notice, onStart, onSources }) {
  const [controls, setControls] = useState(false);

  return (
    <Modal labelledBy={controls ? 'start-controls-title' : 'start-title'} className={controls ? 'start-dialog showing-controls' : 'start-dialog'} onCancel={() => setControls(false)}>
      {controls ? (
        <div className="start-controls">
          <ControlsPanel titleId="start-controls-title" onClose={() => setControls(false)} />
        </div>
      ) : (
        <>
        <video className="start-video" autoPlay muted loop playsInline preload="auto" poster={poster} aria-hidden="true" tabIndex={-1}>
          <source src={homeWebm} type="video/webm" />
          <source src={homeMp4} type="video/mp4" />
        </video>
        <div className="start-shade" aria-hidden="true" />
        <div className="start-layout">
          <div className="start-hero">
            <p className="start-kicker">Marswalk</p>
            <h2 id="start-title" className="start-title">Cheyava Falls</h2>
            <p className="start-text">
              Neretva Vallis, Jezero crater, Mars. Plan a walk across real Mars terrain to the rock where Perseverance found
              a potential biosignature, then walk it in a suit that runs out of oxygen.
            </p>

            {notice && <p className="dialog-notice" role="alert">{notice}</p>}

            <div className="start-actions">
              <button type="button" className="start-primary" onClick={onStart} disabled={busy} data-autofocus="true">
                {busy ? 'Opening…' : 'Open the mission table'}
              </button>
              <button type="button" className="ui-button ghost" onClick={() => setControls(true)}>Controls</button>
              {onSources && <button type="button" className="ui-button ghost" onClick={onSources}>Sources</button>}
            </div>
          </div>
          <p className="start-credit">Video: AI-generated illustration of an EVA · Terrain data: HiRISE, NASA/JPL-Caltech/University of Arizona · NASA Space Apps 2026</p>
        </div>
        </>
      )}
    </Modal>
  );
}
