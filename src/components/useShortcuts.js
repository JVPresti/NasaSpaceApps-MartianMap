import { useEffect } from 'react';
import { handleShortcut } from './shortcuts.js';

/**
 * Disabled while loading or recovering from an engine failure, like the topbar.
 * `onMode` is the mode button's handler, so M takes the same path as a click (#174).
 */
export function useShortcuts(enabled, onMode) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event) => handleShortcut(event, onMode ? { onMode } : undefined);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onMode]);
}
