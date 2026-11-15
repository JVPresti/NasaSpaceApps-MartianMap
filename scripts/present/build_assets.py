#!/usr/bin/env python3
"""Build the presentation's orbital images from NASA Mars Trek tiles (#291).

    python3 scripts/present/build_assets.py            # writes public/present/*.jpg
    python3 scripts/present/build_assets.py --cache D  # keep the downloaded tiles in D (default ~/.cache/marswalk-present)

Needs Python 3 with Pillow. Every source is a public Mars Trek WMTS layer (equirectangular, 256 px tiles,
level z has 2^(z+1) x 2^z tiles over 360 x 180 degrees, row 0 at the north pole):

  globe_4k.jpg, globe_2k.jpg   Viking MDIM 2.1 colour mosaic (Mars_Viking_MDIM21_ClrMosaic_global_232m), level 4
                               (8192 x 4096) resized to 4096 x 2048 and 2048 x 1024 (Low tier).
  jezero_region.jpg            THEMIS day IR 100 m (THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018), level 9, over
                               75.9 to 79.1 E, 16.8 to 20.0 N, tinted (below).
  jezero_ctx.jpg               MRO CTX Jezero mosaic, controlled, 6 m (JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0),
                               level 12, over its own bounding box, tinted (below).

THEMIS and CTX are grayscale. Both take one flat tint, ENGINE_TINT: the mean colour of the engine's tinted HiRISE tile,
so the fall from orbit into the 3D terrain keeps one colour. The app already says the Mars colour is a tint
(docs/marswalk-assets/README.md); Sources and the tag on screen say the same here. colourise() is kept for a
Viking-coloured version.
"""
import argparse
import concurrent.futures as cf
import io
import json
import os
import sys
import time
import urllib.request

from PIL import Image, ImageFilter, ImageMath

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'present')
TREK = 'https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{row}/{col}.{ext}'

VIKING = ('Mars_Viking_MDIM21_ClrMosaic_global_232m', 'jpg')
THEMIS = ('THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018', 'png')
CTX = ('JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0', 'png')

# Boxes as (west, south, east, north) in degrees east and north.
REGION_BOX = (75.9, 16.8, 79.1, 20.0)
CTX_BOX = (77.1604655, 18.2110274, 77.6991776, 18.7211945)


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'marswalk-present-build'})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'wb') as f:
                f.write(data)
            return path
        except Exception as err:  # noqa: BLE001 - retry any network error
            if attempt == 3:
                raise RuntimeError(f'{url}: {err}') from err
            time.sleep(1.5 * (attempt + 1))
    return path


def deg_per_px(z):
    return 180.0 / (2 ** z) / 256.0


