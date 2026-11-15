import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createArms } from './arms.js';

// A canvas without a DOM: the 2D context records nothing, and the app canvas refuses getContext so any engine paint
// into it fails the test. This is the real arms.js screen code, only the browser canvas API is stood in for.
const context2d = () => ({ fillRect() {}, strokeRect() {}, fillText() {} });
const internalCanvas = () => ({ width: 512, height: 352, getContext: () => context2d() });
const appCanvas = () => ({ width: 512, height: 352, getContext() { throw new Error('the engine must not paint the app canvas'); } });

function makeArms() {
  const arms = createArms({
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), U: { uLayer: { value: 0 } },
    assets: {}, sys: {}, view: { mode: 'eye', pitch: 0 },
  });
  arms.canvas = internalCanvas();
  arms.tex = new THREE.CanvasTexture(arms.canvas);
  arms.screenMat = new THREE.MeshBasicMaterial({ map: arms.tex });
  return arms;
}

describe('wrist screen: the app owns its canvas', () => {
  it('puts the app canvas on the Screen material as an sRGB, non-flipped texture', () => {
    const arms = makeArms(), canvas = appCanvas();
    arms.setScreenCanvas(canvas);
    expect(arms.screenMat.map).toBe(arms.screenTex);
    expect(arms.screenMat.map).not.toBe(arms.tex);
    expect(arms.screenMat.map.image).toBe(canvas);
    expect(arms.screenTex.flipY).toBe(false);
    expect(arms.screenTex.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it('never paints or uploads while the app canvas is on screen; only invalidateScreen uploads', () => {
    const arms = makeArms(), canvas = appCanvas();
    arms.setScreenCanvas(canvas);
    const version = arms.screenMat.map.version;
    arms.draw();   // a setLayer() change: the fallback list is refreshed in memory, the app's screen is untouched
    expect(arms.screenMat.map.version).toBe(version);
    arms.invalidateScreen();
    expect(arms.screenMat.map.version).toBe(version + 1);
  });

  it('restores the built-in layer list and uploads it again for a consumer without the app', () => {
    const arms = makeArms(), canvas = appCanvas();
    arms.setScreenCanvas(canvas);
    const version = arms.tex.version;
    arms.setScreenCanvas(null);
    expect(arms.screenMat.map).toBe(arms.tex);
    expect(arms.tex.version).toBe(version + 1);
    const restored = arms.tex.version;
    arms.draw();   // without the app the fallback still uploads by itself, as before #67
    expect(arms.tex.version).toBe(restored + 1);
  });

  it('replaces an app canvas without leaking its texture', () => {
    const arms = makeArms();
    arms.setScreenCanvas(appCanvas());
    const first = arms.screenTex, disposed = [];
    first.addEventListener('dispose', () => disposed.push(first));
    arms.setScreenCanvas(appCanvas());
    expect(disposed).toEqual([first]);
    expect(arms.screenTex).not.toBe(first);
  });

  it('frees each screen texture once on dispose, and the material no longer points at them', () => {
    const arms = makeArms();
    arms.setScreenCanvas(appCanvas());
    const textures = [arms.tex, arms.screenTex], disposed = [];
    for (const tex of textures) tex.addEventListener('dispose', () => disposed.push(tex));
    arms.dispose();
    expect(disposed).toHaveLength(2);
    expect(disposed).toEqual(expect.arrayContaining(textures));
    expect(arms.screenMat).toBeNull();
    expect(arms.screenTex).toBeNull();
    arms.dispose();   // a second dispose must not free them again
    expect(disposed).toHaveLength(2);
  });

  it('accepts a canvas before init created the Screen material, then applies it', () => {
    const arms = makeArms(), canvas = appCanvas();
    arms.screenMat = null;
    arms.setScreenCanvas(canvas);
    expect(arms.screenCanvas).toBe(canvas);
    arms.screenMat = new THREE.MeshBasicMaterial({ map: arms.tex });
    arms.applyScreenCanvas();
    expect(arms.screenMat.map.image).toBe(canvas);
  });
});
