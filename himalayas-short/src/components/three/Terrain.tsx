import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { buildTerrainGeometry, type TerrainOptions } from "../../lib/terrain";

export type Atmosphere = {
  sunDir: [number, number, number];
  sunColor: string;
  skyColor: string;
  fogColor: string;
  zenithColor: string;
  /** Larger = thicker haze. ~0.00035 is a clear alpine day. */
  fogDensity: number;
};

const vertexShader = /* glsl */ `
  uniform float uUplift;
  uniform float uMaxHeight;
  attribute float aRand;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;
  varying float vRand;

  void main() {
    vec3 p = position;
    float s = max(uUplift, 0.015);
    vHeight = p.y / uMaxHeight;
    p.y *= s;
    // Inverse-transpose of a Y scale keeps lighting correct while uplifting.
    vNormal = normalize(vec3(normal.x * s, normal.y, normal.z * s));
    vRand = aRand;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uSnowLine;
  uniform float uUplift;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;
  varying float vRand;

  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  void main() {
    vec3 N = normalize(vNormal);
    float slope = N.y;
    float h = vHeight * uUplift;

    // Rock: dark gneiss / granite with sedimentary banding.
    vec3 rockDark = vec3(0.075, 0.068, 0.064);
    vec3 rockLight = vec3(0.33, 0.30, 0.27);
    vec3 rock = mix(rockDark, rockLight, smoothstep(0.25, 0.8, vRand));
    float bands = sin(vWorld.y * 0.09 + vRand * 4.0) * 0.5 + 0.5;
    rock *= 0.82 + 0.22 * bands;

    // Valley floors: scrub, moraine and pine forest.
    vec3 forest = vec3(0.075, 0.10, 0.06);
    vec3 scree = vec3(0.30, 0.27, 0.22);
    float low = 1.0 - smoothstep(0.05, 0.22, h);
    vec3 base = mix(rock, mix(scree, forest, smoothstep(0.75, 0.95, slope)), low);

    // Snow: settles on gentle slopes above the snow line; wind-scoured on cliffs.
    float n = (vRand - 0.5) * 0.14;
    float snowLine = uSnowLine + n;
    float snow = smoothstep(snowLine - 0.04, snowLine + 0.05, h) * smoothstep(0.42, 0.72, slope);
    snow = max(snow, smoothstep(snowLine + 0.18, snowLine + 0.32, h) * smoothstep(0.2, 0.45, slope));
    vec3 snowCol = vec3(0.92, 0.95, 1.0);
    vec3 albedo = mix(base, snowCol, snow);

    // Lighting: sun + sky dome + bounce.
    vec3 L = normalize(uSunDir);
    float diff = max(dot(N, L), 0.0);
    float wrap = max((dot(N, L) + 0.25) / 1.25, 0.0);
    float hemi = 0.5 + 0.5 * N.y;
    vec3 col = albedo * (uSunColor * mix(diff, wrap, snow * 0.5) * 1.35 + uSkyColor * hemi * 0.32);

    // Cheap ambient occlusion: gullies and valley floors receive less sky light.
    float ao = mix(0.5, 1.0, smoothstep(0.0, 0.45, h)) * mix(0.75, 1.0, slope);
    col *= ao;

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 H = normalize(L + V);
    col += snow * uSunColor * pow(max(dot(N, H), 0.0), 60.0) * 0.35;

    // Aerial perspective + valley haze.
    float dist = length(cameraPosition - vWorld);
    float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
    float valleyHaze = exp(-max(vWorld.y, 0.0) * 0.01) * 0.1;
    fog = clamp(fog + valleyHaze * (1.0 - fog), 0.0, 1.0);
    // Sun-side haze glows warmer.
    float sunAmount = max(dot(-V, L), 0.0);
    vec3 fogCol = mix(uFogColor, uSunColor, pow(sunAmount, 8.0) * 0.5);
    col = mix(col, fogCol, fog);

    col = aces(col * 1.1);
    gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
  }
`;

type Props = {
  options: TerrainOptions;
  atmosphere: Atmosphere;
  /** 0 = flat plain, 1 = full height. Animate for the time-lapse. */
  uplift?: number;
  /** Normalised height (0..1) where snow begins. >1.2 = no snow. */
  snowLine?: number;
};

export const Terrain: React.FC<Props> = ({
  options,
  atmosphere,
  uplift = 1,
  snowLine = 0.42,
}) => {
  const geometry = useMemo(() => buildTerrainGeometry(options), [options]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uUplift: { value: 1 },
          uMaxHeight: { value: options.maxHeight },
          uSunDir: { value: new THREE.Vector3() },
          uSunColor: { value: new THREE.Color() },
          uSkyColor: { value: new THREE.Color() },
          uFogColor: { value: new THREE.Color() },
          uFogDensity: { value: 0.0004 },
          uSnowLine: { value: 0.42 },
        },
      }),
    [options.maxHeight],
  );

  // Mutate uniforms (never replace the object) so three.js picks up changes.
  useLayoutEffect(() => {
    const u = material.uniforms;
    u.uUplift.value = uplift;
    u.uSnowLine.value = snowLine;
    u.uFogDensity.value = atmosphere.fogDensity;
    (u.uSunDir.value as THREE.Vector3).set(...atmosphere.sunDir).normalize();
    (u.uSunColor.value as THREE.Color).set(atmosphere.sunColor);
    (u.uSkyColor.value as THREE.Color).set(atmosphere.skyColor);
    (u.uFogColor.value as THREE.Color).set(atmosphere.fogColor);
  });

  useLayoutEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return <mesh geometry={geometry} material={material} />;
};
