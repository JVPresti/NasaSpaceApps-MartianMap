// Asset loading. Ported from docs/marswalk-assets/testbench-reference/main.js (lines 47-59).
// Everything is served from public/marswalk/: models as binary .glb, data as .json, images as .jpg/.png.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** @param {string} base URL of the public/marswalk/ folder, ending in '/' */
export function createAssets(base) {
  const texLoader = new THREE.TextureLoader();
  const gltfLoader = new GLTFLoader();
  const A = base + 'assets/';
  const fail = (what) => () => { throw new Error('Could not load ' + what); };

  /** Texture from assets/, with the bench's sampling settings. */
  function tex(name, { srgb = false, repeat = false, aniso = 4 } = {}) {
    return texLoader.loadAsync(A + name).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    }, fail('texture ' + name));
  }
  const getJson = (url, what) => fetch(url).then((r) => { if (!r.ok) throw new Error(what + ' ' + r.status); return r.json(); });

  return {
    tex,
    /** JSON from assets/ */
    json: (name) => getJson(A + name, name),
    /** JSON from any path under public/marswalk/ */
    jsonAt: (path) => getJson(base + path, path),
    /** Texture with default settings from any path under public/marswalk/ */
    texAt: (path) => texLoader.loadAsync(base + path).catch(fail('texture ' + path)),
    /** glTF binary (.glb) from any path under public/marswalk/ */
    glb: (path) => gltfLoader.loadAsync(base + path).catch(fail('model ' + path)),
  };
}

export function b64u16(s) { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return new Uint16Array(a.buffer); }
export function b64u8(s) { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
