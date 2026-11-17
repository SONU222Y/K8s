import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { mulberry32 } from "../../lib/noise";
import { getCloudLayerTexture, getCloudPuffTexture } from "../../lib/textures";

type PuffProps = {
  /** Scene-local frame; drives the drift. Never animate clouds on their own. */
  frame: number;
  count?: number;
  seed?: number;
  /** World-space box the puffs live in. */
  area: { x: [number, number]; y: [number, number]; z: [number, number] };
  scale?: [number, number];
  /** World units per frame along +X (time-lapse = large values). */
  drift?: number;
  opacity?: number;
  tint?: string;
};

/** Billboard cumulus puffs that drift deterministically with the frame. */
export const CloudPuffs: React.FC<PuffProps> = ({
  frame,
  count = 26,
  seed = 3,
  area,
  scale = [500, 1100],
  drift = 2,
  opacity = 0.85,
  tint = "#ffffff",
}) => {
  const texture = useMemo(() => getCloudPuffTexture(), []);
  const puffs = useMemo(() => {
    const rand = mulberry32(seed);
    return new Array(count).fill(0).map(() => ({
      x: area.x[0] + rand() * (area.x[1] - area.x[0]),
      y: area.y[0] + rand() * (area.y[1] - area.y[0]),
      z: area.z[0] + rand() * (area.z[1] - area.z[0]),
      s: scale[0] + rand() * (scale[1] - scale[0]),
      speed: 0.6 + rand() * 0.8,
      rot: rand() * Math.PI * 2,
    }));
  }, [area, count, scale, seed]);

  useLayoutEffect(() => () => texture.dispose(), [texture]);

  const spanX = area.x[1] - area.x[0];

  return (
    <group>
      {puffs.map((p, i) => {
        // Wrap around the box so clouds never run out.
        const x = area.x[0] + ((((p.x - area.x[0] + frame * drift * p.speed) % spanX) + spanX) % spanX);
        const edgeFade = Math.min(1, (x - area.x[0]) / (spanX * 0.12), (area.x[1] - x) / (spanX * 0.12));
        return (
          <sprite key={i} position={[x, p.y, p.z]} scale={[p.s * 1.6, p.s * 0.8, 1]}>
            <spriteMaterial
              map={texture}
              transparent
              depthWrite={false}
              opacity={opacity * Math.max(0, edgeFade)}
              color={tint}
              rotation={p.rot * 0.1}
            />
          </sprite>
        );
      })}
    </group>
  );
};

type LayerProps = {
  frame: number;
  height: number;
  size?: number;
  opacity?: number;
  drift?: [number, number];
  tint?: string;
};

/** A huge translucent sheet that intersects the terrain = valley fog / sea of clouds. */
export const CloudLayer: React.FC<LayerProps> = ({
  frame,
  height,
  size = 7000,
  opacity = 0.75,
  drift = [1.2, 0.4],
  tint = "#ffffff",
}) => {
  const texture = useMemo(() => getCloudLayerTexture(), []);
  useLayoutEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh
      position={[frame * drift[0], height, frame * drift[1]]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        opacity={opacity}
        color={tint}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
};
