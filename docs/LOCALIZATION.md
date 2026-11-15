# Interface languages

The interface supports English (`en`, the default) and Spanish (`es`). Open Pause (or press Esc) to change the language. The selection updates the interface immediately and is stored in `localStorage` under `marswalk.language`. Blocked storage leaves a working session-only preference. The document's `lang` follows the selection.

Add named entries to both `src/i18n/en.json` and `src/i18n/es.json`, then call `t(key, values)` from the interface. Use placeholders for variable content, for example `t('files', { loaded, total })`. Keep technical identifiers, store state values and keyboard event codes unchanged. Missing keys display the key and log a warning.

Use `formatNumber(value, digits)` and `formatUnit(value, symbol, digits)` for displayed numbers and SI units. Unknown numbers display a dash. English uses a decimal point and Spanish a comma; rounding follows the previous interface's `toFixed` rule. Input values, coordinates in data and machine-readable strings retain their numeric representation.

`App` subscribes through `useLanguage()` and renders the interface again without remounting the engine or resetting the mission. Module-level label metadata uses getters to resolve text at render time. Canvas consumers subscribe with `subscribeLanguage()` to request a redraw and unsubscribe on disposal.

`translateText` adapts known English engine/event messages and external metadata at the display boundary. Simulation state stays language-independent. Unknown text passes through: scientific stop content, image descriptions, provenance records and credit lines remain in their original data files (#37), outside the scope of #65. NASA names, DATA/DERIVED/SIM tags and SI symbols keep their spelling.

Run `npm test -- src/i18n` for catalog completeness, placeholder parity, preferences, fallback behavior and interface rendering in both languages.
