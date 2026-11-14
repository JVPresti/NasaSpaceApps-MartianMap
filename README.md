# NasaSpaceApps-MartianMap

## Contributing

All changes go through an issue and a reviewed pull request. Nobody pushes directly to `main`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and the naming conventions.

## Testing

Use Node.js `^22.12.0`, `^24`, or `>=26`, as required by Vitest 5.

Run the suite once with `npm test` (`vitest run`, no watch mode). Vitest reuses `vite.config.js`, so there is no separate test config.

Tests sit next to the code they cover: `src/sim/heightGrid.js` is tested by `src/sim/heightGrid.test.js`. Add a `*.test.js` file beside each pure JavaScript helper under `src/sim/`; keep tests plain JavaScript with no browser, visual or React rendering tests.
