import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { catalogs, setLanguage } from '../i18n/index.js';
import { bootOnline, getOnlineController, resetOnlineController } from '../onlineLink.js';
import { createInitialState, resetStore, useMissionStore } from '../state/store.js';
import PauseMenu from '../components/PauseMenu.jsx';
import { BeginButton } from '../plan/MissionTable.jsx';
import { CrewTab, OnlineIssue } from './CrewPanel.jsx';
import OnlineStart from './JoinPanel.jsx';
import RoomBadge from './RoomBadge.jsx';
import { tabAfterRoom } from './hooks.js';

// SSR reads a Zustand store's creation-time state; render the current one instead, as src/i18n/interface.test.jsx does.
vi.mock('../state/store.js', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, useMissionStore: Object.assign((selector) => selector(original.useMissionStore.getState()), original.useMissionStore) };
});
vi.mock('../onlineLink.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useOnlineSession: (selector) => selector((original.getOnlineController()?.session ?? { getState: () => original.initialSession(null) }).getState()),
  };
});

const fakeNet = () => ({
  getPlayerName: () => 'Crew 1234', setPlayerName: (n) => n, newPlayerId: () => 'x',
  startOnline: ({ code }) => {
    useMissionStore.setState((s) => ({ online: { ...s.online, code, status: 'connecting' } }));
    return { start: () => true, stop: () => useMissionStore.setState({ online: createInitialState().online }) };
  },
});
const loc = () => ({ location: { href: 'http://localhost:8787/', host: 'localhost:8787' }, history: { state: null, replaceState: () => {} } });
const boot = (search) => bootOnline({ search, store: useMissionStore, load: () => Promise.resolve(fakeNet()), warn: () => {}, storage: null, ...loc() });
const flush = () => new Promise((r) => setTimeout(r, 0));
const online = (fields) => useMissionStore.setState((s) => ({ online: { ...s.online, ...fields } }));
const start = () => renderToStaticMarkup(<OnlineStart onStart={() => {}}><button type="button">Open the mission table</button></OnlineStart>);

beforeEach(() => vi.stubGlobal('location', { host: 'localhost:8787', search: '' }));
afterEach(() => { getOnlineController()?.leave(); resetOnlineController(); resetStore(); useMissionStore.setState({ online: createInitialState().online, mode: 'plan' }); setLanguage('en'); vi.unstubAllGlobals(); });

describe('start screen', () => {
  it('without a code: the normal actions and a secondary Play online', () => {
    boot('');
    const html = start();
    expect(html).toContain('Open the mission table');
    expect(html).toContain('Play online');
    expect(html).not.toContain('Join the room');
  });

  it('Play online shows the code field, Open the room and New code', () => {
    boot('').openPicker();
    const html = start();
    expect(html).toContain('Room code');
    expect(html).toContain('Open the room');
    expect(html).toContain('New code');
    expect(html).not.toContain('Open the mission table');
  });

  it('a bad code in the link: a clear message, and the offline game still starts', () => {
    boot('?room=IOIO');
    const html = start();
    expect(html).toContain('&quot;IOIO&quot; is not a room code');
    expect(html).toContain('Open the mission table');
  });

  it('a valid code: loading, then the join panel with code, host, name, seats and one main action', async () => {
    const c = boot('?room=ABCD');
    expect(start()).toContain('Loading online play…');
    await flush();
    const html = start();
    for (const text of ['ABCD', 'on localhost:8787', 'Your name', 'value="Crew 1234"', 'Surface crew', 'Habitat', '4 seats', '2 seats', 'Join the room', 'Leave and play solo']) expect(html).toContain(text);
    expect(html.match(/class="start-primary"/g)).toHaveLength(1);
    expect(html).not.toContain('Open the mission table');
    await c.join();
    expect(start()).toContain('Joining…');
  });

  it('room full: says which seat is full and offers the other one', async () => {
    const c = boot('?room=ABCD');
    await c.join();
    online({ status: 'closed', closeCode: 4001 });
    const html = start();
    expect(html).toContain('Surface crew is full: all 4 seats are taken');
    expect(html).toContain('Join as Habitat');
    expect(html).toContain('Full');
  });

  it('renders in Spanish', async () => {
    boot('?room=ABCD');
    await flush();
    setLanguage('es');
    const html = start();
    for (const text of ['Sala en línea', 'Equipo de superficie', 'Hábitat', 'Entrar en la sala', 'Salir y jugar solo']) expect(html).toContain(text);
  });
});

