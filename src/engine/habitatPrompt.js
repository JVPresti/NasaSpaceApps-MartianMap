// Prompt floating over the habitat's planning table (#244): the table's actions while the astronaut is in the cabin,
// one row each ("[E] Open plan", "[X] Finish EVA"); a row that does not apply now is dimmed. Same look as the sampling key
// prompts of the HUD (sampling.css: a key cap and a short line), drawn on a small canvas as a sprite in the habitat's own
// space, so the walls hide it from outside and it stays over the table. The interface decides what it says
// (engine.setHabitatPrompt, src/state/tableActions.js); the engine shows it only while the player is in the cabin
// (CABIN_ZONES), which is also the only place its keys act (engine.inHabitatCabin).
import * as THREE from 'three';

/** The habitat walk zones (collide.js) that make up the cabin: the prompt shows, and its keys act, only there. */
export const CABIN_ZONES = Object.freeze(['main', 'inner']);
/** @param {string | null | undefined} name a walk zone name (collide.js HAB_ZONES) */
export const isCabinZone = (name) => CABIN_ZONES.includes(name);

/** Rows the prompt can hold: the canvas is sized for this many, so it never has to be reallocated. */
export const MAX_ROWS = 2;
const W = 1024;
const ROW_H = 88, ROW_GAP = 18, INSET = 26, MARGIN = 18;   // px: key cap height, between two rows, panel edge to the caps, canvas edge to the panel
const PAD = 36, GAP = 30, CAP_MIN = 84, CAP_SIDE = 44;      // px: panel side padding, cap to text, narrowest cap, cap width over its letters
const H = MARGIN * 2 + INSET * 2 + MAX_ROWS * ROW_H + (MAX_ROWS - 1) * ROW_GAP;
const TEXT_FONT = '600 54px system-ui, "Segoe UI", sans-serif', KEY_FONT = '700 50px ui-monospace, Consolas, monospace';
const WIDTH_M = 1.15;                 // sprite width over the table
const TABLE_TOP_Y = 1.10 + 0.966;     // the table disc's height in habitat space (habitat.js)
const ABOVE_M = 0.36;                 // the sprite's centre over the table: the two-row panel ends where the one-row panel of #244 did
const FADE_PER_S = 4;
const INK = '#f2f4f6', GLASS = 'rgba(10, 13, 17, 0.72)', EDGE = 'rgba(255, 255, 255, 0.35)';
const DIM_ALPHA = 0.45;               // a row that does not apply now: cap and text fade together

/**
 * The rows of a prompt: `{ rows: [{ key, text, dim? }] }`, or `{ key, text }` for a single row. null for anything else.
 * @returns {{ key: string, text: string, dim: boolean }[] | null}
 */
export function promptRows(p) {
  if (!p || typeof p !== 'object') return null;
  const list = Array.isArray(p.rows) ? p.rows : [p];
  const rows = list.filter((r) => r && typeof r.key === 'string' && typeof r.text === 'string')
    .slice(0, MAX_ROWS).map((r) => ({ key: r.key, text: r.text, dim: r.dim === true }));
  return rows.length ? rows : null;
}

/**
 * Where the panel, the caps and the text go on the canvas. Pure: `measure(font, text)` returns the text's width in px.
 * Every cap takes the widest cap's width, so the lines start in one column; the panel is centred both ways.
 * @param {{ key: string, text: string, dim: boolean }[]} rows
 * @param {(font: string, text: string) => number} measure
 */
export function layoutPrompt(rows, measure) {
  const capW = Math.max(CAP_MIN, ...rows.map((r) => measure(KEY_FONT, r.key) + CAP_SIDE));
  const textW = Math.max(0, ...rows.map((r) => measure(TEXT_FONT, r.text)));
  const w = Math.min(W - 8, PAD + capW + GAP + textW + PAD), x = (W - w) / 2;
  const h = INSET * 2 + rows.length * ROW_H + (rows.length - 1) * ROW_GAP, y = (H - h) / 2;
  const textX = x + PAD + capW + GAP;
  return {
    width: W, height: H, panel: { x, y, w, h }, capW, textX, textMaxW: x + w - PAD - textX,
    rows: rows.map((r, i) => { const top = y + INSET + i * (ROW_H + ROW_GAP); return { ...r, top, mid: top + ROW_H / 2 }; }),
  };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function createHabitatPrompt() {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(0, TABLE_TOP_Y + ABOVE_M, 0); sprite.scale.set(WIDTH_M, WIDTH_M * H / W, 1);
  sprite.renderOrder = 5; sprite.visible = false;

  const measure = (font, text) => { g.font = font; return g.measureText(text).width; };
  let rows = null, key = '';

  function draw() {
    g.clearRect(0, 0, W, H);
    if (!rows) return;
    const L = layoutPrompt(rows, measure), P = L.panel;
    roundRect(g, P.x, P.y, P.w, P.h, 22); g.fillStyle = GLASS; g.fill(); g.strokeStyle = EDGE; g.lineWidth = 3; g.stroke();
    g.textBaseline = 'middle';
    for (const r of L.rows) {
      g.globalAlpha = r.dim ? DIM_ALPHA : 1;
      roundRect(g, P.x + PAD, r.top, L.capW, ROW_H, 12); g.fillStyle = 'rgba(255, 255, 255, 0.06)'; g.fill(); g.strokeStyle = EDGE; g.stroke();
      g.fillStyle = INK; g.font = KEY_FONT; g.textAlign = 'center';
      g.fillText(r.key, P.x + PAD + L.capW / 2, r.mid + 2);
      g.font = TEXT_FONT; g.textAlign = 'left';
      g.fillText(r.text, L.textX, r.mid + 2, L.textMaxW);
    }
    g.globalAlpha = 1;
    tex.needsUpdate = true;
  }

  return {
    sprite,
    /** @param {{ rows: { key: string, text: string, dim?: boolean }[] } | { key: string, text: string } | null} p */
    set(p) {
      const next = promptRows(p);
      const k = next ? next.map((r) => r.key + '\t' + r.text + (r.dim ? '\t-' : '')).join('\n') : '';
      if (k === key) return;
      key = k; if (next) rows = next;   // keep the old rows while fading out
      if (next) draw();
    },
    /** @param {number} dt @param {boolean} inCabin the player stands in the habitat's cabin */
    update(dt, inCabin) {
      const target = key && inCabin ? 1 : 0, o = material.opacity;
      if (o === target) return;
      material.opacity = Math.max(0, Math.min(1, o + Math.sign(target - o) * FADE_PER_S * (dt || 0.016)));
      sprite.visible = material.opacity > 0.01;
    },
    dispose() { tex.dispose(); material.dispose(); },
  };
}
