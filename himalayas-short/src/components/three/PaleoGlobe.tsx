import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { createNoise2D, fbm, mulberry32, smoothstep } from "../../lib/noise";
import { getGlobeCloudTexture } from "../../lib/textures";
import {
  AFRICA_ARABIA,
  ANTARCTICA,
  AUSTRALIA,
  EURASIA,
  MADAGASCAR,
  SOUTH_AMERICA,
  TETHYS_TRENCH,
  indiaAt,
  indiaCentroidAt,
  type LonLat,
} from "../../data/paleoGeography";

const TEX_W = 2048;
const TEX_H = 1024;

const px = ([lon, lat]: LonLat): [number, number] => [
  ((lon + 180) / 360) * TEX_W,
  ((90 - lat) / 180) * TEX_H,
];

let baseLayers: { ocean: HTMLCanvasElement; land: HTMLCanvasElement } | null = null;

/** Pre-renders the ocean floor and a biome-coloured land "paint" (once). */
const getBaseLayers = () => {
  if (baseLayers) return baseLayers;
  const W = 1024;
  const H = 512;
  const noise = createNoise2D(55);
  const noise2 = createNoise2D(56);

  const mk = () => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    return c;
  };
  const oceanSmall = mk();
  const landSmall = mk();
  const oc = oceanSmall.getContext("2d")!;
  const lc = landSmall.getContext("2d")!;
  const oImg = oc.createImageData(W, H);
  const lImg = lc.createImageData(W, H);

  for (let y = 0; y < H; y++) {
    const lat = 90 - (y / H) * 180;
    const absLat = Math.abs(lat);
    for (let x = 0; x < W; x++) {
      const n = fbm(noise, x / 60, y / 60, 5) * 0.5 + 0.5;
      const n2 = fbm(noise2, x / 18, y / 18, 3) * 0.5 + 0.5;
      const i = (y * W + x) * 4;
      // Deep ocean: navy with subtle abyssal-plain variation.
      oImg.data[i] = 8 + n * 14;
      oImg.data[i + 1] = 34 + n * 30;
      oImg.data[i + 2] = 70 + n * 42;
      oImg.data[i + 3] = 255;
      // Eocene hothouse: no polar ice caps. Deserts around 15–32°, forest elsewhere.
      const desert = smoothstep(12, 18, absLat) * (1 - smoothstep(30, 36, absLat)) * smoothstep(0.35, 0.65, n);
      const forest: [number, number, number] = [34 + n2 * 20, 70 + n2 * 30 + n * 20, 30 + n2 * 14];
      const arid: [number, number, number] = [150 + n2 * 40, 122 + n2 * 32, 78 + n2 * 20];
      const highland = smoothstep(0.62, 0.8, n);
      for (let k = 0; k < 3; k++) {
        let v = forest[k] * (1 - desert) + arid[k] * desert;
        v = v * (1 - highland * 0.35) + 110 * highland * 0.35;
        lImg.data[i + k] = v;
      }
      lImg.data[i + 3] = 255;
    }
  }
  oc.putImageData(oImg, 0, 0);
  lc.putImageData(lImg, 0, 0);

  const up = (src: HTMLCanvasElement) => {
    const c = document.createElement("canvas");
    c.width = TEX_W;
    c.height = TEX_H;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, TEX_W, TEX_H);
    return c;
  };
  baseLayers = { ocean: up(oceanSmall), land: up(landSmall) };
  return baseLayers;
};

