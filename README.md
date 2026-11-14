# NasaSpaceApps-MartianMap

## Contributing

All changes go through an issue and a reviewed pull request. Nobody pushes directly to `main`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and the naming conventions.

## Testing

Use Node.js `^22.12.0`, `^24`, or `>=26`, as required by Vitest 5.

Run the suite once with `npm test` (`vitest run`, no watch mode). Vitest reuses `vite.config.js`, so there is no separate test config.

Tests are required for critical logic: the engine and simulation (cost grid, route planner, re-planning and event engine), models (suit, oxygen and time), and computed animation or timing. Test behaviour and results, such as a route avoiding blocked cells or an event firing at the right mission time.

Tests are not needed for static text, labels, copy, sizes, styling, layout values, trivial getters or pass-through code.

When a module needs tests, put plain JavaScript unit tests next to it (`name.js` and `name.test.js`), with no browser, visual or React rendering tests. For example, `src/sim/heightGrid.js` is tested by `src/sim/heightGrid.test.js`.
