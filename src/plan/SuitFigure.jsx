import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/index.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The suit in the suit check (#11): the same Z-2 model the partner wears outside (NASA 3D Resources), standing in its
// idle loop and turning slowly; drag to turn it by hand. The browser already has the model cached from the scene load,
// so nothing new is downloaded.
//
// One small renderer and one parsed model serve the whole session: the first Suit step creates them, later ones move
// the same canvas back in. Each new step used to create a WebGL context, parse the GLB again and compile its shaders,
// about 700 ms on an RTX 3070 (scripts/perf/plan.mjs). The renderer draws only while the step is open.

const MODEL = import.meta.env.BASE_URL + 'marswalk/assets_astronaut/z2_astronaut.glb';
const HEIGHT_M = 1.94;   // astronaut.json

let figure = null;   // { renderer, scene, camera, turntable, mixer, status, listeners } once created; status 'error' without WebGL

function createFigure() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return { status: 'error', listeners: new Set() };   // no WebGL: say so instead of a blank space
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  camera.position.set(0, HEIGHT_M * 0.55, 5.6);
  camera.lookAt(0, HEIGHT_M * 0.5, 0);
  scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x3a2418, 1.6));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fd3ee, 1.4);
  rim.position.set(-3, 2.5, -3);
  scene.add(rim);
  const turntable = new THREE.Group();
  scene.add(turntable);

  const value = { renderer, scene, camera, turntable, mixer: null, status: 'loading', listeners: new Set() };
  const settle = (status) => { value.status = status; for (const listener of value.listeners) listener(status); };
  new GLTFLoader().load(
    MODEL,
    (gltf) => {
      turntable.add(gltf.scene);
      value.mixer = new THREE.AnimationMixer(gltf.scene);
      const idle = gltf.animations.find((clip) => clip.name === 'idle');
      if (idle) value.mixer.clipAction(idle).play();
      settle('ready');
    },
    undefined,
    () => settle('error'),
  );
  return value;
}

export default function SuitFigure() {
  const boxRef = useRef(null);
  const [status, setStatus] = useState(() => figure?.status ?? 'loading');

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    figure ??= createFigure();
    const f = figure;
    f.listeners.add(setStatus);
    queueMicrotask(() => setStatus(f.status));   // a figure made by an earlier step may already be ready
    if (!f.renderer) return () => { f.listeners.delete(setStatus); };
    const { renderer, camera, scene, turntable } = f;
    box.appendChild(renderer.domElement);

    const resize = () => {
      const { width, height } = box.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    resize();

    // Drag turns the suit; it keeps turning slowly on its own when left alone.
    let drag = null;
    let spin = 0.25;
    const onDown = (event) => { drag = { x: event.clientX, angle: turntable.rotation.y }; box.setPointerCapture(event.pointerId); };
    const onMove = (event) => { if (drag) turntable.rotation.y = drag.angle + (event.clientX - drag.x) * 0.01; };
    const onUp = () => { drag = null; };
    box.addEventListener('pointerdown', onDown);
    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerup', onUp);
    box.addEventListener('pointercancel', onUp);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) spin = 0;

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.1);
      if (!drag) turntable.rotation.y += spin * dt;
      f.mixer?.update(dt);
      renderer.render(scene, camera);
    });

    return () => {
      f.listeners.delete(setStatus);
      renderer.setAnimationLoop(null);
      observer.disconnect();
      box.removeEventListener('pointerdown', onDown);
      box.removeEventListener('pointermove', onMove);
      box.removeEventListener('pointerup', onUp);
      box.removeEventListener('pointercancel', onUp);
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="suit-figure" ref={boxRef} role="img" aria-label={t('suit.figure.label')}>
      {status === 'loading' && <p className="suit-figure-note">{t('suit.figure.loading')}</p>}
      {status === 'error' && <p className="suit-figure-note">{t('suit.figure.error')}</p>}
      <p className="suit-figure-caption">{t('suit.figure.caption')}</p>
    </div>
  );
}
