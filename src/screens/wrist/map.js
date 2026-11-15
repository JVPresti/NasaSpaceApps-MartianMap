// North-up mission overview, using the same HiRISE coordinates and estimate as Plan.
import { formatNumber, t } from '../../i18n/index.js';
import { TILE_WIDTH_M, TILE_DEPTH_M, activeHazardZones, niceScaleBar } from '../../hud/minimapGeometry.js';
import { drawPositionMarker, markerState } from '../../hud/positionMarker.js';
import { WRIST_CONTENT } from './layout.js';
import { ZONE_PALETTE_HUD, drawZoneWorld } from '../../zone/zonePaint.js';

export function mapProjection(rect = WRIST_CONTENT) {
  const scale = Math.min((rect.w - 50) / TILE_WIDTH_M, (rect.h - 32) / TILE_DEPTH_M);
  return {
    scale,
    point: (x, z) => ({ x: rect.x + rect.w / 2 + x * scale, y: rect.y + rect.h / 2 + z * scale }),
  };
}

export function wristMapView(state) {
  const n = state.navigation;
  return {
    navigation: { x: n.x, z: n.z, headingDeg: n.headingDeg, errorM: n.errorM, fixMode: n.fixMode },
    path: state.route.path,
    waypoints: state.route.waypoints,
    nextIndex: state.route.nextIndex,
    zones: activeHazardZones(state.hazards?.zones),
  };
}

export function drawWristMap(g, model, image, shelters, zone = null) {
  const r = WRIST_CONTENT, { scale, point } = mapProjection(r);
  const nw = point(-TILE_WIDTH_M / 2, -TILE_DEPTH_M / 2);
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  g.fillStyle = '#120e0c'; g.fillRect(r.x, r.y, r.w, r.h);
  if (image) g.drawImage(image, nw.x, nw.y, TILE_WIDTH_M * scale, TILE_DEPTH_M * scale);
  else {
    g.fillStyle = '#fbf5ee'; g.font = '20px sans-serif'; g.textAlign = 'center';
    g.fillText(t('wrist.map.missing'), r.x + r.w / 2, r.y + 22);
  }
  if (zone) {   // the return zone (src/sim/returnZone.js) over the photo, in the map's metres
    const o = point(0, 0);
    g.save(); g.translate(o.x, o.y); g.scale(scale, scale); drawZoneWorld(g, zone, ZONE_PALETTE_HUD); g.restore();
  }
  for (const zone of model.zones) {
    const p = point(zone.x, zone.z);
    g.beginPath(); g.arc(p.x, p.y, zone.radiusM * scale, 0, Math.PI * 2);
    g.fillStyle = '#ff5a3c55'; g.fill(); g.strokeStyle = '#ff5a3c'; g.stroke();
  }
  if (Array.isArray(model.path)) {
    g.beginPath();
    model.path.forEach(([x,z], i) => { const p = point(x,z); if (i) g.lineTo(p.x,p.y); else g.moveTo(p.x,p.y); });
    g.strokeStyle = '#ffd24a'; g.lineWidth = 3; g.stroke();
  }
  g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const s of shelters) {
    const p = point(s.x, s.z);
    g.fillStyle = '#8fe9b8'; g.fillRect(p.x - 4, p.y - 4, 8, 8);
  }
  model.waypoints.forEach((w, i) => {
    if (!Number.isFinite(w.x) || !Number.isFinite(w.z)) return;
    const p = point(w.x, w.z);
    g.fillStyle = i === model.nextIndex ? '#ffd24a' : '#fbf5ee';
    g.fillText(String(i + 1), p.x + 10, p.y - 10);
  });
  const marker = markerState(model.navigation, point);
  if (marker) drawPositionMarker(g, marker, { label: false });
  g.fillStyle = '#fbf5ee'; g.textAlign = 'left'; g.font = 'bold 18px sans-serif';
  g.fillText(t('wrist.map.north'), r.x + 8, r.y + 18);
  g.font = '14px sans-serif';
  if (image) g.fillText(t('wrist.map.source'), r.x + 8, r.y + r.h - 9);
  const bar = niceScaleBar(1 / scale, 1, { targetPx: 55 });
  if (bar) {
    const x = r.x + r.w - bar.px - 10, y = r.y + r.h - 24;
    g.strokeStyle = '#fbf5ee'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x,y); g.lineTo(x + bar.px,y); g.stroke();
    g.textAlign = 'right'; g.fillText(bar.label, r.x + r.w - 10, y - 12);
  }
  if (Number.isFinite(model.navigation.errorM)) {
    g.textAlign = 'right'; g.font = '14px sans-serif';
    g.fillText(t('wrist.map.error', { error: formatNumber(model.navigation.errorM, 1) }), r.x + r.w - 8, r.y + 18);
  }
  g.restore();
}
