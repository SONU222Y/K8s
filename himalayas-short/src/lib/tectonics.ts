import { clamp, smoothstep } from "./noise";

/**
 * Kinematic model of the India–Eurasia collision, in SVG pixel space.
 *
 * The Indian plate is a strip of material (coordinate `m`) that slides along
 * a curved path (coordinate `u = m + s`, where `s` is how far India has
 * travelled). Beyond the trench, the dip of the path depends on the material
 * passing through it:
 *   - dense OCEANIC lithosphere dives steeply (~50°): subduction;
 *   - buoyant CONTINENTAL lithosphere can't sink, so it is shoved at a shallow
 *     angle *under* Eurasia (underthrusting), doubling the crust above it.
 * That single rule reproduces the textbook sequence: subduction → closure of
 * the Tethys → continental collision → crustal thickening → uplift.
 */

export const GEO = {
  x0: 70, // left edge of the block's front face
  xR: 890, // right edge of the front face
  yBottom: 1430,
  sea: 860, // sea level
  yc: 900, // reference: top of oceanic crust on the flat plate
  trenchX: 520,
  depth: { x: 120, y: -95 }, // oblique offset of the block's back face
  mC: 160, // material coordinate where India's continental crust ends
  margin: 50, // width of India's continental slope
  slabEnd: 900, // leading tip of the (already partly subducted) slab
  eurCrustBase: 925,
  eurMantleBase: 1015,
  mountainHeight: 210,
};

export const uTrench = GEO.trenchX - GEO.x0;

/** 1 = continental crust, 0 = oceanic crust. */
export const continental = (m: number) => 1 - smoothstep(GEO.mC, GEO.mC + GEO.margin, m);


export type PlatePath = {
  s: number;
  /** World position + local dip angle for arc position u. */
  at: (u: number) => { x: number; y: number; theta: number };
};

export const buildPlatePath = (s: number): PlatePath => {
  const du = 3;
  const xs: number[] = [];
  const ys: number[] = [];
  const th: number[] = [];
  let x = GEO.trenchX;
  let y = GEO.yc;
  const uMax = s + GEO.slabEnd + 50;
  for (let u = uTrench; u <= uMax; u += du) {
    const d = u - uTrench;
    const cont = continental(u - s);
    const thetaOcean = 0.87 * smoothstep(0, 230, d);
    const thetaCont = 0.66 * Math.sin(Math.PI * clamp(d / 210));
    const theta = thetaOcean + (thetaCont - thetaOcean) * cont;
    xs.push(x);
    ys.push(y);
    th.push(theta);
    x += Math.cos(theta) * du;
    y += Math.sin(theta) * du;
  }
  const at = (u: number) => {
    if (u <= uTrench) return { x: GEO.x0 + u, y: GEO.yc, theta: 0 };
    const f = (u - uTrench) / du;
    const i = Math.min(xs.length - 2, Math.floor(f));
    const t = Math.min(1, f - i);
    return {
      x: xs[i] + (xs[i + 1] - xs[i]) * t,
      y: ys[i] + (ys[i + 1] - ys[i]) * t,
      theta: th[i] + (th[i + 1] - th[i]) * t,
    };
  };
  return { s, at };
};

/** Point offset along the plate's upward normal. */
export const offsetPoint = (path: PlatePath, m: number, offset: number) => {
  const p = path.at(m + path.s);
  return { x: p.x + Math.sin(p.theta) * offset, y: p.y - Math.cos(p.theta) * offset };
};

/** SVG polygon for a plate layer between two offset functions over [m0, m1]. */
export const layerPath = (
  path: PlatePath,
  m0: number,
  m1: number,
  top: (m: number) => number,
  bottom: (m: number) => number,
  step = 4,
  dy = 0,
): string => {
  const pts: string[] = [];
  for (let m = m0; m <= m1; m += step) {
    const p = offsetPoint(path, m, top(m));
    pts.push(`${p.x.toFixed(1)},${(p.y + dy).toFixed(1)}`);
  }
  for (let m = m1; m >= m0; m -= step) {
    const p = offsetPoint(path, m, bottom(m));
    pts.push(`${p.x.toFixed(1)},${(p.y + dy).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
};

/** Normalised Himalaya + Tibetan Plateau profile (0..1) along x. */
export const mountainProfile = (x: number) => {
  const t = GEO.trenchX;
  const himalaya = smoothstep(t - 40, t + 40, x) * (1 - smoothstep(t + 150, t + 240, x));
  const jag = 0.8 + 0.12 * Math.sin(x * 0.05 + 0.6) + 0.08 * Math.sin(x * 0.12 + 1.7);
  const plateau = smoothstep(t + 120, t + 250, x) * 0.58 * (0.95 + 0.05 * Math.sin(x * 0.05));
  return Math.max(himalaya * jag, plateau);
};

/** Top surface of Eurasia (y in px) for a given uplift 0..1. */
export const eurasiaTop = (x: number, uplift: number) => {
  const shelf = GEO.yc + (838 - GEO.yc) * smoothstep(GEO.trenchX, GEO.trenchX + 70, x);
  return shelf - uplift * GEO.mountainHeight * mountainProfile(x);
};
