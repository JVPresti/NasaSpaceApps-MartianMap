#!/usr/bin/env python3
"""Make public/marswalk/assets/slab_nl.jpg tileable (#193).

The original Poly Haven crop has seams at its edges and a dark band along the top and bottom, which drew a grid of
pale 2 m squares on the outcrop. This script:
  1. flattens low-frequency brightness in every channel (96 px wrapped Gaussian),
  2. cross-fades each axis with a copy shifted by half the tile over the outer 6 to 36 % of the tile, rescaling the
     blend so two unrelated patches keep their contrast,
  3. flattens again (128 px) to remove what the blend brought in.
The channel layout (R,G = GL normal, B = sqrt luminance) and the 1024 px size stay the same.

It reads the original from Git at d972866, so re-running it writes the same file.

Usage (Python 3 with numpy, scipy and Pillow):
  python3 scripts/heal-slab-tile.py            rewrite the texture
  python3 scripts/heal-slab-tile.py --measure  print seam and brightness numbers for the original and the committed file
"""
import io
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/marswalk/assets/slab_nl.jpg'
SOURCE_REV = 'd972866'


def original():
    data = subprocess.run(['git', 'show', f'{SOURCE_REV}:public/marswalk/assets/slab_nl.jpg'], cwd=ROOT, check=True,
                          capture_output=True).stdout
    return np.asarray(Image.open(io.BytesIO(data)).convert('RGB')).astype(np.float64)


def flatten(a, sigma):
    out = a.copy()
    for c in range(3):
        out[..., c] = a[..., c] - gaussian_filter(a[..., c], sigma, mode='wrap') + a[..., c].mean()
    return out


def heal(a, axis):
    n = a.shape[axis]
    shifted = np.roll(a, n // 2, axis=axis)
    t = np.minimum(np.arange(n), n - 1 - np.arange(n)) / (n / 2)   # 0 at the edges, 1 in the middle
    w = np.clip((t - 0.06) / 0.30, 0, 1)
    w = w * w * (3 - 2 * w)
    w = w[:, None, None] if axis == 0 else w[None, :, None]
    mean = a.mean(axis=(0, 1))
    mix = w * (a - mean) + (1 - w) * (shifted - mean)
    return mix / np.sqrt(w * w + (1 - w) ** 2) + mean


def measure(name, a):
    lum = a[..., 2]
    edge_x, edge_y = np.abs(lum[:, -1] - lum[:, 0]).mean(), np.abs(lum[-1] - lum[0]).mean()
    in_x, in_y = np.abs(np.diff(lum, axis=1)).mean(), np.abs(np.diff(lum, axis=0)).mean()
    s = lum.shape[0] // 4
    blocks = lum.reshape(4, s, 4, s).mean(axis=(1, 3))
    print(f'{name}: edge step x {edge_x:.1f} y {edge_y:.1f}, inside x {in_x:.1f} y {in_y:.1f}, '
          f'4x4 block brightness {blocks.min():.0f} to {blocks.max():.0f}, B std {lum.std():.1f}')


def main():
    src = original()
    if '--measure' in sys.argv:
        measure('original', src)
        measure('committed', np.asarray(Image.open(OUT).convert('RGB')).astype(np.float64))
        return
    a = flatten(src, 96)
    a = heal(a, 1)
    a = heal(a, 0)
    a = flatten(a, 128)
    Image.fromarray(np.clip(np.rint(a), 0, 255).astype(np.uint8)).save(OUT, quality=92, optimize=True)
    print(f'wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
