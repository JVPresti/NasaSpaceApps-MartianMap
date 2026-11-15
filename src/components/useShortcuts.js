import { useEffect } from 'react';
import { handleShortcut } from './shortcuts.js';

/**
 * Layer and visor keys. App turns them on where they apply: on the surface and at the mission table, never while
 * loading, behind a menu or walking in the habitat (habitat-first flow).
 */
export function useShortcuts(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [enabled]);
}
