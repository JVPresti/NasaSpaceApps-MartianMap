// The engine the app is running now, for code that starts outside React (online play, #53). EngineView sets it
// once the engine is ready and clears it on dispose. Plain JavaScript: no React, no three.js.
let current = null;

/** @param {object | null} engine */
export function setCurrentEngine(engine) { current = engine || null; }

/** Clears the engine only if it is still the current one (a disposed StrictMode engine must not clear the live one). */
export function clearCurrentEngine(engine) { if (current === engine) current = null; }

/** The ready engine, or null. */
export const getCurrentEngine = () => current;
