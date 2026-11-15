import { useMissionStore, setLayer } from '../../state/store.js';
import { createRedrawScheduler } from '../../hud/minimapRedraw.js';
import { subscribeLanguage } from '../../i18n/index.js';
import { PAGES, rowCount, rowTarget, WRIST_HEIGHT, WRIST_WIDTH } from './layout.js';
import { wristView } from './view.js';
import { drawWrist } from './draw.js';
import { drawWristMap, wristMapView } from './map.js';
import { wristKey } from './keys.js';
import { setWristKeyOwner } from './ownership.js';
import { loadDataFile } from '../../data/dataFiles.js';
import { SHELTERS_PATH } from '../../sim/shelters.js';
import { WALK_LAYERS, walkRow } from '../../plan/layers.js';

/** Connect after engine.ready; owns one canvas and cleans up before engine disposal. */
export function connectWrist(engine, store = useMissionStore) {
  const canvas = document.createElement('canvas');
  canvas.width = WRIST_WIDTH; canvas.height = WRIST_HEIGHT;
  const g = canvas.getContext('2d');
  // The layers page lists only the layers the ground draws (layers.js WALK_LAYERS): a row is not a store index.
  let pageIndex = 0, row = walkRow(store.getState().view.layer), open = false, painted = '', disposed = false;
  let shelters = [], resourceVersion = 0, qHeld = false;
  const diagnostics = { canvas, snapshot: () => ({ open, page: PAGES[pageIndex], row, draws: Number(canvas.dataset.drawCount ?? 0), engine: engine.getWristState() }) };
  if (import.meta.env.DEV) window.__marswalkWrist = diagnostics;
  engine.setWristScreen(canvas);
  const scheduler = createRedrawScheduler({ draw() {
    if (disposed) return;
    const state = store.getState(), page = PAGES[pageIndex];
    const model = wristView(state, page, row);
    const map = page === 'map' ? wristMapView(state) : null;
    const signature = JSON.stringify([model, map, page === 'map' ? resourceVersion : 0]);
    if (signature === painted) return;
    painted = signature;
    drawWrist(g, model);
    if (map) drawWristMap(g, map, engine.getOrthoImage(), shelters);
    engine.invalidateWristScreen();
    canvas.dataset.drawCount = String(Number(canvas.dataset.drawCount ?? 0) + 1);
    canvas.dataset.page = page;
    canvas.dataset.row = String(row);
  } });
  const sync = (state) => {
    if (state.mode !== 'walk' || state.mission.paused) {
      if (open) engine.setWristOpen(false);
      open = false;
      setWristKeyOwner(false);
    }
    if (open) scheduler.request('store');
  };
  const off = store.subscribe(sync);
  const onKey = (event) => {
    const state = store.getState();
    // A sources screen or a modal always owns the keyboard. A reading card yields to the wrist while it is
    // up, and keeps the keyboard while the wrist is down (#231).
    if (state.mode !== 'walk' || state.mission.paused
      || document.querySelector('.sources, [role="dialog"], [aria-modal="true"]')) return;
    if (!open && document.querySelector('.stop-card-walk')) return;
    if (event.code === 'KeyQ') qHeld = true;
    const action = wristKey(event, open, { qHeld });
    if (!action) return;
    event.preventDefault();
    if (action === 'toggle') {
      if (engine.setWristOpen(!open)) {
        open = !open;
        setWristKeyOwner(open);
      }
    } else if (action.endsWith('page')) {
      pageIndex = (pageIndex + (action === 'next-page' ? 1 : PAGES.length - 1)) % PAGES.length;
      row = PAGES[pageIndex] === 'layers' ? walkRow(state.view.layer) : 0;
    } else if (action.endsWith('row')) {
      const count = rowCount(PAGES[pageIndex]);
      row = (row + (action === 'next-row' ? 1 : count - 1)) % count;
    } else if (action === 'confirm') {
      if (PAGES[pageIndex] === 'layers') setLayer(WALK_LAYERS[row].index);
      engine.setWristPointer({ ...rowTarget(PAGES[pageIndex], row), pressed: true });
    }
    if (open) {
      if (action !== 'confirm') engine.setWristPointer({ ...rowTarget(PAGES[pageIndex], row), pressed: false });
      scheduler.request('key');
    }
  };
  const onKeyUp = (event) => { if (event.code === 'KeyQ') qHeld = false; };
  const onBlur = () => { qHeld = false; };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  const offLanguage = subscribeLanguage(() => scheduler.request('language'));
  loadDataFile(SHELTERS_PATH)   // shared with the HUD minimap and the planner (#205)
    .then(data => {
      if (disposed) return;
      shelters = (data.shelters ?? []).filter(s => Number.isFinite(s.x) && Number.isFinite(s.z));
      resourceVersion++;
      if (open && PAGES[pageIndex] === 'map') scheduler.request('shelters');
    }).catch(() => {});
  scheduler.request('init');
  return () => {
    disposed = true; off(); offLanguage(); scheduler.dispose();
    setWristKeyOwner(false);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    if (import.meta.env.DEV && window.__marswalkWrist === diagnostics) delete window.__marswalkWrist;
    engine.setWristOpen(false); engine.setWristScreen(null);
  };
}
