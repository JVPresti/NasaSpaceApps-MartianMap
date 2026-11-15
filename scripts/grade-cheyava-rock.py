#!/usr/bin/env python3
"""Re-grade the Cheyava Falls rock texture to the Mastcam-Z colour of the ground (#194).

The hand-made texture public/marswalk/assets/cheyava_color.jpg was painted a saturated red with
thick flat white veins. The ground was matched to Perseverance Mastcam-Z frames on 2026-11-14
(docs/marswalk-assets/README.md, "Colour"). This script brings the rock to the same numbers:

  rock body   linear red:green 1.5, green:blue 1.8 (README light rock: 1.3 to 1.6 and 1.6 to 1.9)
  veins       thinned to their centre line, 2 to 3 px wide, and broken into dashes
  spots       the dark leopard spots stay, a little less red than the body

The grade always starts from the original painted texture, read from Git at SOURCE_REV, so running
it twice gives the same file. It prints the measured ratios of the texture before and after and of
the PIA26401 reference frame shown on the stop card.

Needs Python 3 with numpy and Pillow (python3 -m pip install numpy pillow). Run from the repo root:

  python3 scripts/grade-cheyava-rock.py            # writes the texture and prints the numbers
  python3 scripts/grade-cheyava-rock.py --measure  # only prints the numbers of the current files
"""
import argparse
import io
import subprocess
import sys

import numpy as np
from PIL import Image

TEXTURE = 'public/marswalk/assets/cheyava_color.jpg'
REFERENCE = 'public/data/images/cheyava-falls-pia26401.jpg'
SOURCE_REV = 'd972866'          # last commit with the original painted texture
TARGET_RG, TARGET_GB = 1.5, 1.8
BODY_Y = 0.30                   # mean linear luminance of the rock body (the painted one was 0.22)
BODY_GAMMA = 0.85               # < 1 flattens the painted mottling a little
SPOT_RG, SPOT_GB = 1.25, 1.45   # leopard spots: darker and less red than the body
VEIN_RG, VEIN_GB = 1.12, 1.18   # sulfate veins: off-white with the same warm cast as the scene light
VEIN_Y = 0.68                   # PIA26401: the brightest vein pixels are 2.3 x the rock body
VEIN_KEEP = 0.62                # fraction of the vein length that stays after breaking
SEED = 194
LUMA = np.array([0.2126, 0.7152, 0.0722])
# Boxes (x0, y0, x1, y1) on clean Cheyava Falls rock in the 1200 x 513 PIA26401 frame: left of the
# drill hole, right of the abrasion patch, and below it. They avoid the soil, the blue-white
# abrasion dust and the rover arm.
REF_BOXES = [(190, 170, 330, 290), (440, 280, 570, 330), (200, 400, 380, 430)]


def to_linear(a):
    a = a / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def to_srgb(a):
    a = np.clip(a, 0.0, 1.0)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055) * 255.0


def load(src):
    return to_linear(np.asarray(Image.open(src).convert('RGB')).astype(np.float64))


def box_blur(a, r):
    """Mean over a (2r+1) square, edges clamped. Three passes approximate a Gaussian."""
    for axis in (0, 1):
        p = np.pad(a, [(r + 1, r) if ax == axis else (0, 0) for ax in range(a.ndim)], mode='edge')
        c = np.cumsum(p, axis=axis)
        hi = np.take(c, np.arange(2 * r + 1, c.shape[axis]), axis=axis)
        lo = np.take(c, np.arange(0, c.shape[axis] - 2 * r - 1), axis=axis)
        a = (hi - lo) / (2 * r + 1)
    return a


def blur(a, r):
    for _ in range(3):
        a = box_blur(a, r)
    return a


def shift_stack(m):
    p = np.pad(m, 1, mode='edge')
    h, w = m.shape
    return [p[1 + dy:1 + dy + h, 1 + dx:1 + dx + w] for dy in (-1, 0, 1) for dx in (-1, 0, 1)]


def erode(m, n=1):
    for _ in range(n):
        m = np.logical_and.reduce(shift_stack(m))
    return m


def dilate(m, n=1):
    for _ in range(n):
        m = np.logical_or.reduce(shift_stack(m))
    return m


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ratios(lin, mask):
    r, g, b = lin[mask].mean(0)
    return r / g, g / b, float((lin[mask] @ LUMA).mean())


