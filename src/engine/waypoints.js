/**
 * Numbered waypoint markers for Plan mode.
 *
 * Each marker is a sprite with a canvas texture: a round number badge and the
 * waypoint name. Sprites always face the camera, which is what a top-down map
 * needs, and they ignore depth so a ridge cannot hide a planned stop.
 *
 * The labels keep a fixed size on screen at any zoom (#198): the sprites use
 * `sizeAttenuation: false`, and `update()` sets their scale from the camera's
 * projection and the viewport height so the name is LABEL.title CSS px tall.
 * The badge sits on the waypoint and carries the same number as the cost table
 * (src/sim/waypointNumber.js).
 */
import * as THREE from 'three';
import { waypointNumber } from '../sim/waypointNumber.js';

/** Label layout in CSS pixels. The canvas is drawn at TEXTURE_SCALE texels per CSS pixel. */
export const LABEL = Object.freeze({
  pad: 2,          // room for the outline strokes
  badgeR: 11,
  badgeFont: 12,
  gap: 4,          // badge to pill
  textX: 8,        // pill side padding
  title: 13,       // waypoint name, bold
  detail: 12,      // second line after ' · '
  lineGap: 2,
  pillPadY: 5,
});
const TEXTURE_SCALE = 3;
const FONT = 'system-ui, "Segoe UI", sans-serif';

const COLORS = {
  active: '#ffd24a',
  idle: '#e0683a',
  ink: '#f3e6d8',
  panel: 'rgba(20, 12, 9, 0.86)',
  line: 'rgba(255, 214, 170, 0.42)',
};

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Split a waypoint name for the two-line pill.
 * @param {string} name
 */
export function splitName(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  const [head, ...tail] = clean.split(' · ');
  if (tail.length) return { title: head, detail: tail.join(' · ') };
  if (clean.length <= 20) return { title: clean, detail: '' };
  return { title: clean.slice(0, 20), detail: clean.slice(20, 42) };
}

/**
 * Size of a label and where its badge centre sits, in CSS pixels.
 * @param {{ titleW: number, detailW: number, twoLines: boolean }} text measured text widths in CSS px
 */
export function labelLayout({ titleW, detailW, twoLines }) {
  const L = LABEL;
  const textH = twoLines ? L.title + L.lineGap + L.detail : L.title;
  const pillH = Math.round(textH * 1.2 + L.pillPadY * 2);
  const badgeD = L.badgeR * 2;
  const pillX = L.pad + badgeD + L.gap;
  const pillW = Math.ceil(Math.max(titleW, detailW) + L.textX * 2);
  const width = pillX + pillW + L.pad;
  const height = Math.max(badgeD, pillH) + L.pad * 2;
  return {
    width,
    height,
    pillX,
    pillY: (height - pillH) / 2,
    pillW,
    pillH,
    badgeX: L.pad + L.badgeR,
    badgeY: height / 2,
  };
}

/**
 * Sprite scale that draws `cssW` x `cssH` pixels on screen when the material uses `sizeAttenuation: false`.
 * three.js multiplies such a sprite by its view depth, so its projected height in NDC is scale * P[5] and the
 * viewport maps 2 NDC units to `viewportH` CSS pixels.
 * @param {number} cssW
 * @param {number} cssH
 * @param {number} projectionYY the camera's `projectionMatrix.elements[5]`, 1 / tan(fov / 2) times zoom
 * @param {number} viewportH canvas height in CSS pixels
 */
export function screenScale(cssW, cssH, projectionYY, viewportH) {
  const perPixel = 2 / (projectionYY * Math.max(1, viewportH));
  return { x: cssW * perPixel, y: cssH * perPixel };
}

