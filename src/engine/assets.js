// Asset loading. Ported from docs/marswalk-assets/testbench-reference/main.js (lines 47-59).
// Everything is served from public/marswalk/: models as binary .glb, data as .json, images as .jpg/.png.
// Every request goes through one wrapper so the loading screen sees each real file and every failure
// carries the relative path of the file that broke. The shipped .glb files embed their buffers and
// textures, so each model is one logical file; an external nested asset would surface as a GLTF error.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AssetLoadError } from './errors.js';
import { loadJsonUrl } from '../data/dataFiles.js';

// The JSON is shared with the rest of the app (src/data/dataFiles.js), so an abort stops this engine
// waiting for it but does not cancel the request another module may still need.
function untilAborted(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/**
 * @param {string} base URL of the public/marswalk/ folder, ending in '/'
 * @param {{ tracker?: ReturnType<import('./progress.js').createProgressTracker>, signal?: AbortSignal }} options
 */
export function createAssets(base, { tracker = null, signal } = {}) {
  const texLoader = new THREE.TextureLoader();
  const gltfLoader = new GLTFLoader();

  function load(file, run) {
    tracker?.begin(file);
    let task;
    try {
      task = Promise.resolve(run());
    } catch (cause) {
      task = Promise.reject(cause);
    }
    return task.then(
      (value) => {
        tracker?.complete(file);
        return value;
      },
      (cause) => {
        tracker?.fail(file);
        throw cause instanceof AssetLoadError ? cause : new AssetLoadError(file, cause);
      },
    );
  }

  // One request per file per page, however many engines or modules ask for it.
  const getJson = (file) => load(file, () => untilAborted(loadJsonUrl(base + file), signal));

  /** Texture from assets/, with the bench's sampling settings. */
  function tex(name, { srgb = false, repeat = false, aniso = 4 } = {}) {
    const file = 'assets/' + name;
    return load(file, () => texLoader.loadAsync(base + file).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    }));
  }

  return {
    tex,
    /** JSON from assets/ */
    json: (name) => getJson('assets/' + name),
    /** JSON from any path under public/marswalk/ */
    jsonAt: (path) => getJson(path),
    /** Texture with default settings from any path under public/marswalk/ */
    texAt: (path) => load(path, () => texLoader.loadAsync(base + path)),
    /** glTF binary (.glb) from any path under public/marswalk/ */
    glb: (path) => load(path, () => gltfLoader.loadAsync(base + path)),
  };
}

export function b64u16(s) { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return new Uint16Array(a.buffer); }
export function b64u8(s) { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