const tracePath = (ctx: CanvasRenderingContext2D, poly: LonLat[]) => {
  ctx.beginPath();
  poly.forEach((p, i) => {
    const [x, y] = px(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
};

const drawLand = (ctx: CanvasRenderingContext2D, poly: LonLat[], pattern: CanvasPattern) => {
  ctx.lineJoin = "round";
  tracePath(ctx, poly);
  // Continental shelf: shallow turquoise halo.
  ctx.strokeStyle = "rgba(60,150,175,0.35)";
  ctx.lineWidth = 30;
  ctx.stroke();
  ctx.strokeStyle = "rgba(95,185,195,0.45)";
  ctx.lineWidth = 13;
  ctx.stroke();
  ctx.fillStyle = "rgba(95,185,195,0.45)";
  ctx.fill();
  ctx.fillStyle = pattern;
  ctx.fill();
  ctx.strokeStyle = "rgba(20,30,20,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
};

const drawMap = (ctx: CanvasRenderingContext2D, progress: number, frame: number) => {
  const { ocean, land } = getBaseLayers();
  const pattern = ctx.createPattern(land, "no-repeat")!;
  ctx.drawImage(ocean, 0, 0);
  for (const poly of [EURASIA, AFRICA_ARABIA, MADAGASCAR, AUSTRALIA, ANTARCTICA, SOUTH_AMERICA]) {
    drawLand(ctx, poly, pattern);
  }

  // Subduction trench along Asia's margin (teeth point to the over-riding plate).
  ctx.save();
  ctx.strokeStyle = "#ff5a2a";
  ctx.fillStyle = "#ff5a2a";
  ctx.lineWidth = 4;
  ctx.shadowColor = "rgba(255,90,42,0.9)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  TETHYS_TRENCH.forEach((p, i) => {
    const [x, y] = px([p[0], p[1] - 1.2]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  for (let i = 0; i < TETHYS_TRENCH.length - 1; i++) {
    const [ax, ay] = px([TETHYS_TRENCH[i][0], TETHYS_TRENCH[i][1] - 1.2]);
    const [bx, by] = px([TETHYS_TRENCH[i + 1][0], TETHYS_TRENCH[i + 1][1] - 1.2]);
    for (let t = 0.25; t < 1; t += 0.5) {
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y - 9);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  // India: the star of the show, outlined with a hot rim.
  const india = indiaAt(progress);
  drawLand(ctx, india, pattern);
  ctx.save();
  tracePath(ctx, india);
  ctx.strokeStyle = "#ffb347";
  ctx.lineWidth = 5;
  ctx.shadowColor = "rgba(255,160,60,1)";
  ctx.shadowBlur = 18 + 6 * Math.sin(frame / 6);
  ctx.stroke();
  ctx.restore();

  // Direction-of-travel arrow in the closing ocean gap.
  const [clon, clat] = indiaCentroidAt(progress);
  const tipLat = clat + 13.5;
  const gap = 28 - tipLat;
  const alpha = smoothstep(2, 7, gap);
  if (alpha > 0.01) {
    const len = Math.min(10, gap - 2);
    const [x0, y0] = px([clon, tipLat + 1.5]);
    const [x1, y1] = px([clon, tipLat + 1.5 + len]);
    ctx.save();
    ctx.globalAlpha = alpha * (0.75 + 0.25 * Math.sin(frame / 5));
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1 + 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 20, y1 + 26);
    ctx.lineTo(x1 + 20, y1 + 26);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
};

/** Unit-sphere direction for a lon/lat, matching THREE.SphereGeometry's UVs. */
export const lonLatToVector = ([lon, lat]: LonLat, radius = 1) => {
  const L = (lon * Math.PI) / 180;
  const P = (lat * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.cos(P) * Math.cos(L),
    radius * Math.sin(P),
    -radius * Math.cos(P) * Math.sin(L),
  );
};

/** Euler rotation that turns [lon, lat] to face the +Z camera. */
export const globeRotationFacing = ([lon, lat]: LonLat): [number, number, number] => [
  (lat * Math.PI) / 180,
  -Math.PI / 2 - (lon * Math.PI) / 180,
  0,
];

const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const atmosphereFragment = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.68 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
    gl_FragColor = vec4(0.35, 0.65, 1.0, 1.0) * intensity * 1.6;
  }
`;

type Props = {
  progress: number;
  frame: number;
  rotation: [number, number, number];
};

/** The Earth ~70→50 Ma: paleo-continents, clouds, atmosphere and starfield. */
export const PaleoGlobe: React.FC<Props> = ({ progress, frame, rotation }) => {
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = TEX_W;
    c.height = TEX_H;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return { canvas: c, texture: t };
  }, []);
  const clouds = useMemo(() => getGlobeCloudTexture(), []);

  const stars = useMemo(() => {
    const rand = mulberry32(9);
    const pos = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos[i * 3] = 60 * r * Math.cos(th);
      pos[i * 3 + 1] = 60 * u;
      pos[i * 3 + 2] = 60 * r * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useLayoutEffect(() => {
    drawMap(canvas.getContext("2d")!, progress, frame);
    texture.needsUpdate = true;
  }, [canvas, texture, progress, frame]);

  useLayoutEffect(
    () => () => {
      texture.dispose();
      clouds.dispose();
      stars.dispose();
    },
    [texture, clouds, stars],
  );

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[-3, 1.6, 4]} intensity={2.6} color="#fff6e8" />
      <points geometry={stars}>
        <pointsMaterial size={2.2} sizeAttenuation={false} color="#cfd8ff" transparent opacity={0.85} />
      </points>
      <group rotation={rotation}>
        <mesh>
          <sphereGeometry args={[1, 128, 96]} />
          <meshStandardMaterial map={texture} roughness={0.85} metalness={0} />
        </mesh>
        <mesh rotation={[0, frame * 0.0012, 0]}>
          <sphereGeometry args={[1.012, 96, 72]} />
          <meshStandardMaterial map={clouds} transparent opacity={0.5} depthWrite={false} />
        </mesh>
      </group>
      <mesh scale={1.11}>
        <sphereGeometry args={[1, 64, 48]} />
        <shaderMaterial
          vertexShader={atmosphereVertex}
          fragmentShader={atmosphereFragment}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  );
};
