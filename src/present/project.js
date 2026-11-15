// Screen positions of engine points for the presentation's pinned labels (#291). A copy of the engine camera built
// from the same shot, so the labels move in the same frame as the terrain without reading the engine's camera.
import * as THREE from 'three';

export function createProjector() {
  const cam = new THREE.PerspectiveCamera(45, 1, 1, 100000);
  const v = new THREE.Vector3();
  return {
    /** @param {{ x: number, y: number, z: number, yaw: number, pitch: number, fov: number }} pose from geo.engineCamera */
    set(pose, aspect) {
      cam.position.set(pose.x, pose.y, pose.z);
      cam.rotation.set(pose.pitch, -pose.yaw, 0, 'YXZ');
      cam.fov = pose.fov; cam.aspect = aspect; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    },
    project(x, y, z, w, h) {
      v.set(x, y, z).project(cam);
      return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
    },
  };
}
