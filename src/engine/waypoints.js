/**
 * Numbered waypoint markers for Plan mode.
 *
 * Each marker is a sprite with a canvas texture: a round number badge and the
 * waypoint name. Sprites always face the camera, which is what a top-down map
 * needs, and they ignore depth so a ridge cannot hide a planned stop.
 */
import * as THREE from 'three';

const CANVAS_W = 384;
const CANVAS_H = 112;
const BADGE_R = 30;
const BADGE_X = 44;
const BADGE_Y = 56;
const PILL_X = 84;
const PILL_W = 286;
const PILL_H = 58;

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
function splitName(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  const [head, ...tail] = clean.split(' · ');
  if (tail.length) return { title: head, detail: tail.join(' · ') };
  if (clean.length <= 20) return { title: clean, detail: '' };
  return { title: clean.slice(0, 20), detail: clean.slice(20, 42) };
}

function markerTexture(waypoint, active) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');

  // name pill
  ctx.fillStyle = COLORS.panel;
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  roundRect(ctx, PILL_X, 27, PILL_W, PILL_H, 16);
  ctx.fill();
  ctx.stroke();

  // number badge
  ctx.beginPath();
  ctx.arc(BADGE_X, BADGE_Y, BADGE_R, 0, Math.PI * 2);
  ctx.fillStyle = active ? COLORS.active : COLORS.idle;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.ink;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1a100c';
  ctx.font = '700 34px system-ui, "Segoe UI", sans-serif';
  ctx.fillText(String(waypoint.index + 1), BADGE_X, BADGE_Y + 1);

  const { title, detail } = splitName(waypoint.name);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.font = '700 23px system-ui, "Segoe UI", sans-serif';
  ctx.fillText(title, PILL_X + 18, detail ? 47 : 56);
  if (detail) {
    ctx.fillStyle = 'rgba(243, 230, 216, 0.74)';
    ctx.font = '400 19px system-ui, "Segoe UI", sans-serif';
    ctx.fillText(detail, PILL_X + 18, 72);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * @param {{ scene: THREE.Scene, terrain: { meshH: (x: number, z: number) => number } }} ctx
 */
export function createWaypointMarkers(ctx) {
  const group = new THREE.Group();
  group.renderOrder = 30;
  ctx.scene.add(group);

  function clear() {
    for (const sprite of [...group.children]) {
      group.remove(sprite);
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
    }
  }

  /**
   * @param {Array<{ x: number, z: number, name?: string, active?: boolean }>} waypoints
   */
  function set(waypoints) {
    clear();
    if (!Array.isArray(waypoints)) return;
    waypoints.forEach((waypoint, index) => {
      if (!Number.isFinite(waypoint?.x) || !Number.isFinite(waypoint?.z)) return;
      const texture = markerTexture({ ...waypoint, index }, Boolean(waypoint.active));
      const material = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });
      const sprite = new THREE.Sprite(material);
      const y = ctx.terrain.meshH(waypoint.x, waypoint.z) + 8;
      sprite.position.set(waypoint.x, y, waypoint.z);
      sprite.scale.set(120, 35, 1);
      sprite.renderOrder = 30;
      sprite.userData.waypointIndex = index;
      group.add(sprite);
    });
  }

  function dispose() {
    clear();
    ctx.scene.remove(group);
  }

  return { group, set, clear, dispose };
}
