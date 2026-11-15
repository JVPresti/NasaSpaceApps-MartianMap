// The habitat's five wall screens and its planning table (#47), drawn from mission data.
// The data comes from the store through engine.setHabitatScreens (src/state/habitatScreens.js); this file only draws it.
//   - wall screens: one 1024 px canvas mapped onto the 'HabitatScreens' mesh, one cell per screen (habitat.json
//     "screens"). Redrawn 4 times a second, only while the camera is near the habitat.
//   - planning table: the terrain photo tinted like a display, the current route, the visited waypoints, the player and
//     the shelter. Redrawn only when one of those changes.
// A value the store does not have yet shows as a dash, never as an invented number. Each value shows its source tag.
import * as THREE from 'three';
import { t, translateText, formatUnit } from '../i18n/index.js';

const CELLS = { life: [0, 0, 512, 341], eva: [512, 0, 512, 341], weather: [0, 341, 512, 341], airlock: [512, 341, 512, 282], door: [0, 682, 512, 341] };
const BLUE = '#8fe9ff', AMBER = '#ffc56b', GREEN = '#7dff9a', RED = '#ff5a3c', DARK = '#03222b', DARK_AMBER = '#2b1a03', DARK_DOOR = '#062a33';
const DRAW_EVERY_S = 0.25;
const TABLE_PX = 512;
const font = (px, bold) => (bold ? 'bold ' : '') + px + 'px ui-monospace, Menlo, Consolas, monospace';
const fin = Number.isFinite;

function clockText(sec) {
  if (!fin(sec)) return '--:--';
  const m = Math.floor(sec / 60), h = Math.floor(m / 60);
  return (h ? h + ':' + String(m % 60).padStart(2, '0') : String(m)) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
}

