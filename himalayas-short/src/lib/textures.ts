import * as THREE from "three";
import { createNoise2D, fbm, mulberry32, smoothstep } from "./noise";

/**
 * All textures are generated procedurally on a <canvas>, so the project has
 * zero dependency on remote image URLs. Pixel data is cached per process;
 * every caller gets its own THREE.Texture wrapper.
 */

let puffCanvas: HTMLCanvasElement | null = null;

/** A soft, billowy cumulus puff (white, alpha-masked). */
export const getCloudPuffTexture = (): THREE.Texture => {
  if (!puffCanvas) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    const rand = mulberry32(42);
    for (let i = 0; i < 46; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.pow(rand(), 0.7) * size * 0.26;
      const x = size / 2 + Math.cos(a) * r * 1.3;
      const y = size / 2 + Math.sin(a) * r * 0.65 + 10;
      const rad = size * (0.08 + rand() * 0.14);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "rgba(255,255,255,0.32)");
      g.addColorStop(0.6, "rgba(245,248,255,0.14)");
      g.addColorStop(1, "rgba(240,245,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    puffCanvas = c;
  }
  const tex = new THREE.CanvasTexture(puffCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

let layerCanvas: HTMLCanvasElement | null = null;

/** A wide sheet of stratus / valley fog: fbm noise in the alpha channel. */
export const getCloudLayerTexture = (): THREE.Texture => {
  if (!layerCanvas) {
    const size = 512;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(size, size);
    const noise = createNoise2D(1234);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(noise, x / 90, y / 90, 5) * 0.5 + 0.5;
        const edge =
          smoothstep(0, 60, x) * smoothstep(size, size - 60, x) *
          smoothstep(0, 60, y) * smoothstep(size, size - 60, y);
        const a = smoothstep(0.42, 0.78, n) * edge;
        const i = (y * size + x) * 4;
        img.data[i] = 248;
        img.data[i + 1] = 250;
        img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    layerCanvas = c;
  }
  const tex = new THREE.CanvasTexture(layerCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

let globeCloudCanvas: HTMLCanvasElement | null = null;

/** Equirectangular cloud cover for the globe (white + alpha). */
export const getGlobeCloudTexture = (): THREE.Texture => {
  if (!globeCloudCanvas) {
    const w = 1024;
    const h = 512;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    const noise = createNoise2D(777);
    for (let y = 0; y < h; y++) {
      const lat = 90 - (y / h) * 180;
      // Cloud bands: ITCZ near the equator and storm tracks at ~55°.
      const band =
        0.55 +
        0.25 * Math.exp(-Math.pow(lat / 10, 2)) +
        0.25 * Math.exp(-Math.pow((Math.abs(lat) - 55) / 12, 2)) -
        0.2 * Math.exp(-Math.pow((Math.abs(lat) - 25) / 8, 2));
      for (let x = 0; x < w; x++) {
        const n = fbm(noise, x / 70, y / 45, 6) * 0.5 + 0.5;
        const a = smoothstep(0.62, 0.9, n * band + 0.12);
        const i = (y * w + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 230);
      }
    }
    ctx.putImageData(img, 0, 0);
    globeCloudCanvas = c;
  }
  const tex = new THREE.CanvasTexture(globeCloudCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};
