import { useState } from 'react';
import EngineView from './components/EngineView.jsx';
import ModeSwitch from './components/ModeSwitch.jsx';
import './App.css';

const HINTS = {
  walk: 'Drag to look · WASD to walk · Shift to jog',
  plan: 'Drag to orbit · scroll to zoom · right-drag to pan',
};

export default function App() {
  const [mode, setMode] = useState('walk');
  const [load, setLoad] = useState({ state: 'loading', text: 'Starting…' });

  return (
    <div className="app">
      <EngineView
        mode={mode}
        onStatus={(text) => { if (text) setLoad({ state: 'loading', text }); }}
        onReady={() => setLoad({ state: 'ready', text: '' })}
        onError={(err) => setLoad({ state: 'error', text: err.message })}
      />

      <header className="topbar">
        <h1>
          Marswalk <span>Cheyava Falls · Neretva Vallis, Jezero crater</span>
        </h1>
        <ModeSwitch mode={mode} onChange={setMode} />
      </header>

      {load.state !== 'ready' && (
        <div className={'overlay ' + load.state} role={load.state === 'error' ? 'alert' : 'status'}>
          {load.state === 'error' ? 'Could not start the scene: ' + load.text : load.text}
        </div>
      )}

      {load.state === 'ready' && <p className="hint">{HINTS[mode]}</p>}
    </div>
  );
}