def mosaic(cache, layer, z, box):
    """Stitch the tiles of `layer` at level z that cover box and crop to it exactly. Returns an RGB image."""
    name, ext = layer
    w, s, e, n = box
    d = deg_per_px(z)
    # pixel coordinates in the level's global image (x from -180 E, y from 90 N)
    x0, x1 = (w + 180) / d, (e + 180) / d
    y0, y1 = (90 - n) / d, (90 - s) / d
    c0, c1 = int(x0 // 256), int((x1 - 1e-9) // 256)
    r0, r1 = int(y0 // 256), int((y1 - 1e-9) // 256)
    jobs = []
    for row in range(r0, r1 + 1):
        for col in range(c0, c1 + 1):
            url = TREK.format(layer=name, z=z, row=row, col=col, ext=ext)
            jobs.append((row, col, url, os.path.join(cache, name, str(z), f'{row}_{col}.{ext}')))
    print(f'{name} level {z}: {len(jobs)} tiles', flush=True)
    with cf.ThreadPoolExecutor(12) as pool:
        list(pool.map(lambda j: fetch(j[2], j[3]), jobs))
    big = Image.new('RGB', ((c1 - c0 + 1) * 256, (r1 - r0 + 1) * 256))
    for row, col, _url, path in jobs:
        tile = Image.open(path).convert('RGB')
        big.paste(tile, ((col - c0) * 256, (row - r0) * 256))
    left, top = x0 - c0 * 256, y0 - r0 * 256
    return big.crop((round(left), round(top), round(left + (x1 - x0)), round(top + (y1 - y0))))


def colourise(gray, colour, blur_px):
    """blur(colour) * gray / blur(gray), all at gray's size. Keeps colour's low frequencies and gray's detail."""
    g = gray.convert('L')
    col = colour.resize(g.size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(blur_px))
    gb = g.filter(ImageFilter.GaussianBlur(blur_px))
    ratio = ImageMath.lambda_eval(lambda a: a['g'] / (a['gb'] + 1.0), g=g.convert('F'), gb=gb.convert('F'))
    bands = [ImageMath.lambda_eval(lambda a: a['c'] * a['r'], c=band.convert('F'), r=ratio) for band in col.split()]
    return Image.merge('RGB', [b.convert('L') for b in bands])


# The mean colour of the engine's tinted HiRISE tile seen from the hand-off height, measured from a recorded frame. The
# THEMIS and CTX images take it, so the fall from orbit into the engine's terrain does not change colour.
ENGINE_TINT = (118, 90, 68)


def tint(gray, colour):
    """gray / mean(gray) * mean(colour): one flat Viking colour over the CTX detail. CTX is too sharp for the Viking
    mosaic's 232 m colour to follow, so a per-pixel ratio smears; a flat tint is honest and matches the app's own
    tinted HiRISE (docs/marswalk-assets/README.md: the Mars colour is a tint)."""
    g = gray.convert('L')
    small = colour if isinstance(colour, tuple) else colour.resize((1, 1), Image.BOX).getpixel((0, 0))
    mean = g.resize((1, 1), Image.BOX).getpixel((0, 0)) or 1
    return Image.merge('RGB', [g.point(lambda v, c=c: max(0, min(255, round(v / mean * c)))) for c in small])


def save(img, name, quality=86):
    path = os.path.join(OUT, name)
    img.save(path, 'JPEG', quality=quality, optimize=True, progressive=True)
    kb = os.path.getsize(path) / 1024
    print(f'wrote {os.path.relpath(path, ROOT)} {img.size[0]}x{img.size[1]} {kb:.0f} KB', flush=True)
    if kb > 4096:
        sys.exit(f'{name} is over 4 MB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.expanduser('~/.cache/marswalk-present'))
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    globe = mosaic(args.cache, VIKING, 4, (-180, -90, 180, 90))
    save(globe.resize((4096, 2048), Image.LANCZOS), 'globe_4k.jpg', 84)
    save(globe.resize((2048, 1024), Image.LANCZOS), 'globe_2k.jpg', 84)

    region_colour = mosaic(args.cache, VIKING, 7, REGION_BOX)
    region_gray = mosaic(args.cache, THEMIS, 9, REGION_BOX).resize((2048, 2048), Image.LANCZOS)
    save(tint(region_gray, ENGINE_TINT), 'jezero_region.jpg', 86)

    ctx_colour = mosaic(args.cache, VIKING, 7, CTX_BOX)
    ctx_gray = mosaic(args.cache, CTX, 12, CTX_BOX)
    w, h = ctx_gray.size
    k = 2048 / max(w, h)
    ctx_gray = ctx_gray.resize((round(w * k), round(h * k)), Image.LANCZOS)
    save(tint(ctx_gray, ENGINE_TINT), 'jezero_ctx.jpg', 86)

    meta = {
        'note': 'Written by scripts/present/build_assets.py from NASA Mars Trek tiles. Boxes are west, south, east, north in degrees.',
        'globe': {'layer': VIKING[0], 'box': [-180, -90, 180, 90]},
        'region': {'layer': THEMIS[0], 'colour': VIKING[0], 'box': list(REGION_BOX)},
        'ctx': {'layer': CTX[0], 'colour': VIKING[0], 'box': list(CTX_BOX)},
    }
    with open(os.path.join(OUT, 'images.json'), 'w') as f:
        json.dump(meta, f, indent=2)
        f.write('\n')


if __name__ == '__main__':
    main()
