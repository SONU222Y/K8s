/**
 * Simplified paleogeography (~70 to ~50 million years ago), as [lon, lat].
 *
 * Coastlines are deliberately coarse (documentary-diagram fidelity, not GIS
 * fidelity), but the key relationships are right for the Late Cretaceous /
 * Early Eocene:
 *  - India is an island continent south of Asia, drifting north and rotating
 *    anticlockwise across the Neo-Tethys Ocean.
 *  - Arabia is still attached to Africa (the Red Sea had not opened).
 *  - Australia is further south, still close to Antarctica.
 *  - The Atlantic is narrower than today.
 */
export type LonLat = [number, number];

export const EURASIA: LonLat[] = [
  [-9, 43], [-9, 37], [-5, 36], [0, 38], [3, 42], [6, 43], [9, 44], [12, 42], [16, 40],
  [19, 42], [23, 38], [26, 40], [30, 41], [36, 37], [42, 38], [48, 36], [54, 33],
  [60, 29], [66, 30], [72, 31.5], [78, 31], [84, 29.5], [90, 28.5], [95, 25], [97, 18],
  [98, 10], [100, 4], [104, 1.4], [103.5, 5], [101, 8], [100, 12.5], [102, 12], [105, 9],
  [107.5, 11], [108.5, 15], [106, 19], [108, 21.5], [115, 22.5], [120, 25.5], [122, 30],
  [121, 36], [118, 38.5], [122, 40], [126, 38], [129, 35], [130, 42], [135, 44], [141, 48],
  [141, 53], [137, 54], [143, 59], [150, 59], [156, 57], [162, 56], [163, 61], [170, 60],
  [178, 64], [180, 66], [180, 72], [160, 71], [140, 73], [130, 71], [115, 74], [105, 77],
  [95, 76], [80, 73], [70, 73], [60, 70], [50, 68], [40, 67], [33, 69], [25, 71], [15, 68],
  [8, 63], [5, 58], [8, 55], [10, 54], [5, 53], [1, 51], [-2, 48], [-4, 48], [-1, 45],
];

export const AFRICA_ARABIA: LonLat[] = [
  [-17, 21], [-16, 12], [-12, 7], [-8, 4.5], [-2, 5], [5, 5], [9, 4], [10, 0], [12, -6],
  [13, -12], [12, -18], [15, -27], [18, -34], [22, -34.5], [27, -33.5], [32, -28],
  [35, -24], [35, -18], [40, -15], [40, -10], [39, -5], [42, 0], [46, 3], [51, 11],
  [52, 13], [52, 16], [57, 19], [59, 22], [56, 26], [52, 24.5], [50, 27], [48, 30],
  [45, 32.5], [40, 34], [36, 33], [35, 31], [32, 31], [25, 32], [20, 31], [15, 32],
  [11, 34], [10, 37], [3, 37], [-2, 35], [-6, 36], [-10, 31], [-13, 27],
];

export const MADAGASCAR: LonLat[] = [
  [44, -25], [47, -25.5], [50, -15.5], [49.5, -12], [47, -14], [44, -17], [43.5, -22],
];

const AUSTRALIA_MODERN: LonLat[] = [
  [114, -22], [114, -34], [118, -35], [124, -34], [130, -32], [135, -35], [138, -35],
  [140, -38], [146, -39], [150, -37], [153, -29], [153, -25], [149, -20], [146, -19],
  [145, -15], [142, -11], [141, -16], [137, -16], [136, -12], [132, -11], [129, -15],
  [126, -14], [122, -17], [118, -20],
];
/** Australia sat ~15° further south (and closer to Antarctica). */
export const AUSTRALIA: LonLat[] = AUSTRALIA_MODERN.map(([lo, la]) => [lo - 4, la - 15]);

export const ANTARCTICA: LonLat[] = [
  ...Array.from({ length: 19 }, (_, i): LonLat => {
    const lon = -180 + i * 20;
    return [lon, -66 + 3 * Math.sin(i * 1.7)];
  }),
  [180, -90],
  [-180, -90],
];

const SOUTH_AMERICA_MODERN: LonLat[] = [
  [-80, 10], [-72, 12], [-62, 10], [-52, 5], [-35, -5], [-39, -15], [-42, -23], [-48, -28],
  [-58, -38], [-65, -42], [-68, -52], [-72, -50], [-74, -40], [-71, -30], [-70, -18],
  [-76, -13], [-81, -5], [-79, 2],
];
export const SOUTH_AMERICA: LonLat[] = SOUTH_AMERICA_MODERN.map(([lo, la]) => [lo + 8, la]);

/** Modern outline of India (incl. Pakistan, the Indian-plate part of the subcontinent). */
export const INDIA_MODERN: LonLat[] = [
  [67, 24.5], [70, 22], [72.5, 21], [73, 16], [74.5, 13], [76, 9.5], [77.5, 8], [79.5, 9.5],
  [80.3, 13], [82, 16.5], [85, 19.5], [87, 21.5], [89, 22], [91, 23], [92.5, 25.5],
  [88, 27.5], [84, 28.5], [80, 30], [77, 32.5], [74, 35], [71, 34], [70, 30.5],
];

export const INDIA_CENTROID: LonLat = [79, 22];

/**
 * India's position for a given drift progress (0 = ~70 Ma, 1 = ~50 Ma,
 * the start of the collision). Offsets are in degrees.
 */
export const indiaAt = (progress: number): LonLat[] => {
  const dLat = -36 * (1 - progress) - 1.5;
  const dLon = -6 * (1 - progress);
  const rot = (-16 * (1 - progress) * Math.PI) / 180; // India rotated anticlockwise as it drifted
  const [cx, cy] = INDIA_CENTROID;
  return INDIA_MODERN.map(([lo, la]) => {
    const x = lo - cx;
    const y = la - cy;
    const rx = x * Math.cos(rot) - y * Math.sin(rot);
    const ry = x * Math.sin(rot) + y * Math.cos(rot);
    return [cx + rx + dLon, cy + ry + dLat];
  });
};

export const indiaCentroidAt = (progress: number): LonLat => [
  INDIA_CENTROID[0] - 6 * (1 - progress),
  INDIA_CENTROID[1] - 36 * (1 - progress) - 1.5,
];

/** The Neo-Tethys subduction zone along Asia's southern margin. */
export const TETHYS_TRENCH: LonLat[] = [
  [50, 31], [56, 29.5], [62, 27.6], [68, 28.6], [74, 29.8], [80, 29.2], [86, 27.8],
  [92, 26.2], [95.5, 22],
];