describe('crew tab and badge', () => {
  const crew = [
    { id: 'me', name: 'Ana', color: 2, role: 'surface', joinedAt: 1 },
    { id: 'b', name: 'Beto', color: 0, role: 'surface', joinedAt: 2 },
    { id: 'h', name: 'Hab', color: null, role: 'habitat', joinedAt: 3 },
  ];

  it('renders nothing online offline', () => {
    expect(renderToStaticMarkup(<RoomBadge />)).toBe('');
    expect(renderToStaticMarkup(<OnlineIssue />)).toBe('');
  });

  it('lists the crew with swatches, roles and you, and the room with its status', () => {
    online({ code: 'ABCD', status: 'open', me: crew[0], crew, rttMs: 41.6 });
    const html = renderToStaticMarkup(<CrewTab map={<div />} actions={null} />);
    for (const text of ['ABCD', 'on localhost:8787', 'Online', 'Ana', 'Beto', 'Hab', 'Surface crew', 'Habitat', '>you<', 'Round trip to the room: 42 ms']) expect(html).toContain(text);
    expect(html).toContain('background:rgb(26 204 77)');     // PLAYER_COLORS[2]
    expect(html.match(/online-swatch none/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<RoomBadge />)).toContain('<code>ABCD</code>');
    online({ status: 'connecting' });
    expect(renderToStaticMarkup(<RoomBadge />)).toContain('Connecting');
  });

  it('close codes and offline: replaced, full and offline messages', () => {
    online({ code: 'ABCD', status: 'closed', closeCode: 4002 });
    let html = renderToStaticMarkup(<OnlineIssue />);
    expect(html).toContain('This player joined from another tab.');
    expect(html).toContain('Join as a new player');
    online({ closeCode: 4001 });
    expect(renderToStaticMarkup(<OnlineIssue />)).toContain('Surface crew is full');
    online({ status: 'offline', closeCode: null });
    html = renderToStaticMarkup(<OnlineIssue />);
    expect(html).toContain('Offline: playing solo, retrying');
    // offline keeps Leave, so a habitat seat is never locked at the table until a reload
    expect(html).toContain('Leave and play solo');
    expect(html).not.toContain('Join as');
  });
});

describe('the habitat seat and the pause menu online', () => {
  const planner = { status: 'ready', error: null, replan: () => {} };
  const totals = { status: 'nominal' };

  it('a habitat seat sees the note instead of Begin EVA', async () => {
    useMissionStore.setState((s) => ({ route: { ...s.route, path: [[0, 0], [1, 1]] } }));
    expect(renderToStaticMarkup(<BeginButton planner={planner} totals={totals} onBeginEva={() => {}} />)).toContain('Begin EVA');
    online({ code: 'ABCD', status: 'open', me: { id: 'h', name: 'H', color: null, role: 'habitat', joinedAt: 1 } });
    const html = renderToStaticMarkup(<BeginButton planner={planner} totals={totals} onBeginEva={() => {}} />);
    expect(html).not.toContain('Begin EVA');
    expect(html).toContain('The habitat seat stays at this table');
  });

  it('no pause online: the menu still opens and says the clock keeps running', () => {
    const props = { view: 'menu', mode: 'walk', busy: false, focusToken: 0, quality: null, onResume() {}, onRestartRequest() {}, onRestartConfirm() {}, onControls() {}, onSources() {}, onMenu() {}, onQuality() {}, onCancel() {} };
    expect(renderToStaticMarkup(<PauseMenu {...props} />)).toContain('EVA paused');
    // the room's start, as src/online/clockSync.js turns it into mission.sharedStartMs
    useMissionStore.setState((s) => ({ online: { ...s.online, code: 'ABCD', status: 'open', startedAtMs: 1000, offsetMs: 0 }, mission: { ...s.mission, sharedStartMs: 1000 } }));
    const html = renderToStaticMarkup(<PauseMenu {...props} />);
    expect(html).toContain('Online the mission clock and the events keep running while this menu is open.');
    expect(html).not.toContain('EVA paused');
    expect(html).toContain('Language');
  });
});

describe('the Crew tab after Leave', () => {
  it('goes back to the first step when the room is gone, and stays put otherwise', () => {
    const tabs = [{ id: 'site' }, { id: 'route' }];
    expect(tabAfterRoom(false, 'crew', tabs)).toBe('site');
    expect(tabAfterRoom(true, 'crew', tabs)).toBeNull();
    expect(tabAfterRoom(false, 'route', tabs)).toBeNull();
  });
});

describe('i18n', () => {
  it('every online key is in both languages', () => {
    const en = Object.keys(catalogs.en).filter((k) => k.startsWith('online.'));
    expect(en.length).toBeGreaterThan(40);
    for (const key of en) expect(catalogs.es[key], key).toBeTruthy();
  });
});
