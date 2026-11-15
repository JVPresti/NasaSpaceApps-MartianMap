import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createCinematic } from './cinematic.js';

function fakeCtx() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000);
  const label = new THREE.Sprite();
  scene.add(label);
  const glow = { mesh: new THREE.Mesh(), chevrons: new THREE.Mesh() };
  scene.add(glow.mesh, glow.chevrons);
  return {
    scene, camera, label, glow,
    U: { uFogK: { value: 0.002 } },
    renderer: { domElement: {} },
    sys: { routeGlow: glow },
    terrain: { meshH: () => 10, groundH: () => 10 },
    T: { W: 200, H: 200 },
    tier: 'high',
  };
}

function make() {
  const ctx = fakeCtx();
  const hooks = { render: vi.fn(), loop: vi.fn(), release: vi.fn() };
  return { ctx, hooks, cine: createCinematic(ctx, hooks) };
}

describe('createCinematic', () => {
  it('hides the app route glow and labels while it holds the scene', () => {
    const { ctx } = make();
    expect(ctx.label.layers.isEnabled(0)).toBe(false);
    expect(ctx.glow.mesh.layers.isEnabled(0)).toBe(false);
    expect(ctx.scene.getObjectByName('cinematic')).toBeTruthy();
  });

  it('flies the camera to a shot and lowers the haze from high up', () => {
    const { ctx, cine } = make();
    cine.setShot({ x: 1, y: 3010, z: 2, yaw: 0.5, pitch: -1, fov: 40 });
    cine.apply(1 / 60);
    expect(ctx.camera.position.toArray()).toEqual([1, 3010, 2]);
    expect(ctx.camera.fov).toBe(40);
    expect(ctx.U.uFogK.value).toBeCloseTo(0.002 * 1500 / 3000);
  });

  it('steps a fixed time when asked, and the frame time otherwise', () => {
    const { cine } = make();
    expect(cine.frameDt(500)).toBe(0.1);
    cine.setFixedStep(1 / 60);
    expect(cine.frameDt(500)).toBe(1 / 60);
    cine.setFixedStep(null);
    expect(cine.frameDt(16)).toBeCloseTo(0.016);
  });

  it('builds the route and the zone meshes on the terrain', () => {
    const { cine } = make();
    expect(cine.setRoute([[0, 0], [30, 40]])).toBe(50);
    cine.setZone({ cols: 2, rows: 2, x0: -10, z0: -10, dx: 20, dz: 20, last: new Uint8Array([1, 2, 3, 4]) });
    cine.setZoneFrame(2, 1);
    const zone = cine.group.children.find((o) => o.material?.uniforms?.tLast);
    expect(zone.visible).toBe(true);
    expect(zone.geometry.attributes.position.getY(0)).toBeCloseTo(10.6);
  });

  it('gives everything back on release, once', () => {
    const { ctx, hooks, cine } = make();
    const fov = ctx.camera.fov, fog = ctx.U.uFogK.value;
    cine.setLoop(false);
    expect(hooks.loop).toHaveBeenLastCalledWith(false);
    cine.setShot({ x: 0, y: 5000, z: 0, yaw: 0, pitch: -1, fov: 30 });
    cine.apply(1 / 60);
    const routeGeo = cine.group.children.find((o) => o.material?.uniforms?.uReveal).geometry;
    const dispose = vi.spyOn(routeGeo, 'dispose');
    cine.release();
    cine.release();
    expect(ctx.scene.getObjectByName('cinematic')).toBeUndefined();
    expect(ctx.label.layers.isEnabled(0)).toBe(true);
    expect(ctx.glow.mesh.layers.isEnabled(0)).toBe(true);
    expect(ctx.camera.fov).toBe(fov);
    expect(ctx.U.uFogK.value).toBe(fog);
    expect(dispose).toHaveBeenCalled();
    expect(hooks.loop).toHaveBeenLastCalledWith(true);   // the engine's own loop runs again
    expect(hooks.release).toHaveBeenCalledTimes(1);
  });

  it('does nothing after release', () => {
    const { ctx, hooks, cine } = make();
    cine.release();
    const before = ctx.camera.position.clone();
    cine.setShot({ x: 9, y: 9, z: 9, yaw: 0, pitch: 0 });
    cine.apply(1 / 60);
    cine.step();
    expect(ctx.camera.position.equals(before)).toBe(true);
    expect(hooks.render).not.toHaveBeenCalled();
  });

  it('re-hides labels added later, twice a second rather than every frame', () => {
    const { ctx, cine } = make();
    const late = new THREE.Sprite();
    ctx.scene.add(late);
    for (let i = 0; i < 29; i++) cine.apply(1 / 60);
    expect(late.layers.isEnabled(0)).toBe(true);
    cine.apply(1 / 60);
    expect(late.layers.isEnabled(0)).toBe(false);
  });
});