def tint(rg, gb):
    """Linear RGB with the given red:green and green:blue and luminance 1."""
    c = np.array([rg * gb, gb, 1.0])
    return c / (c @ LUMA)


def masks(lin):
    """Split the painted texture into background, veins, grey patches, white discs, spots and body."""
    y = lin @ LUMA
    mx, mn = lin.max(-1), lin.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    bg = y < 0.004
    white = ~bg & (sat < 0.3) & (y > 0.35)
    grey = ~bg & (sat < 0.25) & (y <= 0.35) & (y > 0.05)
    grey = dilate(erode(grey, 3), 3) & grey              # only the patches; drops the spots painted on the veins
    disc = dilate(erode(white, 9), 11) & white           # the two drill-tailings discs: 19 px or more across, wider than any vein
    vein = white & ~disc
    zone = dilate(vein | (~bg & (sat < 0.55) & (y > 0.25)), 3) & ~disc & ~grey   # vein plus its soft pink fringe
    local = blur(np.where(bg | zone, 0, y), 4) / np.maximum(blur((~bg & ~zone).astype(float), 4), 1e-6)
    spot = ~bg & ~zone & ~grey & (y < 0.65 * local)
    body = ~bg & ~zone & ~grey & ~disc & ~spot & (y > 0.02)
    return dict(y=y, bg=bg, vein=vein, zone=zone, grey=grey, disc=disc, spot=spot, body=body)


def vein_lines(vein, rng):
    """Centre lines of the painted veins, 2 to 3 px wide, broken into dashes. Returns opacity 0..1."""
    depth = np.zeros(vein.shape)
    m = vein.copy()
    for _ in range(16):                                    # depth = how many erosions a pixel survives
        depth += m
        m = erode(m)
    peak = np.maximum.reduce(shift_stack(depth))
    centre = vein & (depth >= peak - 0.5) & (depth >= 1)   # ridge of the depth map
    line = dilate(centre) & dilate(vein)                   # 2 to 3 px, against 4 to 12 px painted
    noise = blur(rng.standard_normal(vein.shape), 4)
    noise = (noise - noise.mean()) / noise.std()
    cut = np.quantile(noise[line], 1 - VEIN_KEEP)
    keep = smoothstep(cut - 0.15, cut + 0.25, noise)       # tapered ends at each break
    strength = 0.75 + 0.25 * smoothstep(-1, 1, blur(rng.standard_normal(vein.shape), 6) * 8)
    soft = np.maximum(line * 1.0, blur(line.astype(float), 1) * 0.8)   # crisp core, 1 px soft edge
    return np.clip(soft, 0, 1) * keep * strength


def grade(lin):
    rng = np.random.default_rng(SEED)
    k = masks(lin)
    y = k['y']
    paint = ~k['bg'] & ~k['disc']

    # Body: keep the painted luminance pattern, set the hue to the target, keep 30 % of the hue mottling.
    mean_y = y[k['body']].mean()
    y_new = BODY_Y * (np.maximum(y, 1e-6) / mean_y) ** BODY_GAMMA
    lr = np.log(np.maximum(lin[..., 0], 1e-6) / np.maximum(lin[..., 1], 1e-6))
    lb = np.log(np.maximum(lin[..., 1], 1e-6) / np.maximum(lin[..., 2], 1e-6))
    dr = np.clip(lr - lr[k['body']].mean(), -0.3, 0.3) * 0.3
    db = np.clip(lb - lb[k['body']].mean(), -0.3, 0.3) * 0.3
    c = np.stack([np.exp(dr + np.log(TARGET_RG)) * np.exp(db + np.log(TARGET_GB)),
                  np.exp(db + np.log(TARGET_GB)), np.ones_like(y)], -1)
    body = c / (c @ LUMA)[..., None] * y_new[..., None]
    spot_col = tint(SPOT_RG, SPOT_GB) * y_new[..., None] * 0.85
    body = np.where(k['spot'][..., None], spot_col, body)

    # Under the old veins: fill from the surrounding graded body, then add fine grain so it is not flat.
    good = (paint & ~k['zone'] & ~k['grey']).astype(float)
    fill = np.zeros_like(body)
    for r in (3, 8, 20):
        w = blur(good, r)
        f = np.stack([blur(body[..., i] * good, r) for i in range(3)], -1) / np.maximum(w, 1e-6)[..., None]
        fill = np.where((w > 0.15)[..., None] & (fill.sum(-1) == 0)[..., None], f, fill)
    grain = 1 + 0.12 * blur(rng.standard_normal(y.shape), 1) / 0.2
    fill *= grain[..., None]
    body = np.where(k['zone'][..., None], fill, body)

    # Match the body means to the target exactly (the hue mottling shifts them a little).
    r, g, b = body[k['body']].mean(0)
    gain = np.array([TARGET_RG * TARGET_GB * b / r, TARGET_GB * b / g, 1.0])
    body *= gain
    body *= BODY_Y / (body[k['body']] @ LUMA).mean()

    # Thin broken veins on top.
    a = vein_lines(k['vein'], rng)[..., None]
    vein_y = VEIN_Y * (0.85 + 0.3 * blur(rng.random(y.shape), 2))
    out = body * (1 - a) + tint(VEIN_RG, VEIN_GB) * vein_y[..., None] * a

    # Grey patches (abrasion patch, drill hole, the grey strips on the top chart) stay grey. Their painted
    # edges fade into the red, so blend by how unsaturated the painted pixel is instead of cutting them out.
    sat = (lin.max(-1) - lin.min(-1)) / np.maximum(lin.max(-1), 1e-6)
    near = blur(dilate(k['grey'], 3).astype(float), 6) > 0.02
    g = (smoothstep(0.6, 0.2, sat) * near)[..., None]
    out = out * (1 - g) + tint(1.04, 1.06) * y[..., None] * g

    # Background and the white discs keep their paint.
    out = np.where(~paint[..., None], lin, out)
    return out, k


