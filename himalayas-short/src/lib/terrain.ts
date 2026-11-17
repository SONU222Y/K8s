import * as THREE from "three";
import { createNoise2D, fbm, ridged, smoothstep } from "./noise";

/**
 * Procedural Himalaya-style heightfield.
 *
 * Built from domain-warped ridged multifractal noise (sharp crests and deep
 * V-shaped valleys), an optional carved valley for the camera to fly through,
 * and an optional pyramidal "Everest" massif.
 */
export type TerrainOptions = {
  seed: number;
  /** World size of the square terrain, in scene units. */
  size: number;
  /** Grid resolution per side. 400 => 160k vertices. */
  segments: number;
  /** Height of the tallest ridge, in scene units. */
  maxHeight: number;
  /** Carve a winding valley the camera can fly through (Scene 1). */
  valley?: { amplitude: number; wavelength: number; width: number };
  /** Add a dominant pyramidal peak (Scenes 4 & 5). */
  everest?: { x: number; z: number; height: number; radius: number };
};

export const TERRAIN_FLYTHROUGH: TerrainOptions = {
  seed: 7,
  size: 6000,
  segments: 600,
  maxHeight: 900,
  valley: { amplitude: 420, wavelength: 3400, width: 170 },
};

export const TERRAIN_EVEREST: TerrainOptions = {
  seed: 21,
  size: 6000,
  segments: 640,
  maxHeight: 820,
  everest: { x: 0, z: -300, height: 1.25, radius: 900 },
};

export const valleyCenterX = (
  z: number,
  valley: NonNullable<TerrainOptions["valley"]>,
) =>
  valley.amplitude * Math.sin((z / valley.wavelength) * Math.PI * 2) +
  valley.amplitude * 0.35 * Math.sin((z / (valley.wavelength * 0.43)) * Math.PI * 2 + 1.3);

export type HeightField = {
  /** Height in world units, including maxHeight scaling. */
  heightAt: (x: number, z: number) => number;
  options: TerrainOptions;
};

export const createHeightField = (options: TerrainOptions): HeightField => {
  const n1 = createNoise2D(options.seed);
  const n2 = createNoise2D(options.seed + 101);
  const n3 = createNoise2D(options.seed + 202);
  const n4 = createNoise2D(options.seed + 303);

  const heightAt = (x: number, z: number) => {
    const wx = fbm(n2, x * 0.0003, z * 0.0003, 3) * 0.8;
    const wz = fbm(n3, x * 0.0003 + 5.2, z * 0.0003 + 1.3, 3) * 0.8;
    // 5 octaves: the finest ridge detail stays wider than ~7 grid cells, so
    // crests don't alias into sawtooth edges.
    const r = ridged(n1, x * 0.00062 + wx, z * 0.00062 + wz, 5);
    const massif = fbm(n4, x * 0.00032, z * 0.00032, 3) * 0.5 + 0.5;
    const rolling = fbm(n1, x * 0.0004 + 7.7, z * 0.0004 - 3.1, 4) * 0.5 + 0.5;
    let h = (0.72 * Math.pow(r, 1.35) + 0.28 * rolling * rolling) * (0.3 + 0.9 * massif);

    if (options.valley) {
      const d = Math.abs(x - valleyCenterX(z, options.valley));
      const m = smoothstep(options.valley.width * 0.35, options.valley.width * 1.7, d);
      h *= 0.16 + 0.84 * m;
    }

    if (options.everest) {
      const e = options.everest;
      const dx = x - e.x;
      const dz = z - e.z;
      // Rotate 30° so the three faces don't align with the grid.
      const c = Math.cos(0.52);
      const s = Math.sin(0.52);
      const u = dx * c - dz * s;
      const v = dx * s + dz * c;
      const diamond = 1 - (Math.abs(u) / e.radius + Math.abs(v) / (e.radius * 0.8));
      if (diamond > 0) {
        h += e.height * Math.pow(diamond, 1.45) * (0.9 + 0.18 * r);
      }
    }
    return h * options.maxHeight;
  };

  return { heightAt, options };
};

const geometryCache = new Map<string, { positions: Float32Array; rand: Float32Array }>();

/**
 * Builds (and memoises the heavy noise evaluation of) the terrain mesh.
 * Returns a fresh BufferGeometry each call so separate <ThreeCanvas>
 * instances never share GPU resources.
 */
export const buildTerrainGeometry = (options: TerrainOptions): THREE.BufferGeometry => {
  const key = JSON.stringify(options);
  let cached = geometryCache.get(key);
  if (!cached) {
    const field = createHeightField(options);
    const detail = createNoise2D(options.seed + 999);
    const plane = new THREE.PlaneGeometry(
      options.size,
      options.size,
      options.segments,
      options.segments,
    );
    plane.rotateX(-Math.PI / 2);
    const pos = plane.attributes.position.array as Float32Array;
    const rand = new Float32Array(pos.length / 3);
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const z = pos[i + 2];
      pos[i + 1] = field.heightAt(x, z);
      rand[i / 3] = fbm(detail, x * 0.004, z * 0.004, 4) * 0.5 + 0.5;
    }
    cached = { positions: pos.slice(), rand };
    geometryCache.set(key, cached);
    plane.dispose();
  }

  const geo = new THREE.PlaneGeometry(
    options.size,
    options.size,
    options.segments,
    options.segments,
  );
  geo.rotateX(-Math.PI / 2);
  (geo.attributes.position.array as Float32Array).set(cached.positions);
  geo.attributes.position.needsUpdate = true;
  geo.setAttribute("aRand", new THREE.BufferAttribute(cached.rand, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
};
