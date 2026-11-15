// Prompt floating over the habitat's planning table (#244): "[X] End the EVA" while the astronaut is back in the cabin
// during an EVA. Same look as the sampling key prompts of the HUD (sampling.css: a key cap and a short line), drawn on a
// small canvas as a sprite in the habitat's own space, so the walls hide it from outside and it stays over the table.
// The interface decides what it says (engine.setHabitatPrompt); the engine shows it only while the player is in the cabin.
import * as THREE from 'three';

const W = 1024, H = 176;
const WIDTH_M = 1.15;                 // sprite width over the table
const TABLE_TOP_Y = 1.10 + 0.966;     // the table disc's height in habitat space (habitat.js)
const ABOVE_M = 0.3;                  // floats this far over the table: in view when looking down at the table, and from the door
const FADE_PER_S = 4;
const INK = '#f2f4f6', GLASS = 'rgba(10, 13, 17, 0.72)', EDGE = 'rgba(255, 255, 255, 0.35)';

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

  let prompt = null, key = '';

  function draw() {
    g.clearRect(0, 0, W, H);
    if (!prompt) return;
    g.font = '600 54px system-ui, "Segoe UI", sans-serif';
    const textW = g.measureText(prompt.text).width;
    g.font = '700 50px ui-monospace, Consolas, monospace';
    const capW = Math.max(84, g.measureText(prompt.key).width + 44), gap = 30, pad = 36;
    const panelW = Math.min(W - 8, pad + capW + gap + textW + pad), x0 = (W - panelW) / 2;
    roundRect(g, x0, 18, panelW, H - 36, 22); g.fillStyle = GLASS; g.fill(); g.strokeStyle = EDGE; g.lineWidth = 3; g.stroke();
    roundRect(g, x0 + pad, 44, capW, H - 88, 12); g.fillStyle = 'rgba(255, 255, 255, 0.06)'; g.fill(); g.strokeStyle = EDGE; g.stroke();
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(prompt.key, x0 + pad + capW / 2, H / 2 + 2);
    g.font = '600 54px system-ui, "Segoe UI", sans-serif'; g.textAlign = 'left'; g.fillStyle = INK;
    g.fillText(prompt.text, x0 + pad + capW + gap, H / 2 + 2, W - (x0 + pad + capW + gap) - 12);
    tex.needsUpdate = true;
  }

  return {
    sprite,
    /** @param {{ key: string, text: string } | null} p */
    set(p) {
      const next = p && typeof p.key === 'string' && typeof p.text === 'string' ? { key: p.key, text: p.text } : null;
      const k = next ? next.key + '\n' + next.text : '';
      if (k === key) return;
      key = k; if (next) prompt = next;   // keep the old text while fading out
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
