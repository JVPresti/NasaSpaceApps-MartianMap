import { useEffect } from 'react';
import { handleShortcut } from './shortcuts.js';

/** Disabled while loading or recovering from an engine failure, like the topbar. */
export function useShortcuts(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [enabled]);
}
