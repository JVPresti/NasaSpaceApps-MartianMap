import { useSyncExternalStore } from 'react';
import { t } from '../i18n/index.js';
import { getAudioSettings, setAudioSettings, subscribeAudioSettings } from './settings.js';
import './audio.css';

/** Mute and volume for the suit audio (#72), in the pause menu. Both are remembered (settings.js). */
export default function AudioSettings() {
  const { muted, volume } = useSyncExternalStore(subscribeAudioSettings, getAudioSettings, getAudioSettings);
  return (
    <div className="audio-block">
      <h3 id="audio-label">{t('audio.title')}</h3>
      <div className="audio-row" role="group" aria-labelledby="audio-label" aria-describedby="audio-help">
        <button type="button" className={muted ? 'on' : undefined} aria-pressed={muted} onClick={() => setAudioSettings({ muted: !muted })}>
          {muted ? t('audio.unmute') : t('audio.mute')}
        </button>
        <label className="audio-volume">
          <span>{t('audio.volume')}</span>
          <input
            type="range" min="0" max="100" step="5"
            value={Math.round(volume * 100)}
            disabled={muted}
            onChange={(e) => setAudioSettings({ volume: Number(e.target.value) / 100 })}
          />
        </label>
      </div>
      <p id="audio-help" className="menu-note">{t('audio.help')}</p>
    </div>
  );
}
