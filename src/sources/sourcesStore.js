import { create } from 'zustand';
import { codeOf } from '../input/actions.js';

/**
 * Open state of the sources screen. It lives in its own small store so any
 * part of the app (Plan mode, a future debrief, the keyboard shortcut) can open
 * it without passing props through App.
 */
export const useSourcesStore = create(() => ({ open: false }));

export const openSources = () => useSourcesStore.setState({ open: true });
export const closeSources = () => useSourcesStore.setState({ open: false });

/** Key that toggles the screen. KeyC ("credits") is free in both modes: the engine uses WASD, arrows and Shift. */
export const SOURCES_KEY = codeOf('sources');
