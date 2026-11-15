// One row per run from a plan.mjs runs.json, as TSV on stdout. Not part of the build.
//
//   node scripts/perf/runs-tsv.mjs scripts/perf/out/<set>/runs.json > scripts/perf/results/<set>.tsv
//
// The columns are the counts and times the perf PRs quote. A run with an error keeps its row, with the error text and
// empty cells, so a reader sees which runs a median left out.
import { readFileSync } from 'node:fs';

const runs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const per = (st, k) => (st && st.sec ? +(st[k] / st.sec).toFixed(1) : '');
const val = (st, k) => (st && st[k] != null ? st[k] : '');
const layers = (steps) => Object.entries(steps).filter(([k]) => /^layer:\d+$/.test(k)).reduce((s, [, x]) => s + x.longTasks, 0);
const cols = {
  dist: (r) => r.dist,
  run: (r) => r.run,
  error: (r) => (r.errors || []).join(' | ').replace(/\s+/g, ' ').slice(0, 120),
  'idle_site_gl_frames_per_s': (r) => per(r.steps.idleSite, 'glFrames'),
  'idle_site_draws_per_s': (r) => per(r.steps.idleSite, 'draws'),
  'idle_site_long_tasks': (r) => val(r.steps.idleSite, 'longTasks'),
  'idle_site_long_ms': (r) => val(r.steps.idleSite, 'longMs'),
  'idle_route_gl_frames_per_s': (r) => per(r.steps.idleRoute, 'glFrames'),
  'suit_open_inp_ms': (r) => val(r.steps['tab:suit'], 'inpMs'),
  'suit_open_long_tasks': (r) => val(r.steps['tab:suit'], 'longTasks'),
  'suit_open_long_ms': (r) => val(r.steps['tab:suit'], 'longMs'),
  'suit_reopen_inp_ms': (r) => val(r.steps['tab:suit2'], 'inpMs'),
  'suit_reopen_long_tasks': (r) => val(r.steps['tab:suit2'], 'longTasks'),
  'suit_reopen_long_ms': (r) => val(r.steps['tab:suit2'], 'longMs'),
  'drag_put_image_data': (r) => val(r.steps['map:drag'], 'putImageData'),
  'drag_long_tasks': (r) => val(r.steps['map:drag'], 'longTasks'),
  'drag_frame_p95_ms': (r) => val(r.steps['map:drag'], 'frameP95'),
  'zoom_put_image_data': (r) => val(r.steps['map:zoom'], 'putImageData'),
  'layer_long_tasks_all': (r) => (r.steps ? layers(r.steps) : ''),
};
const rows = [Object.keys(cols).join('\t')];
for (const r of runs) {
  r.steps ||= {};
  rows.push(Object.values(cols).map((f) => { try { return f(r); } catch { return ''; } }).join('\t'));
}
process.stdout.write(rows.join('\n') + '\n');
