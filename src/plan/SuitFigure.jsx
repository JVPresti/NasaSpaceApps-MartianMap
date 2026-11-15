import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The suit in the suit check (#11): the same Z-2 model the partner wears outside (NASA 3D Resources), standing in its
// idle loop and turning slowly; drag to turn it by hand. A small renderer of its own that exists only while the Suit step
// is open. The browser already has the model cached from the scene load, so nothing new is downloaded.

const MODEL = import.meta.env.BASE_URL + 'marswalk/assets_astronaut/z2_astronaut.glb';
const HEIGHT_M = 1.94;   // astronaut.json

export default function SuitFigure() {
  const boxRef = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      queueMicrotask(() => setStatus('error'));   // no WebGL: say so instead of a blank space
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    box.appendChild(renderer.domElement);

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
    let mixer = null;
    let disposed = false;
    let gltfScene = null;

    new GLTFLoader().load(
      MODEL,
      (gltf) => {
        if (disposed) return;
        gltfScene = gltf.scene;
        turntable.add(gltfScene);
        mixer = new THREE.AnimationMixer(gltfScene);
        const idle = gltf.animations.find((clip) => clip.name === 'idle');
        if (idle) mixer.clipAction(idle).play();
        setStatus('ready');
      },
      undefined,
      () => !disposed && setStatus('error'),
    );

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
      mixer?.update(dt);
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      box.removeEventListener('pointerdown', onDown);
      box.removeEventListener('pointermove', onMove);
      box.removeEventListener('pointerup', onUp);
      box.removeEventListener('pointercancel', onUp);
      gltfScene?.traverse((node) => {
        node.geometry?.dispose();
        const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
        for (const material of materials) {
          for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
          material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="suit-figure" ref={boxRef} role="img" aria-label="The suit, turning slowly. Drag to turn it.">
      {status === 'loading' && <p className="suit-figure-note">Loading the suit…</p>}
      {status === 'error' && <p className="suit-figure-note">The suit model could not be shown.</p>}
      <p className="suit-figure-caption">Z-2 suit shape (NASA 3D Resources) · numbers from the xEMU suit model · drag to turn</p>
    </div>
  );
}
