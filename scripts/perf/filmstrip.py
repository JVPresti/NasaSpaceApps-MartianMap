"""Filmstrips for the council from plan.mjs --film. Not part of the build.

    python3 scripts/perf/filmstrip.py <run dir> <dist> [run index] [out dir]

For each filmed step (map drag, zoom, a tab switch, a layer toggle) it picks 6 frames spread over the step, lays
them out 3 x 2 at half size, and prints under each frame the time since the input started and the gap since the
frame before it (a long gap is a visible hitch). The step's slowest input-to-next-paint (Event Timing API) and its
long tasks from runs.json go in the title.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

run_dir, dist = sys.argv[1], sys.argv[2]
run = int(sys.argv[3]) if len(sys.argv) > 3 else 0
out = sys.argv[4] if len(sys.argv) > 4 else os.path.join(run_dir, f"strips-{dist}")
os.makedirs(out, exist_ok=True)
runs = json.load(open(os.path.join(run_dir, "runs.json")))
rec = next(r for r in runs if r["dist"] == dist and r["run"] == run)
film = os.path.join(run_dir, f"film-{dist}-r{run}")
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
except OSError:
    font = big = ImageFont.load_default()

for step in sorted(os.listdir(film)):
    meta = json.load(open(os.path.join(film, step, "frames.json")))
    if not meta:
        continue
    t0 = meta[0]["ms"]
    picks = [meta[round(i * (len(meta) - 1) / 5)] for i in range(6)] if len(meta) >= 6 else meta
    tw, th = 683, 384
    sheet = Image.new("RGB", (tw * 3, 40 + (th + 34) * 2), (16, 16, 16))
    d = ImageDraw.Draw(sheet)
    s = rec["steps"].get(step.replace("-", ":", 1), {})
    gaps = [b["ms"] - a["ms"] for a, b in zip(meta, meta[1:])]
    d.text((10, 8), f"{step}  ·  slowest input to paint {s.get('inpMs', '?')} ms  ·  long tasks {s.get('longTasks', '?')} ({s.get('longMs', '?')} ms)  ·  {len(meta)} frames, longest gap {max(gaps) if gaps else 0} ms", fill=(240, 240, 240), font=big)
    prev = None
    for i, f in enumerate(picks):
        img = Image.open(os.path.join(film, step, f["name"])).convert("RGB").resize((tw, th))
        x, y = (i % 3) * tw, 40 + (i // 3) * (th + 34)
        sheet.paste(img, (x, y))
        gap = "" if prev is None else f"  (+{f['ms'] - prev} ms)"
        d.text((x + 8, y + th + 6), f"t = {f['ms'] - t0} ms{gap}", fill=(230, 230, 230), font=font)
        prev = f["ms"]
    path = os.path.join(out, f"{step}.png")
    sheet.save(path)
    print(path)
