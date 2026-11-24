// Procedural landscape "plates" drawn as SVG data URIs. Each place name seeds
// its own random generator, so a plate looks the same on every load and the
// app never depends on remote images.

import { NUMERALS } from './places';

const W = 400;
const H = 512;

const seeded = seed => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hash = text => {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};
const pick = (r, list) => list[Math.floor(r() * list.length)];

// A ridge line across the full width, closed down to the bottom edge.
const ridge = (r, base, amp, rough, taper = null) => {
  const f1 = 0.006 + r() * 0.01;
  const f2 = 0.022 + r() * 0.03;
  const p1 = r() * Math.PI * 2;
  const p2 = r() * Math.PI * 2;
  let d = `M0 ${H}`;
  for (let x = 0; x <= W; x += 8) {
    const k = taper ? taper(x) : 1;
    const wave = 0.55 * Math.sin(x * f1 + p1) + 0.3 * Math.sin(x * f2 + p2) + 0.25;
    const y = base - amp * k * wave - (r() - 0.5) * rough * k;
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return `${d} L${W} ${H} Z`;
};

const sky = (top, bottom) =>
  `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;

const frame = (label, ink) =>
  `<rect x="14" y="14" width="372" height="484" fill="none" stroke="${ink}" stroke-opacity=".32"/>` +
  `<text x="26" y="486" fill="${ink}" fill-opacity=".72" font-family="ui-monospace, Menlo, monospace" font-size="11" letter-spacing="2">${label}</text>`;

const highlands = r => {
  const [top, bottom] = pick(r, [
    ['#8ea7b6', '#f0d2ab'],
    ['#a3b8c3', '#e4e1d4'],
    ['#5c6b88', '#e8b48f'],
    ['#7e93a0', '#d9c9b0']
  ]);
  const near = '#1b2427';
  const far = mix(bottom, near, 0.28);
  const sunX = 70 + r() * 260;
  const sunY = 90 + r() * 110;
  const sunR = 24 + r() * 22;
  let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
  body += `<circle cx="${sunX}" cy="${sunY}" r="${sunR * 2.4}" fill="#fff6e4" opacity=".16"/>`;
  body += `<circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="#fff4de" opacity=".9"/>`;
  const layers = 5;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    body += `<path d="${ridge(r, 250 + i * 52, 120 - i * 17, 10 - i, null)}" fill="${mix(far, near, t)}"/>`;
    if (i === 1 || i === 2) body += `<rect y="${230 + i * 52}" width="${W}" height="110" fill="url(#m)"/>`;
  }
  const defs =
    sky(top, bottom) +
    `<linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bottom}" stop-opacity="0"/><stop offset=".6" stop-color="${bottom}" stop-opacity=".45"/><stop offset="1" stop-color="${bottom}" stop-opacity="0"/></linearGradient>`;
  return { defs, body, ink: '#f4efe2' };
};

const coast = r => {
  const [top, bottom, sea] = pick(r, [
    ['#9db4c0', '#f2dcc0', '#5f7f8c'],
    ['#6f87a3', '#f0c39d', '#40566d'],
    ['#b6c4c6', '#ece6da', '#6e8a8f'],
    ['#7c97a2', '#dfe2d6', '#4f6c74']
  ]);
  const horizon = 300 + r() * 20;
  const near = '#1d2628';
  const sunX = 90 + r() * 220;
  const sunY = horizon - 40 - r() * 60;
  const sunR = 20 + r() * 18;
  const flip = r() < 0.5;
  const cut = 150 + r() * 90;
  let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
  body += `<circle cx="${sunX}" cy="${sunY}" r="${sunR * 2.6}" fill="#fff6e4" opacity=".18"/>`;
  body += `<circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="#fff4de" opacity=".92"/>`;
  body += `<rect y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#w)"/>`;
  for (let k = 0; k < 16; k++) {
    const y = horizon + 6 + k * k * 0.9 + k * 6;
    const half = (sunR * 1.4 - k * 1.1) * (0.6 + r() * 0.6);
    if (half <= 2 || y > H) continue;
    body += `<line x1="${(sunX - half).toFixed(1)}" x2="${(sunX + half).toFixed(1)}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#fff4de" stroke-width="2" stroke-opacity="${(0.55 - k * 0.03).toFixed(2)}"/>`;
  }
  for (let k = 0; k < 7; k++) {
    const y = horizon + 40 + k * 26 + r() * 10;
    const x = r() * 260;
    body += `<line x1="${x.toFixed(1)}" x2="${(x + 60 + r() * 90).toFixed(1)}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${bottom}" stroke-opacity=".18"/>`;
  }
  const headland = ridge(r, horizon + 2, 130, 12, x => (x < cut ? Math.pow(1 - x / cut, 0.55) : 0));
  const cliff = ridge(r, H - 30, 60, 8, x => (x < cut * 0.8 ? Math.pow(1 - x / (cut * 0.8), 0.4) : 0));
  const group = `<path d="${headland}" fill="${mix(sea, near, 0.45)}"/><path d="${cliff}" fill="${near}"/>`;
  body += flip ? `<g transform="translate(${W} 0) scale(-1 1)">${group}</g>` : group;
  const defs =
    sky(top, bottom) +
    `<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(sea, bottom, 0.35)}"/><stop offset="1" stop-color="${mix(sea, near, 0.55)}"/></linearGradient>`;
  return { defs, body, ink: '#f4efe2' };
};

