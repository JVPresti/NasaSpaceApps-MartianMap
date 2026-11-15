// Canvas painter for the wrist screen (#67): frame, layer picker, checklist and suit readouts.
// The map page is owned by the map work: drawWrist paints only its frame and leaves WRIST_CONTENT blank.
// Plain JavaScript, no React, no three.js, no DOM.
import {
  FOOTER_Y, PAGE_TITLES, ROWS_BOTTOM, ROWS_TOP, WRIST_CONTENT, WRIST_HEIGHT, WRIST_WIDTH,
} from './layout.js';

const COLORS = {
  base: '#1b110d',
  top: '#2a1a13',
  ink: '#fbf5ee',
  dim: 'rgba(251, 245, 238, 0.72)',
  faint: 'rgba(251, 245, 238, 0.5)',
  unit: '#9fd8ee',
  accent: '#ffd24a',
  ok: '#8fe9b8',
  caution: '#ffc56b',
  warning: '#ff6a4d',
  line: 'rgba(255, 240, 225, 0.22)',
  edge: 'rgba(255, 240, 225, 0.3)',
  selected: 'rgba(255, 210, 74, 0.13)',
};

const SANS = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
const MONO = 'ui-monospace, Consolas, monospace';
const serif = (px, weight = 600) => `${weight} ${px}px ${SANS}`;
const mono = (px, weight = 600) => `${weight} ${px}px ${MONO}`;

const PAD = 30;
const RIGHT = WRIST_WIDTH - PAD;
const LABEL_X = 66;

const TAG_COLORS = {
  DATA: { fg: '#b9ecff', line: 'rgba(159, 216, 238, 0.6)' },
  DERIVED: { fg: '#d6f5d0', line: 'rgba(143, 233, 184, 0.5)' },
  SIM: { fg: COLORS.dim, line: COLORS.line },
};

function roundedRect(g, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + radius, y);
  g.arcTo(x + w, y, x + w, y + h, radius);
  g.arcTo(x + w, y + h, x, y + h, radius);
  g.arcTo(x, y + h, x, y, radius);
  g.arcTo(x, y, x + w, y, radius);
  g.closePath();
}

function hairline(g, y) {
  g.beginPath();
  g.moveTo(PAD - 6, y);
  g.lineTo(RIGHT + 6, y);
  g.strokeStyle = COLORS.line;
  g.lineWidth = 1;
  g.stroke();
}

function statusColor(level) {
  if (level === 'warning') return COLORS.warning;
  if (level === 'caution') return COLORS.caution;
  if (level === 'nominal') return COLORS.ok;
  return COLORS.dim;
}

function drawTag(g, tag, xRight, y) {
  const colors = TAG_COLORS[tag];
  if (!colors) return;
  g.font = mono(12, 600);
  const width = Math.ceil(g.measureText(tag).width) + 10;
  const x = xRight - width;
  roundedRect(g, x, y - 8, width, 16, 3);
  g.fillStyle = 'rgba(27, 17, 13, 0.9)';
  g.fill();
  g.strokeStyle = colors.line;
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = colors.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(tag, x + width / 2, y + 0.5);
}

function drawLayerMarker(g, x, y, active) {
  g.beginPath();
  g.arc(x, y, 7, 0, Math.PI * 2);
  g.strokeStyle = active ? COLORS.ok : COLORS.faint;
  g.lineWidth = 1.5;
  g.stroke();
  if (!active) return;
  g.beginPath();
  g.arc(x, y, 3.5, 0, Math.PI * 2);
  g.fillStyle = COLORS.ok;
  g.fill();
}

function drawCheckMarker(g, x, y, checked) {
  roundedRect(g, x - 9, y - 9, 18, 18, 4);
  if (checked) {
    g.fillStyle = 'rgba(143, 233, 184, 0.14)';
    g.fill();
  }
  g.strokeStyle = checked ? COLORS.ok : COLORS.faint;
  g.lineWidth = 1.5;
  g.stroke();
  if (!checked) return;
  g.beginPath();
  g.moveTo(x - 4.5, y + 0.5);
  g.lineTo(x - 1, y + 4);
  g.lineTo(x + 5, y - 4);
  g.strokeStyle = COLORS.ok;
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
}

function drawLayers(g, row, center) {
  const active = row.active === true;
  drawLayerMarker(g, 46, center, active);
  g.fillStyle = active ? COLORS.ink : 'rgba(251, 245, 238, 0.84)';
  g.font = serif(28, active ? 700 : 600);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(row.label, LABEL_X, center - 3, 290);
  g.fillStyle = COLORS.unit;
  g.font = mono(16, 600);
  g.textAlign = 'right';
  g.fillText(row.value, RIGHT, center - 3);
  if (row.tag) drawTag(g, row.tag, RIGHT, center + 14);
}

