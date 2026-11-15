import { useEffect } from 'react';
import { handleShortcut } from './shortcuts.js';

/** Data layer keys. App turns them on where a layer shows: on the surface and at the mission table. */
export function useShortcuts(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [enabled]);
}