export function createHabitatScreens(ctx) {
  const { sys } = ctx;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
  let data = null, since = DRAW_EVERY_S, clock = 0;

  // ---- drawing helpers, in the coordinates of one cell
  function frame(cell, title, fg, bg, tag) {
    const [x, y, w, h] = cell;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.globalAlpha = 0.16; g.fillRect(0, 0, w, 46); g.globalAlpha = 1;
    g.font = font(26, true); g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(translateText(title), 16, 24, w - 110);
    if (tag) { g.font = font(15, true); g.textAlign = 'right'; g.globalAlpha = 0.75; g.fillText(tag, w - 16, 24); g.globalAlpha = 1; }
    g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 2; g.strokeRect(5, 5, w - 10, h - 10); g.globalAlpha = 1;
    return [w, h];
  }
  // a labelled bar; value null draws a dash and an empty bar
  function bar(x, y, w, label, value, unit, digits, frac, fg, tag, warn) {
    g.font = font(20); g.fillStyle = fg; g.textAlign = 'left'; g.fillText(translateText(label), x, y);
    g.textAlign = 'right';
    g.fillText(fin(value) ? formatUnit(value, unit, digits) : '—', x + w - (tag ? 46 : 0), y);
    if (tag) { g.font = font(13, true); g.globalAlpha = 0.7; g.fillText(tag, x + w, y); g.globalAlpha = 1; }
    g.globalAlpha = 0.22; g.fillRect(x, y + 14, w, 12); g.globalAlpha = 1;
    if (fin(value) && fin(frac)) { g.fillStyle = warn || fg; g.fillRect(x, y + 14, w * Math.min(1, Math.max(0, frac)), 12); }
  }
  const line = (text, x, y, color, px = 17, align = 'left') => { g.font = font(px); g.fillStyle = color; g.textAlign = align; g.fillText(text, x, y); };

  function drawLife(d) {
    const c = d.cabin;
    frame(CELLS.life, t('ui.life.support'), BLUE, DARK, c.tag);
    bar(20, 78, 300, 'O2', c.o2Pct, '%', 1, c.o2Pct / 25, BLUE);
    bar(20, 130, 300, 'CO2', c.co2Pct, '%', 3, c.co2Pct / 0.5, BLUE);
    bar(20, 182, 300, t('pressure'), c.pressureKPa, 'kPa', 1, c.pressureKPa / 101.3, BLUE);
    bar(20, 234, 300, t('cabin'), c.tempC, 'C', 1, (c.tempC + 10) / 50, BLUE);
    g.fillStyle = GREEN; g.beginPath(); g.arc(420, 140, 44, 0, 7); g.fill();
    g.fillStyle = DARK; g.font = font(22, true); g.textAlign = 'center'; g.fillText(t('ok'), 420, 141);
    const m = d.mission;
    line((fin(m.sol) ? 'SOL ' + m.sol + '  ' : '') + (m.lmst ? m.lmst + ' LMST' : ''), 20, 285, BLUE);
    line(t('habitat.cabin.note'), 20, 312, BLUE, 14);
    g.restore();
  }

  function drawTeam(d) {
    frame(CELLS.eva, t('ui.eva.team'), BLUE, DARK, d.team.find((m) => m.tag)?.tag);
    d.team.slice(0, 2).forEach((m, k) => {
      const y = 70 + k * 120;
      g.fillStyle = '#ffffff'; g.font = font(24, true); g.textAlign = 'left'; g.fillText(m.name, 20, y + 6);
      bar(90, y, 240, t('suitO2'), m.o2Pct, '%', 0, m.o2Pct / 100, BLUE, null, fin(m.o2Pct) && m.o2Pct < 25 ? RED : null);
      bar(90, y + 50, 240, t('battery'), m.batteryPct, '%', 0, m.batteryPct / 100, BLUE, null, fin(m.batteryPct) && m.batteryPct < 20 ? RED : null);
      if (k === 0) {   // the player: effort and walkback margin from the suit model
        line(t('habitat.effort'), 350, y, BLUE, 16); line(fin(m.metabolicW) ? Math.round(m.metabolicW) + ' W' : '—', 492, y, '#ffffff', 20, 'right');
        const low = fin(m.marginSec) && m.marginSec < 15 * 60;
        line(t('habitat.margin'), 350, y + 50, BLUE, 16); line(fin(m.marginSec) ? Math.round(m.marginSec / 60) + ' min' : '—', 492, y + 50, low ? RED : GREEN, 20, 'right');
      } else {         // the partner: range and separation from the partner runner
        const far = m.separation && m.separation !== 'nominal';
        line(t('habitat.range'), 350, y, BLUE, 16); line(fin(m.rangeM) ? Math.round(m.rangeM) + ' m' : '—', 492, y, far ? AMBER : '#ffffff', 20, 'right');
      }
    });
    if (d.team.length < 2) line('EV2  ' + t('habitat.noData'), 20, 205, BLUE, 18);
    line('EVA T+' + clockText(d.mission.elapsedSec), 20, 318, BLUE);
    g.restore();
  }

  function drawWeather(d, blink) {
    const w = d.weather;
    frame(CELLS.weather, t('weather'), AMBER, DARK_AMBER, w.tags.tempC);
    const dusty = fin(w.tau) && w.tau > 1;
    bar(20, 70, 300, t('ui.dust.tau'), w.tau, '', 2, (w.tau ?? 0) / 8, AMBER, w.tags.tau, dusty ? RED : null);
    bar(20, 116, 300, t('wind'), w.windMs, 'm/s', 0, (w.windMs ?? 0) / 30, AMBER, w.tags.windMs);
    bar(20, 162, 300, t('temperature'), w.tempC, 'C', 0, ((w.tempC ?? -100) + 100) / 120, AMBER, w.tags.tempC);
    bar(20, 208, 300, t('pressure'), w.pressurePa, 'Pa', 0, (w.pressurePa ?? 0) / 1000, AMBER, w.tags.pressurePa);
    bar(340, 70, 150, t('habitat.dose'), w.doseRateUgyH, 'µGy/h', 0, (w.doseRateUgyH ?? 0) / 100, AMBER, null);
    if (w.source) line(w.source, 20, 252, AMBER, 13);
    if (w.doseSource) line(w.doseSource, 340, 112, AMBER, 11);
    // the banner: an active alert blinks red; the dust storm puts the EVA on hold
    const alarm = d.stormHold || (d.alert && d.alert.level !== 'info');
    if (alarm && blink) { g.fillStyle = RED; g.fillRect(14, 282, 484, 44); }
    const text = d.stormHold ? t('ui.dust.storm.eva.hold') : d.alert ? translateText(d.alert.text) : t('ui.eva.window.open');
    g.fillStyle = alarm ? (blink ? DARK_AMBER : RED) : GREEN; g.font = font(alarm && !d.stormHold ? 17 : 22, true); g.textAlign = 'center';
    g.fillText(text, 256, 305, 470);
    g.restore();
  }

  function drawAirlock(open) {
    frame(CELLS.airlock, t('airlock'), BLUE, DARK);
    bar(20, 82, 472, t('chamber'), open ? 0.7 : 70.3, 'kPa', 1, open ? 0.01 : 0.7, BLUE);
    g.font = font(24, true); g.textAlign = 'left'; g.fillStyle = open ? AMBER : GREEN;
    g.fillText(t('outerHatch') + (open ? t('ui.open') : t('habitat.sealed')), 20, 160);
    g.fillStyle = GREEN; g.fillText(t('ui.inner.hatch.open'), 20, 200);
    line(open ? t('ui.vented.to.mars.ambient') : t('ui.equalised.with.cabin'), 20, 245, BLUE, 18);
    g.restore();
  }

  function drawDoor(open, blink) {
    frame(CELLS.door, t('hatch'), BLUE, DARK_DOOR);
    g.fillStyle = open ? AMBER : GREEN; g.globalAlpha = blink || !open ? 1 : 0.4; g.beginPath(); g.arc(110, 190, 62, 0, 7); g.fill(); g.globalAlpha = 1;
    g.fillStyle = DARK_DOOR; g.font = font(24, true); g.textAlign = 'center'; g.fillText(open ? t('ui.wait') : t('ui.safe'), 110, 191);
    [[t('ui.cycle'), 80], [t('ui.open'), 165], [t('ui.lock'), 250]].forEach(([label, y]) => {
      g.strokeStyle = BLUE; g.lineWidth = 3; g.strokeRect(230, y, 250, 64); g.fillStyle = BLUE; g.font = font(26, true); g.fillText(translateText(label), 355, y + 33);
    });
    g.restore();
  }

  function draw() {
    if (!data) return;
    const blink = Math.floor(clock * 2) % 2 === 0, open = sys.habitat.open > 0.5;
    drawLife(data); drawTeam(data); drawWeather(data, blink); drawAirlock(open); drawDoor(open, blink);
    tex.needsUpdate = true;
  }

  // ---- planning table
  const table = (() => {
    const c = document.createElement('canvas'); c.width = c.height = TABLE_PX;
    const tg = c.getContext('2d'), ttex = new THREE.CanvasTexture(c); ttex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.535, 48), new THREE.MeshBasicMaterial({ map: ttex, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2;
    let key = null;
    const mp = (x, z) => [(x / ctx.T.W + 0.5) * TABLE_PX, (z / ctx.T.H + 0.5) * TABLE_PX];
    function drawTable(r) {
      tg.fillStyle = '#04161b'; tg.fillRect(0, 0, TABLE_PX, TABLE_PX);
      const src = ctx.orthoCache.low ? ctx.orthoCache.low.image : ctx.orthoCache.high && ctx.orthoCache.high.image;
      if (src) {
        tg.globalAlpha = 0.85; tg.drawImage(src, 0, 0, TABLE_PX, TABLE_PX); tg.globalAlpha = 1;
        tg.globalCompositeOperation = 'multiply'; tg.fillStyle = '#39c4d8'; tg.fillRect(0, 0, TABLE_PX, TABLE_PX); tg.globalCompositeOperation = 'source-over';
      }
      tg.strokeStyle = 'rgba(120,230,255,.25)'; tg.lineWidth = 1;
      for (let k = 1; k < 8; k++) { tg.beginPath(); tg.moveTo(k * 64, 0); tg.lineTo(k * 64, TABLE_PX); tg.moveTo(0, k * 64); tg.lineTo(TABLE_PX, k * 64); tg.stroke(); }
      const pts = r.path && r.path.length > 1 ? r.path.map(([x, z]) => mp(x, z)) : r.waypoints.map((w) => mp(w.x, w.z));
      if (pts.length > 1) {   // the planned route; straight legs between waypoints while there is no path yet
        tg.strokeStyle = '#ffd24a'; tg.lineWidth = 4; tg.setLineDash(r.path ? [] : [10, 6]); tg.beginPath();
        pts.forEach(([px, py], i) => (i ? tg.lineTo(px, py) : tg.moveTo(px, py))); tg.stroke(); tg.setLineDash([]);
      }
      r.waypoints.forEach((w, i) => {
        const [px, py] = mp(w.x, w.z), done = r.visited.includes(i), next = i === r.nextIndex;
        tg.fillStyle = done ? GREEN : next ? '#ffd24a' : '#ffffff'; tg.beginPath(); tg.arc(px, py, next ? 9 : 6, 0, 7); tg.fill();
      });
      if (r.shelter) { const [px, py] = mp(r.shelter.x, r.shelter.z); tg.strokeStyle = GREEN; tg.lineWidth = 3; tg.beginPath(); tg.arc(px, py, 14, 0, 7); tg.stroke(); }
      if (r.player) {   // the player, with a heading tick
        const [px, py] = mp(r.player.x, r.player.z);
        tg.fillStyle = BLUE; tg.beginPath(); tg.arc(px, py, 7, 0, 7); tg.fill();
        if (fin(r.player.headingDeg)) { const a = r.player.headingDeg * Math.PI / 180; tg.strokeStyle = BLUE; tg.lineWidth = 3; tg.beginPath(); tg.moveTo(px, py); tg.lineTo(px + Math.sin(a) * 18, py - Math.cos(a) * 18); tg.stroke(); }
      }
      ttex.needsUpdate = true;
    }
    return {
      mesh,
      /** Redraws only when the route, the visited waypoints, the shelter or the player (by 5 m or 15 degrees) changed. */
      update(r) {
        const p = r.player;
        const k = JSON.stringify([r.path && r.path.length, r.path && r.path[0], r.waypoints.length, r.visited, r.nextIndex, r.shelter,
          p && [Math.round(p.x / 5), Math.round(p.z / 5), Math.round((p.headingDeg ?? 0) / 15)]]);
        if (k === key) return;
        key = k; drawTable(r);
      },
      drawPlaceholder() { drawTable({ path: null, waypoints: (sys.route.data && sys.route.data.waypoints) || [], visited: [], nextIndex: 0, shelter: null, player: null }); },
    };
  })();

  return {
    mat, table,
    /** @param {ReturnType<typeof import('../state/habitatScreens.js').habitatScreenData>} d */
    setData(d) { data = d; since = DRAW_EVERY_S; if (d && d.route) table.update(d.route); },
    /** Redraws now, for example after the interface language changed (index.js), so the labels switch at once. */
    draw() { since = 0; draw(); },
    /** @param {number} dt @param {boolean} near the camera is close enough to read the screens */
    update(dt, near) {
      clock += dt; since += dt;
      if (!near || since < DRAW_EVERY_S) return;
      since = 0; draw();
    },
    dispose() { tex.dispose(); mat.dispose(); table.mesh.geometry.dispose(); table.mesh.material.map.dispose(); table.mesh.material.dispose(); },
  };
}