def report(label, lin, mask):
    rg, gb, y = ratios(lin, mask)
    print(f'  {label:<34} red:green {rg:.2f}  green:blue {gb:.2f}  mean linear luminance {y:.3f}')


def vein_cover(lin, k):
    y = lin @ LUMA
    mx, mn = lin.max(-1), lin.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    rock = ~k['bg'] & ~k['grey'] & ~k['disc']
    return ((sat < 0.3) & (y > 0.3) & rock).sum() / rock.sum()


def measure_reference():
    ref = load(REFERENCE)
    parts = []
    for x0, y0, x1, y1 in REF_BOXES:
        a = ref[y0:y1, x0:x1]
        y = a @ LUMA
        sat = (a.max(-1) - a.min(-1)) / np.maximum(a.max(-1), 1e-6)
        parts.append(a[(sat > 0.25) & (y > 0.1) & (y < np.quantile(y, 0.97))])
    p = np.concatenate(parts)
    r, g, b = p.mean(0)
    print(f'  {"PIA26401, rock body (3 boxes)":<34} red:green {r / g:.2f}  green:blue {g / b:.2f}  '
          f'mean linear luminance {float((p @ LUMA).mean()):.3f}')


def git_source():
    data = subprocess.run(['git', 'show', f'{SOURCE_REV}:{TEXTURE}'], check=True, capture_output=True).stdout
    return io.BytesIO(data)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--measure', action='store_true', help='only print the numbers, write nothing')
    ap.add_argument('--out', default=TEXTURE, help=f'where to write the graded texture (default {TEXTURE})')
    args = ap.parse_args()

    src = load(git_source())
    k = masks(src)
    print(f'Texture before (original paint at {SOURCE_REV}):')
    report('rock body', src, k['body'])
    report('leopard spots', src, k['spot'])
    print(f'  vein cover: {vein_cover(src, k) * 100:.1f} % of the painted rock')

    if args.measure:
        cur = load(TEXTURE)
    else:
        out, _ = grade(src)
        Image.fromarray(np.round(to_srgb(out)).astype(np.uint8)).save(args.out, quality=90, subsampling=0, optimize=True)
        print(f'Wrote {args.out}')
        cur = load(args.out)
    print('Texture after (as saved):' if not args.measure else f'Texture now ({TEXTURE}):')
    report('rock body', cur, k['body'])
    report('leopard spots', cur, k['spot'])
    print(f'  vein cover: {vein_cover(cur, k) * 100:.1f} % of the painted rock')
    print('Reference:')
    measure_reference()
    print(f'Target: red:green {TARGET_RG}, green:blue {TARGET_GB} '
          '(README "Colour": light rock 1.3 to 1.6 and 1.6 to 1.9)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