const night = r => {
  const [top, bottom] = pick(r, [
    ['#070c1a', '#26365a'],
    ['#0b1022', '#3a3f63'],
    ['#050a14', '#1d3a4f'],
    ['#0a0d1c', '#43395a']
  ]);
  const near = '#05080e';
  const far = mix(bottom, '#0b1424', 0.35);
  let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
  for (let i = 0; i < 110; i++) {
    const x = r() * W;
    const y = Math.pow(r(), 1.4) * 330;
    const size = 0.35 + Math.pow(r(), 3) * 1.4;
    body += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(2)}" fill="#f6f1e2" opacity="${(0.35 + r() * 0.65).toFixed(2)}"/>`;
  }
  const moonX = 80 + r() * 240;
  const moonY = 80 + r() * 110;
  const moonR = 18 + r() * 14;
  const crescent = r() < 0.5;
  body += `<circle cx="${moonX}" cy="${moonY}" r="${moonR * 3.2}" fill="#e9e2c8" opacity=".09"/>`;
  body += crescent
    ? `<circle cx="${moonX}" cy="${moonY}" r="${moonR}" fill="#efe8d2" mask="url(#c)"/>`
    : `<circle cx="${moonX}" cy="${moonY}" r="${moonR}" fill="#efe8d2"/>`;
  const lake = r() < 0.5;
  const layers = 3;
  for (let i = 0; i < layers; i++) {
    body += `<path d="${ridge(r, 300 + i * 46, 100 - i * 22, 8, null)}" fill="${mix(far, near, i / (layers - 1) * 0.8)}"/>`;
  }
  if (lake) {
    const y0 = 410;
    body += `<rect y="${y0}" width="${W}" height="${H - y0}" fill="${mix(bottom, near, 0.55)}"/>`;
    for (let k = 0; k < 9; k++) {
      const y = y0 + 8 + k * 10;
      const half = moonR * (1.1 - k * 0.09) * (0.6 + r() * 0.6);
      body += `<line x1="${(moonX - half).toFixed(1)}" x2="${(moonX + half).toFixed(1)}" y1="${y}" y2="${y}" stroke="#efe8d2" stroke-width="1.6" stroke-opacity="${(0.5 - k * 0.045).toFixed(2)}"/>`;
    }
    body += `<path d="${ridge(r, H - 8, 30, 6, x => (x < 140 ? 1 - x / 140 : 0))}" fill="${near}"/>`;
  } else {
    body += `<path d="${ridge(r, H - 20, 46, 8, null)}" fill="${near}"/>`;
  }
  const off = moonR * (0.45 + r() * 0.3);
  const defs =
    sky(top, bottom) +
    `<mask id="c"><circle cx="${moonX}" cy="${moonY}" r="${moonR}" fill="#fff"/><circle cx="${moonX + off}" cy="${moonY - off * 0.35}" r="${moonR}" fill="#000"/></mask>`;
  return { defs, body, ink: '#e9e4d4' };
};

const STYLES = { ridges: highlands, coast, night };

export const plateFor = (volume, place, index) => {
  const r = seeded(hash(`${volume.id}:${place.name}`));
  const { defs, body, ink } = STYLES[volume.style](r);
  const label = `PL. ${NUMERALS[index]} · ${place.coords.split(' ')[0]}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}${frame(label, ink)}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
