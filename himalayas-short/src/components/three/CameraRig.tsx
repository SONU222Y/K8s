import { useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import * as THREE from "three";
import type { Shot } from "../../lib/camera";

/**
 * Places the R3F default camera from a frame-derived `Shot`.
 * useLayoutEffect guarantees the camera is updated *before* @remotion/three
 * advances the renderer for this frame (no one-frame lag, no flicker).
 */
export const CameraRig: React.FC<{ shot: Shot; near?: number; far?: number }> = ({
  shot,
  near = 1,
  far = 30000,
}) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  useLayoutEffect(() => {
    camera.near = near;
    camera.far = far;
    camera.fov = shot.fov;
    camera.position.set(...shot.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(...shot.target);
    if (shot.roll) camera.rotateZ(-shot.roll);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  });

  return null;
};