function markerTexture(waypoint, active) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const { title, detail } = splitName(waypoint.name);
  const titleFont = `700 ${LABEL.title}px ${FONT}`;
  const detailFont = `400 ${LABEL.detail}px ${FONT}`;
  ctx.font = titleFont;
  const titleW = ctx.measureText(title).width;
  ctx.font = detailFont;
  const detailW = detail ? ctx.measureText(detail).width : 0;
  const box = labelLayout({ titleW, detailW, twoLines: Boolean(detail) });

  canvas.width = Math.ceil(box.width * TEXTURE_SCALE);
  canvas.height = Math.ceil(box.height * TEXTURE_SCALE);
  ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);

  // name pill
  ctx.fillStyle = COLORS.panel;
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  roundRect(ctx, box.pillX, box.pillY, box.pillW, box.pillH, 7);
  ctx.fill();
  ctx.stroke();

  // number badge
  ctx.beginPath();
  ctx.arc(box.badgeX, box.badgeY, LABEL.badgeR - 0.75, 0, Math.PI * 2);
  ctx.fillStyle = active ? COLORS.active : COLORS.idle;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COLORS.ink;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1a100c';
  ctx.font = `700 ${LABEL.badgeFont}px ${FONT}`;
  ctx.fillText(waypointNumber(waypoint.index), box.badgeX, box.badgeY + 0.5);

  ctx.textAlign = 'left';
  const textX = box.pillX + LABEL.textX;
  const mid = box.pillY + box.pillH / 2;
  ctx.fillStyle = COLORS.ink;
  ctx.font = titleFont;
  if (detail) {
    const half = (LABEL.title + LABEL.lineGap + LABEL.detail) * 0.6;
    ctx.fillText(title, textX, mid - half + LABEL.title * 0.6);
    ctx.fillStyle = 'rgba(243, 230, 216, 0.78)';
    ctx.font = detailFont;
    ctx.fillText(detail, textX, mid + half - LABEL.detail * 0.6);
  } else {
    ctx.fillText(title, textX, mid + 0.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { texture, box };
}

/**
 * @param {{ scene: THREE.Scene, terrain: { meshH: (x: number, z: number) => number } }} ctx
 */
export function createWaypointMarkers(ctx) {
  const group = new THREE.Group();
  group.renderOrder = 30;
  ctx.scene.add(group);
  let fitted = { yy: 0, h: 0 };

  function clear() {
    for (const sprite of [...group.children]) {
      group.remove(sprite);
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
    }
  }

  function scaleSprite(sprite, yy, viewportH) {
    const { width, height } = sprite.userData.labelBox;
    const scale = screenScale(width, height, yy, viewportH);
    sprite.scale.set(scale.x, scale.y, 1);
  }

  /**
   * @param {Array<{ x: number, z: number, name?: string, active?: boolean }>} waypoints
   */
  function set(waypoints) {
    clear();
    if (!Array.isArray(waypoints)) return;
    waypoints.forEach((waypoint, index) => {
      if (!Number.isFinite(waypoint?.x) || !Number.isFinite(waypoint?.z)) return;
      const { texture, box } = markerTexture({ ...waypoint, index }, Boolean(waypoint.active));
      const material = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        sizeAttenuation: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      const y = ctx.terrain.meshH(waypoint.x, waypoint.z) + 8;
      sprite.position.set(waypoint.x, y, waypoint.z);
      // The badge centre sits on the waypoint; the name reads to its right.
      sprite.center.set(box.badgeX / box.width, 1 - box.badgeY / box.height);
      sprite.renderOrder = 30;
      sprite.userData.waypointIndex = index;
      sprite.userData.labelBox = box;
      if (fitted.h) scaleSprite(sprite, fitted.yy, fitted.h);
      group.add(sprite);
    });
  }

  /**
   * Keep the labels at a fixed CSS pixel size. Cheap enough to call every frame; it only rescales when the
   * projection or the viewport height changes.
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} viewportH canvas height in CSS pixels
   */
  function update(camera, viewportH) {
    const yy = camera.projectionMatrix.elements[5];
    if (yy === fitted.yy && viewportH === fitted.h) return;
    fitted = { yy, h: viewportH };
    for (const sprite of group.children) scaleSprite(sprite, yy, viewportH);
  }

  function dispose() {
    clear();
    ctx.scene.remove(group);
  }

  return { group, set, clear, update, dispose };
}
