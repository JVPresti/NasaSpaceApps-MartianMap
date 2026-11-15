import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLanguage } from './index.js';
import ModeSwitch from '../components/ModeSwitch.jsx';
import HabitatHud from '../habitat/HabitatHud.jsx';
import AirlockCycle from '../habitat/AirlockCycle.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import LayerPanel from '../plan/LayerPanel.jsx';
import EventBanner from '../events/EventBanner.jsx';
import SamplingPanel from '../hud/SamplingPanel.jsx';
import { formatNavLine } from '../hud/format.js';
import { resetStore, useMissionStore } from '../state/store.js';

// Render a populated mission snapshot in SSR (Zustand normally uses the creation-time state).
vi.mock('../state/store.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useMissionStore: Object.assign((selector) => selector(original.useMissionStore.getState()), original.useMissionStore),
  };
});

afterEach(() => { setLanguage('en'); resetStore(); vi.restoreAllMocks(); });

it('renders the existing modes, legends, sampling, navigation and active alerts in either language', () => {
  useMissionStore.setState({
    alerts: { storm: { active: true, eventId: 'dust-storm', level: 'warning', text: 'Dust storm: opacity rising. Return to the habitat.' } },
    habitat: { zone: 'main' },
  });
  const ui = () => renderToStaticMarkup(<>
    <ModeSwitch mode="walk" onChange={() => {}} />
    <HabitatHud />
    <AirlockCycle running />
    <LayerPanel layer={1} onLayer={() => {}} radioShadow={false} onRadioShadow={() => {}} />
    <SamplingPanel />
    <EventBanner />
  </>);
  expect(ui()).toContain('Map layers');
  setLanguage('es');
  const spanish = ui();
  for (const label of ['Modo Plan', 'Modo Caminar', 'Hábitat', 'Despresurizando', 'Capas del mapa', 'Terreno', 'MUESTREO', 'Vuelve al hábitat']) expect(spanish).toContain(label);
  expect(spanish).not.toContain('Map layers');
  expect(formatNavLine({ errorM: 0.4, fixMode: 'terrain fix', lastFixSec: 0 }, 180)).toBe('NAV · fijación con el terreno · ±0,4 m · hace 3 min');
  setLanguage('en');
  expect(ui()).toContain('Map layers');
});

it('translates an existing load failure and preserves the failed file name', () => {
  const state = { status: 'error', progress: 0.5, error: { code: 'ASSET_LOAD_FAILED', file: 'assets/terrain.json' } };
  const ui = () => renderToStaticMarkup(<LoadingScreen state={state} site="Cheyava Falls" onRetry={() => {}} />);
  expect(ui()).toContain('Could not load assets/terrain.json');
  setLanguage('es');
  expect(ui()).toContain('No se pudo cargar assets/terrain.json');
  expect(ui()).toContain('Reintentar');
});
