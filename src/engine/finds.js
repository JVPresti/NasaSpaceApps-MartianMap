/**
 * Unexpected finds in the scene (#71): the pointing gesture, the ground ray and the find markers.
 *
 *   engine.aimGround(maxM)   where the centre of the view meets the terrain, or null (sky, too far, Plan mode)
 *   engine.setPointing(on)   raise the right arm into the arms' 'point' pose, or lower it again
 *   engine.setFinds(list)    markers for [{ id, label, x, z, status, verdict }]; null clears them
 *
 * A marker is a thin pole with a diamond head and a ring on the ground, plus a label that keeps the same size on
 * screen, so it reads both at walking distance and from the Plan camera. Colours follow the HUD: amber while the
 * detour is priced, green for go, red for no-go, cyan once the find is part of the route.
 */
import * as THREE from 'three';
import { marchGround } from './samplingRules.js';

const COLORS = { pricing: '#ffc56b', go: '#8fe9b8', 'no-go': '#ff6a4d', accepted: '#9fd8ee', error: '#ff6a4d' };
const POLE_M = 1.8;
const LABEL_W = 192, LABEL_H = 64;

/** Colour key of a find: its status, or its verdict once priced. */
export function findColorKey(find) {
  if (find.status === 'accepted') return 'accepted';
  if (find.status === 'priced') return find.verdict === 'no-go' ? 'no-go' : 'go';
  if (find.status === 'error') return 'error';
  return 'pricing';
}

function labelTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_W; canvas.height = LABEL_H;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(20, 12, 9, 0.82)';
  g.strokeStyle = color; g.lineWidth = 3;
  g.beginPath(); g.roundRect(3, 3, LABEL_W - 6, LABEL_H - 22, 12); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(LABEL_W / 2 - 9, LABEL_H - 19); g.lineTo(LABEL_W / 2 + 9, LABEL_H - 19); g.lineTo(LABEL_W / 2, LABEL_H - 4); g.closePath();
  g.fillStyle = color; g.fill();
  g.fillStyle = '#fbf5ee'; g.font = '700 26px system-ui, "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, LABEL_W / 2, (LABEL_H - 19) / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  return texture;
}

function createMarkers(ctx) {
  const group = new THREE.Group();
  group.renderOrder = 31;
  ctx.scene.add(group);
  const pole = new THREE.CylinderGeometry(0.035, 0.035, POLE_M, 6).translate(0, POLE_M / 2, 0);
  const head = new THREE.OctahedronGeometry(0.16).translate(0, POLE_M + 0.1, 0);
  const ring = new THREE.RingGeometry(0.55, 0.7, 32).rotateX(-Math.PI / 2).translate(0, 0.06, 0);
  let byKey = new Map();   // id -> { root, key } so an unchanged marker is not rebuilt

  function disposeMarker(m) {
    group.remove(m.root);
    m.root.traverse((o) => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  }

  function build(find, colorKey) {
    const color = COLORS[colorKey];
    const root = new THREE.Group();
    const solid = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    root.add(new THREE.Mesh(pole, solid), new THREE.Mesh(head, solid));
    root.add(new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })));
    // sizeAttenuation off: the label keeps about 90 x 30 px at 1080p whether the camera is 5 m or 1500 m away
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(find.label, color), sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true }));
    sprite.center.set(0.5, 0);
    sprite.scale.set(0.1, 0.033, 1);
    sprite.position.y = POLE_M + 0.35;
    sprite.renderOrder = 31;
    root.add(sprite);
    root.position.set(find.x, ctx.terrain.meshH(find.x, find.z), find.z);
    root.userData.findId = find.id;
    group.add(root);
    return root;
  }

  function set(list) {
    const next = new Map();
    for (const find of Array.isArray(list) ? list : []) {
      if (!find || !Number.isFinite(find.x) || !Number.isFinite(find.z)) continue;
      const colorKey = findColorKey(find), key = `${find.label}|${colorKey}|${find.x}|${find.z}`;
      const old = byKey.get(find.id);
      if (old && old.key === key) { next.set(find.id, old); byKey.delete(find.id); continue; }
      next.set(find.id, { root: build(find, colorKey), key });
    }
    for (const m of byKey.values()) disposeMarker(m);
    byKey = next;
  }

  function dispose() {
    for (const m of byKey.values()) disposeMarker(m);
    byKey.clear();
    pole.dispose(); head.dispose(); ring.dispose();
    ctx.scene.remove(group);
  }

  return { group, set, dispose };
}

/**
 * The engine methods for finds. Markers are created on the first setFinds after boot, so nothing here runs in
 * the frame loop.
 * @param {object} ctx engine context (index.js)
 * @param {{ isStarted: () => boolean }} options
 */
export function createFindsApi(ctx, { isStarted }) {
  let markers = null;
  const o = new THREE.Vector3(), d = new THREE.Vector3();

  return {
    /**
     * Find markers, shown in Walk and in Plan. Each find is { id, label, x, z, status, verdict? }.
     * @param {Array<object> | null} list
     */
    setFinds(list) {
      if (list !== null && !(Array.isArray(list) && list.every((f) => f && Number.isFinite(f.x) && Number.isFinite(f.z)))) throw new Error('setFinds: expected [{ id, label, x, z, status }] or null');
      if (!isStarted()) return false;
      if (!markers) markers = createMarkers(ctx);
      markers.set(list);
      return true;
    },
    /**
     * Where the centre of the view meets the terrain in Walk mode: { x, y, z, distanceM }, or null when the ray
     * hits nothing within maxM (the sky, or ground too far away) or the camera is in Plan mode.
     * @param {number} [maxM]
     */
    aimGround(maxM = 50) {
      if (!isStarted() || ctx.view.mode !== 'eye') return null;
      ctx.camera.updateMatrixWorld(); ctx.camera.getWorldPosition(o); ctx.camera.getWorldDirection(d);
      const hit = marchGround(o, d, ctx.terrain.meshH, maxM, 0.25);
      return hit ? { x: hit.point.x, y: hit.point.y, z: hit.point.z, distanceM: hit.distance } : null;
    },
    /**
     * Raise the right arm into the 'point' pose of the first-person arms, or lower it. Leaves the arms alone while
     * a sampling clip plays or another pose (the wrist screen, the scoop) is up. Returns true when the pose changed.
     * @param {boolean} on
     */
    setPointing(on) {
      const arms = ctx.sys.arms;
      if (!isStarted() || !arms || !arms.L || arms.clip) return false;
      if (on && arms.state === 'down') { arms.set('point'); return true; }
      if (!on && arms.state === 'point') { arms.set('down'); return true; }
      return false;
    },
    dispose() {
      if (markers) markers.dispose();
      markers = null;
    },
  };
}