function drawChecklist(g, row, center) {
  const checked = row.checked === true;
  drawCheckMarker(g, 44, center - 5, checked);
  g.fillStyle = checked ? COLORS.ink : 'rgba(251, 245, 238, 0.84)';
  g.font = serif(28, checked ? 700 : 600);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(row.label, LABEL_X, center - 6);
  g.fillStyle = checked ? COLORS.ok : COLORS.dim;
  g.font = mono(14, 600);
  g.fillText(row.value, LABEL_X, center + 17, 416);
}

function drawSuit(g, row, center) {
  g.fillStyle = COLORS.ink;
  g.font = serif(28, 600);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(row.label, PAD, center - 3);
  g.fillStyle = COLORS.unit;
  g.font = mono(26, 700);
  g.textAlign = 'right';
  g.fillText(row.value, RIGHT, center - 3);
  if (row.tag) drawTag(g, row.tag, RIGHT, center + 14);
}

function drawRows(g, model) {
  const rows = model.rows;
  if (!rows.length) return;
  const height = (ROWS_BOTTOM - ROWS_TOP) / rows.length;
  const selected = Number.isInteger(model.row) ? model.row : -1;
  rows.forEach((row, index) => {
    const center = ROWS_TOP + (index + 0.5) * height;
    if (index === selected) {
      roundedRect(g, 14, center - height / 2 + 2, WRIST_WIDTH - 28, height - 4, 8);
      g.fillStyle = COLORS.selected;
      g.fill();
      roundedRect(g, 14, center - height / 2 + 5, 4, height - 10, 2);
      g.fillStyle = COLORS.accent;
      g.fill();
    }
    if (model.page === 'layers') drawLayers(g, row, center);
    else if (model.page === 'checklist') drawChecklist(g, row, center);
    else if (model.page === 'suit') drawSuit(g, row, center);
  });
}

/**
 * Paint the frame, header and footer, and return the content rect so a map owner can fill it.
 * The canvas is a fixed WRIST_WIDTH × WRIST_HEIGHT texture, independent of display DPR.
 * @param {CanvasRenderingContext2D} g
 * @param {import('./view.js').WristModel | null} model
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function drawWristFrame(g, model) {
  const content = { ...WRIST_CONTENT };
  if (!g) return content;
  const page = model?.page;
  const title = model?.title || PAGE_TITLES[page] || 'WRIST';

  g.save();
  g.clearRect(0, 0, WRIST_WIDTH, WRIST_HEIGHT);

  const background = g.createLinearGradient(0, 0, 0, WRIST_HEIGHT);
  background.addColorStop(0, COLORS.top);
  background.addColorStop(1, COLORS.base);
  roundedRect(g, 0.75, 0.75, WRIST_WIDTH - 1.5, WRIST_HEIGHT - 1.5, 16);
  g.fillStyle = background;
  g.fill();
  g.strokeStyle = COLORS.edge;
  g.lineWidth = 1.5;
  g.stroke();

  g.fillStyle = COLORS.ink;
  g.font = serif(30, 700);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(title, PAD, 44);
  const titleWidth = g.measureText(title).width;

  if (Number.isFinite(model?.pageIndex) && Number.isFinite(model?.pageCount)) {
    g.fillStyle = COLORS.faint;
    g.font = mono(14, 600);
    g.fillText((model.pageIndex + 1) + '/' + model.pageCount, PAD + titleWidth + 10, 45);
  }

  if (model?.status) {
    g.fillStyle = statusColor(model.level);
    g.font = mono(14, 700);
    g.textAlign = 'right';
    g.fillText(model.status, RIGHT, 44, 215);
  }

  hairline(g, 62);

  g.fillStyle = COLORS.dim;
  g.font = mono(12, 600);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const enter = model?.confirmable ? 'ENTER SELECT' : 'ENTER READ';
  g.fillText('R CLOSE · [ ] PAGE · J/K ROW · ' + enter, WRIST_WIDTH / 2, FOOTER_Y, WRIST_WIDTH - 28);
  hairline(g, 320);

  g.restore();
  return content;
}

/**
 * Paint one wrist frame. Layers, checklist and suit are drawn here; the map page keeps only the frame, and
 * its content is added by the map work.
 * @param {CanvasRenderingContext2D} g
 * @param {import('./view.js').WristModel | null} model
 * @returns {{ x: number, y: number, w: number, h: number }} the content rect, empty area on the map page
 */
export function drawWrist(g, model) {
  const content = drawWristFrame(g, model);
  if (!g || !model || !Array.isArray(model.rows) || model.rows.length === 0) return content;
  if (model.page === 'map') return content;
  g.save();
  drawRows(g, model);
  g.restore();
  return content;
}
