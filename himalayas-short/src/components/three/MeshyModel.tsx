import { useEffect, useState } from "react";
import { useDelayRender } from "remotion";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { assetUrl } from "../../config/assets";

type Props = {
  /** Path inside /public, e.g. "models/trilobite.glb". */
  path: string;
  /** The model is normalised so its largest side equals this many units. */
  size?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
};

/**
 * Loads a Meshy-exported .glb and normalises it (centred, uniform size), so
 * any model you generate drops in without manual scale tweaking.
 * Rendering is held with delayRender() until the file is parsed.
 */
export const MeshyModel: React.FC<Props> = ({
  path,
  size = 2,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}) => {
  const [scene, setScene] = useState<THREE.Object3D | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`Loading 3D model ${path}`));

  useEffect(() => {
    new GLTFLoader().load(
      assetUrl(path),
      (gltf) => {
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const dims = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const s = size / Math.max(dims.x, dims.y, dims.z);
        const wrapper = new THREE.Group();
        root.position.sub(center);
        wrapper.add(root);
        wrapper.scale.setScalar(s);
        setScene(wrapper);
        continueRender(handle);
      },
      undefined,
      (err) => cancelRender(err),
    );
  }, [path, size, handle, continueRender, cancelRender]);

  if (!scene) return null;
  return <primitive object={scene} position={position} rotation={rotation} />;
};
