import * as THREE from "three";

/** A camera "shot": everything needed to place the 3D camera on one frame. */
export type Shot = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** Bank angle in radians (positive = roll right). */
  roll?: number;
};

export const makeCamera = (shot: Shot, aspect: number, near = 1, far = 30000) => {
  const cam = new THREE.PerspectiveCamera(shot.fov, aspect, near, far);
  cam.position.set(...shot.position);
  cam.lookAt(...shot.target);
  if (shot.roll) cam.rotateZ(-shot.roll);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
};

/**
 * Projects a world point into composition pixels, so HTML labels can be
 * pinned to 3D features (e.g. the summit of Everest).
 */
export const projectToScreen = (
  shot: Shot,
  point: [number, number, number],
  width: number,
  height: number,
) => {
  const cam = makeCamera(shot, width / height);
  const v = new THREE.Vector3(...point).project(cam);
  return {
    x: ((v.x + 1) / 2) * width,
    y: ((1 - v.y) / 2) * height,
    visible: v.z < 1 && v.z > -1,
  };
};
