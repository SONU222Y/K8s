import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import type { Atmosphere } from "./Terrain";

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float t = pow(clamp(d.y, 0.0, 1.0), 0.45);
    vec3 col = mix(uHorizon, uZenith, t);
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunColor * (pow(s, 6.0) * 0.25 + pow(s, 60.0) * 0.6 + smoothstep(0.9994, 0.9998, s) * 2.5);
    // Below the horizon fade into haze so the terrain edge never shows.
    col = mix(col, uHorizon, smoothstep(0.02, -0.15, d.y));
    gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
  }
`;

/** Gradient sky dome with a physically-inspired sun disc and glow. */
export const Sky: React.FC<{ atmosphere: Atmosphere; radius?: number }> = ({
  atmosphere,
  radius = 20000,
}) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uSunColor: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3() },
        },
      }),
    [],
  );

  useLayoutEffect(() => {
    const u = material.uniforms;
    (u.uZenith.value as THREE.Color).set(atmosphere.zenithColor);
    (u.uHorizon.value as THREE.Color).set(atmosphere.fogColor);
    (u.uSunColor.value as THREE.Color).set(atmosphere.sunColor);
    (u.uSunDir.value as THREE.Vector3).set(...atmosphere.sunDir).normalize();
  });

  useLayoutEffect(() => () => material.dispose(), [material]);

  return (
    <mesh material={material} renderOrder={-1}>
      <sphereGeometry args={[radius, 48, 24]} />
    </mesh>
  );
};
