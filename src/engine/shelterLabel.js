// Marker above the highlighted shelter. Kept small so it never blocks the view while walking (NASA's Joint AR asks for a
// "minimally intrusive, translucent" suit display):
//   - compact by default: an icon and the distance, half transparent
//   - full ("SHELTER · 310 m") only when the player looks near it or is close (rules in shelterRules.js)
//   - hidden right next to the shelter, where it is in plain sight
// A sprite drawn from a small canvas, constant size on screen, drawn over the terrain so a ridge cannot hide it.
import * as THREE from 'three';
import { formatDistance, labelMode } from './shelterRules.js';

const W = 512, H = 112;
const GREEN = '#3ee08a', INK = '#e8fff1', BG = 'rgba(8, 26, 18, 0.72)';
const SCALE = 0.17;            // sprite width in the sizeAttenuation:false units (about an eighth of the screen height)

export function createShelterLabel() {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0); sprite.renderOrder = 20;   // shown and hidden with the highlight's group
  sprite.scale.set(SCALE, SCALE * H / W, 1);
  let key = null, alpha = 0;
  const ndc = new THREE.Vector3();

  function icon(cx) {
    g.strokeStyle = GREEN; g.lineWidth = 6; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(cx - 28, 58); g.lineTo(cx, 32); g.lineTo(cx + 28, 58); g.moveTo(cx - 20, 52); g.lineTo(cx - 20, 82); g.lineTo(cx + 20, 82); g.lineTo(cx + 20, 52); g.stroke();
  }

  function draw(mode, title, distance) {
    const k = mode + '|' + title + '|' + distance;
    if (k === key) return;
    key = k;
    g.clearRect(0, 0, W, H);
    g.textBaseline = 'middle';
    const name = mode === 'full' ? title.toUpperCase() : '', dist = (name ? '· ' : '') + distance;
    g.font = '600 38px Rubik, system-ui, sans-serif'; const nameW = name ? g.measureText(name).width + 18 : 0;
    g.font = '500 38px "JetBrains Mono", ui-monospace, monospace'; const distW = g.measureText(dist).width;
    const boxW = Math.min(W - 8, 96 + nameW + distW + 28), x0 = (W - boxW) / 2;   // the box fits its text, centred
    g.fillStyle = BG; g.strokeStyle = GREEN; g.lineWidth = 4;
    g.beginPath(); g.roundRect(x0, 4, boxW, H - 8, 22); g.fill(); g.stroke();
    icon(x0 + 50);
    if (name) { g.fillStyle = GREEN; g.font = '600 38px Rubik, system-ui, sans-serif'; g.fillText(name, x0 + 96, H / 2 + 2); }
    g.fillStyle = INK; g.font = '500 38px "JetBrains Mono", ui-monospace, monospace'; g.fillText(dist, x0 + 96 + nameW, H / 2 + 2);
    tex.needsUpdate = true;
  }

  return {
    sprite,
    /**
     * @param {string} title @param {number} distanceM player to shelter
     * @param {THREE.Camera} camera @param {number} on 0..1 fade of the whole highlight @param {number} dt
     */
    update(title, distanceM, camera, on, dt) {
      ndc.copy(sprite.position).project(camera);
      const lookOffset = ndc.z < 1 ? Math.hypot(ndc.x, ndc.y) : Infinity;   // behind the camera: not looking at it
      const mode = labelMode(distanceM, lookOffset);
      const target = mode === 'hidden' ? 0 : mode === 'full' ? 1 : 0.6;
      alpha += (target - alpha) * Math.min(1, dt * 6);
      material.opacity = alpha * on;
      sprite.visible = material.opacity > 0.01;
      if (mode !== 'hidden') draw(mode, title, formatDistance(distanceM));
    },
    dispose() { tex.dispose(); material.dispose(); },
  };
}
