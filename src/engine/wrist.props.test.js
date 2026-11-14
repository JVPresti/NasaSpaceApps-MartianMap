import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createProps } from './props.js';

// Real props.js update over real Object3D meshes: opening the wrist app must not eat the sample in the scoop.
// Only the loaded models are stood in for by empty meshes with the names in assets_props/props.json.
function makeProps(state, content = 'ScoopSoil') {
  const sys = { arms: { state, clip: null }, partner: { root: new THREE.Group(), carrying: false, bending: false, wantCarry: false } };
  const props = createProps({
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), U: {}, assets: {}, sys, terrain: { meshH: () => 0 },
  });
  const scoop = new THREE.Group(), tcase = new THREE.Group();
  for (const name of ['ScoopSoil', 'ScoopRocks']) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); mesh.name = name;
    scoop.add(mesh); tcase.add(mesh.clone());
  }
  props.scoop = scoop; props.tcase = tcase; props.content = content;
  return { props, sys };
}

const shown = (root, name) => root.getObjectByName(name).visible;

describe('wrist screen: the sample survives a visit to the wrist app', () => {
  it('hides the scoop while the wrist is up and keeps the sample in it', () => {
    const { props } = makeProps('screen');
    props.update(1 / 60);
    expect(props.content).toBe('ScoopSoil');
    expect(props.scoop.visible).toBe(false);   // not in the way of the screen, but still loaded in the pan
    expect(shown(props.scoop, 'ScoopSoil')).toBe(true);
  });

  it('brings the same sample back when the wrist comes down to the tool hold', () => {
    const { props, sys } = makeProps('screen');
    props.update(1 / 60);
    sys.arms.state = 'tool';   // engine.setWristOpen(false) restores this pose while a sample is held
    props.update(1 / 60);
    expect(props.content).toBe('ScoopSoil');
    expect(props.scoop.visible).toBe(true);
    expect(shown(props.scoop, 'ScoopSoil')).toBe(true);
    expect(shown(props.scoop, 'ScoopRocks')).toBe(false);
  });

  it('still empties the scoop when the arm really leaves the tool hold', () => {
    const { props } = makeProps('down');
    props.update(1 / 60);
    expect(props.content).toBeNull();
    expect(props.scoop.visible).toBe(false);
  });
});
