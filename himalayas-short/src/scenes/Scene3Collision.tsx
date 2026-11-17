import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CinematicGrade } from "../components/overlays/CinematicGrade";
import { ChapterTitle } from "../components/overlays/Typography";
import { COLORS, LABEL_FONT } from "../config/fonts";
import { smoothstep } from "../lib/noise";
import {
  GEO,
  buildPlatePath,
  continental,
  eurasiaTop,
  layerPath,
  offsetPoint,
  uTrench,
} from "../lib/tectonics";

/** Scene-local keyframes (frames). Retime the geology here. */
const K = {
  subductStart: 10,
  collision: 178, // continental margin reaches the trench, on "...crashed in" (≈17.7 s)
  pushEnd: 300,
  upliftStart: 188,
  upliftEnd: 308,
  breakoffStart: 232,
  breakoffEnd: 308,
};

const S_COLLISION = uTrench - (GEO.mC + GEO.margin); // India's travel at first contact
const S_END = S_COLLISION + 250;

const C = {
  asthenoTop: "#c4541f",
  asthenoBottom: "#5a150a",
  mantle: "#5b4a3a",
  mantleDark: "#3f3328",
  oceanCrust: "#34495a",
  indiaCrust: "#cf9a58",
  eurCrust: "#7a6a5a",
  sediment: "#e8d29a",
  water: "#1f6aa0",
  waterTop: "#3d8cc4",
  snow: "#f4f8ff",
};

const EASE_IO = Easing.bezier(0.45, 0, 0.55, 1);

const Step: React.FC<{ n: number; label: string; active: boolean; done: boolean }> = ({
  n,
  label,
  active,
  done,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      opacity: active ? 1 : done ? 0.75 : 0.35,
      scale: active ? "1.06" : "1",
    }}
  >
    <div
      style={{
        width: 46,
        height: 46,
        borderRadius: 23,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? COLORS.gold : "rgba(255,255,255,0.15)",
        color: active ? COLORS.ink : COLORS.white,
        fontFamily: LABEL_FONT,
        fontWeight: 800,
        fontSize: 26,
      }}
    >
      {n}
    </div>
    <div style={{ fontFamily: LABEL_FONT, fontWeight: 800, fontSize: 30, letterSpacing: 2, color: COLORS.white }}>
      {label}
    </div>
  </div>
);

/**
 * SCENE 3 (12–22 s): an animated 2.5D block diagram of the crust.
 * 1. The Tethys ocean floor subducts beneath Asia.
 * 2. India's buoyant continental crust arrives and cannot sink.
 * 3. India is shoved under Tibet; the crust doubles and the land rises,
 *    lifting seafloor sediments (with their fossils) into the sky.
 */
export const Scene3Collision: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const sA = interpolate(frame, [K.subductStart, K.collision], [0, S_COLLISION], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.3, 0, 0.7, 1),
  });
  const sB = interpolate(frame, [K.collision, K.pushEnd], [0, S_END - S_COLLISION], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.15, 0.6, 0.4, 1),
  });
  const s = sA + sB;
  const uplift = interpolate(frame, [K.upliftStart, K.upliftEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_IO,
  });
  const breakoff = interpolate(frame, [K.breakoffStart, K.breakoffEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.5, 0, 0.9, 0.6),
  });

  const path = buildPlatePath(s);
  const mFront = -s - 40; // material currently at the left edge of the block
  const mBreak = GEO.mC + GEO.margin + 70;

  // ---- Surfaces -----------------------------------------------------------
  const wedgeGrow = Math.min(1, s / S_COLLISION);
  const wedge = (x: number) =>
    (10 + 26 * wedgeGrow) * Math.exp(-Math.pow((x - (GEO.trenchX + 12)) / 55, 2));
  const indiaTopAt = (x: number) => {
    const m = x - GEO.x0 - s;
    return GEO.yc - (7 + 55 * continental(m));
  };
  const surfaceAt = (x: number) =>
    x < GEO.trenchX ? indiaTopAt(x) : eurasiaTop(x, uplift);
  const capTop = (x: number) => surfaceAt(x) - wedge(x) * (1 - 0.35 * uplift);
  const capThick = (x: number) =>
    8 + wedge(x) + uplift * 46 * smoothstep(GEO.trenchX - 40, GEO.trenchX + 10, x) * (1 - smoothstep(GEO.trenchX + 170, GEO.trenchX + 240, x));
  const capX0 = GEO.trenchX - 70;
  const capX1 = GEO.trenchX + 240;

  const step = 6;
  const xsFront: number[] = [];
  for (let x = GEO.x0; x <= GEO.xR + 0.1; x += step) xsFront.push(x);
  const topY = (x: number) => {
    const inCap = x >= capX0 && x <= capX1;
    const surf = inCap ? Math.min(capTop(x), surfaceAt(x)) : surfaceAt(x);
    return x < GEO.trenchX ? Math.min(surf, GEO.sea) : surf;
  };

  // ---- Polygons -----------------------------------------------------------
  const eurCrust = (() => {
    const pts = xsFront.filter((x) => x >= GEO.trenchX).map((x) => `${x},${eurasiaTop(x, uplift).toFixed(1)}`);
    return `M${pts.join("L")}L${GEO.xR},${GEO.eurCrustBase}L${GEO.trenchX},${GEO.eurCrustBase}Z`;
  })();

  const capPath = (() => {
    const top: string[] = [];
    const bot: string[] = [];
    for (let x = capX0; x <= capX1; x += 4) {
      const t = capTop(x);
      top.push(`${x},${t.toFixed(1)}`);
      bot.unshift(`${x},${(t + capThick(x)).toFixed(1)}`);
    }
    return `M${top.join("L")}L${bot.join("L")}Z`;
  })();

  // Folded strata inside the sediment cap: compression increases with uplift.
  const strata = [0.2, 0.42, 0.64, 0.84].map((f) => {
    const pts: string[] = [];
    for (let x = capX0; x <= capX1; x += 4) {
      const fold = Math.sin((x - GEO.trenchX) * (0.05 + 0.04 * uplift)) * (2 + 9 * uplift);
      pts.push(`${x},${(capTop(x) + capThick(x) * f + fold).toFixed(1)}`);
    }
    return `M${pts.join("L")}`;
  });

  const indiaMantle = layerPath(path, mFront, mBreak, () => -21, () => -112);
  const slabMantle = layerPath(path, mBreak - 4, GEO.slabEnd, () => -21, () => -112, 4, breakoff * 120);
  const slabCrust = layerPath(path, mBreak - 4, GEO.slabEnd, () => 0, () => -21, 4, breakoff * 120);
  const oceanCrust = layerPath(path, GEO.mC, mBreak, () => 0, () => -21);
  const sediments = layerPath(path, GEO.mC + GEO.margin * 0.6, GEO.slabEnd, () => 7, () => 0, 4, 0);
  const indiaCrust = layerPath(path, mFront, GEO.mC + GEO.margin, (m) => 62 * continental(m), () => -21);

  // ---- Top face of the block (oblique 3D) -----------------------------------
  const D = GEO.depth;
  const topQuads = xsFront.slice(0, -1).map((x, i) => {
    const x2 = xsFront[i + 1];
    const y1 = topY(x);
    const y2 = topY(x2);
    const isWater = x < GEO.trenchX && indiaTopAt(x) > GEO.sea;
    const elev = (GEO.sea - Math.min(y1, y2)) / GEO.mountainHeight;
    const slope = (y2 - y1) / step;
    let fill: string;
    if (isWater) fill = C.waterTop;
    else if (uplift > 0.55 && elev > 0.62) fill = C.snow;
    else {
      const l = Math.max(-0.25, Math.min(0.25, -slope * 0.4));
      const base = x >= capX0 + 30 && x <= capX1 - 30 && uplift > 0.1 ? [214, 196, 150] : [126, 140, 82];
      fill = `rgb(${base.map((c) => Math.round(c * (1 + l))).join(",")})`;
    }
    return (
      <path
        key={x}
        d={`M${x},${y1}L${x2},${y2}L${x2 + D.x},${y2 + D.y}L${x + D.x},${y1 + D.y}Z`}
        fill={fill}
        stroke={fill}
        strokeWidth={0.8}
      />
    );
  });

  // Right side face.
  const eTopR = eurasiaTop(GEO.xR, uplift);
  const sideBand = (y1: number, y2: number, fill: string) => (
    <path
      d={`M${GEO.xR},${y1}L${GEO.xR + D.x},${y1 + D.y}L${GEO.xR + D.x},${y2 + D.y}L${GEO.xR},${y2}Z`}
      fill={fill}
      opacity={0.78}
    />
  );

  // ---- Camera: slow push-in + impact shake ----------------------------------
  const push = interpolate(frame, [0, 316], [1, 1.1]);
  const shakeAmp = interpolate(frame, [K.collision - 2, K.collision + 4, K.collision + 40], [0, 9, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shakeX = Math.sin(frame * 2.7) * shakeAmp;
  const shakeY = Math.cos(frame * 3.3) * shakeAmp;

  const phase = frame < K.collision - 10 ? 1 : frame < K.upliftStart + 40 ? 2 : 3;

  // Fossil (brachiopod shell) rides in the sediment cap.
  const fossilX = GEO.trenchX + 55;
  const fossilY = capTop(fossilX) + capThick(fossilX) * 0.45;

  const indiaLabelX = GEO.x0 + 110 + s * 0.15;
  const gapPx = GEO.trenchX - (GEO.x0 + s + GEO.mC + GEO.margin);

  const label = (x: number, y: number, text: string, opacity: number, size = 30, color = COLORS.white) => (
    <text
      x={x}
      y={y}
      fill={color}
      opacity={opacity}
      fontFamily={LABEL_FONT}
      fontWeight={800}
      fontSize={size}
      letterSpacing={size * 0.1}
      textAnchor="middle"
      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.75)", strokeWidth: 6 }}
    >
      {text}
    </text>
  );
  const fade = (a: number, b: number, c?: number, d?: number) =>
    interpolate(frame, c === undefined ? [a, b] : [a, b, c, d!], c === undefined ? [0, 1] : [0, 1, 1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, #1b2433 0%, #06080d 75%)" }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          position: "absolute",
          scale: String(push),
          translate: `${shakeX}px ${shakeY}px`,
          transformOrigin: `${GEO.trenchX}px 950px`,
        }}
      >
        <defs>
          <linearGradient id="astheno" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.asthenoTop} />
            <stop offset="1" stopColor={C.asthenoBottom} />
          </linearGradient>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.water} stopOpacity={0.95} />
            <stop offset="1" stopColor="#0d3150" stopOpacity={0.95} />
          </linearGradient>
          <clipPath id="front">
            <rect x={GEO.x0} y={300} width={GEO.xR - GEO.x0} height={GEO.yBottom - 300} />
          </clipPath>
          <clipPath id="cap">
            <path d={capPath} />
          </clipPath>
        </defs>

        <g transform="translate(0 -80)">
        {/* Top face first (it sits behind the front face). */}
        <g>{topQuads}</g>
        {sideBand(eTopR, GEO.eurCrustBase, C.eurCrust)}
        {sideBand(GEO.eurCrustBase, GEO.eurMantleBase, C.mantleDark)}
        {sideBand(GEO.eurMantleBase, GEO.yBottom, C.asthenoBottom)}

        <g clipPath="url(#front)">
          <rect x={GEO.x0} y={GEO.eurMantleBase - 20} width={GEO.xR - GEO.x0} height={GEO.yBottom} fill="url(#astheno)" />
          {/* Mantle convection: dashed flow lines advected by the frame. */}
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M${GEO.x0 + 40 + i * 260},${1380 - i * 20} C ${GEO.x0 + 140 + i * 260},${1150} ${GEO.x0 + 260 + i * 260},${1150} ${GEO.x0 + 330 + i * 260},${1360}`}
              fill="none"
              stroke="rgba(255,190,120,0.35)"
              strokeWidth={4}
              strokeDasharray="18 22"
              strokeDashoffset={-frame * 1.6}
            />
          ))}
          <rect x={GEO.x0} y={GEO.sea} width={GEO.trenchX - GEO.x0 + 40} height={GEO.yc + 10 - GEO.sea} fill="url(#water)" />
          <rect x={GEO.trenchX} y={GEO.eurCrustBase - 2} width={GEO.xR - GEO.trenchX} height={GEO.eurMantleBase - GEO.eurCrustBase + 2} fill={C.mantleDark} />
          <path d={eurCrust} fill={C.eurCrust} />

          <g opacity={1 - breakoff * 0.75}>
            <path d={slabMantle} fill={C.mantle} />
            <path d={slabCrust} fill={C.oceanCrust} />
          </g>
          <path d={indiaMantle} fill={C.mantle} />
          <path d={oceanCrust} fill={C.oceanCrust} />
          <path d={sediments} fill={C.sediment} opacity={0.9} />
          <path d={indiaCrust} fill={C.indiaCrust} />

          {/* Sediment cap: accretionary wedge that becomes the Himalayan summit rocks. */}
          <path d={capPath} fill={C.sediment} />
          <g clipPath="url(#cap)">
            {strata.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#9c7f4a" strokeWidth={3} opacity={0.8} />
            ))}
          </g>
          <g transform={`translate(${fossilX} ${fossilY}) scale(${0.9 + 0.2 * uplift})`}>
            <path d="M-12,6 C-14,-6 -6,-13 0,-13 C6,-13 14,-6 12,6 C6,9 -6,9 -12,6Z" fill="#fff4d6" stroke="#6b5025" strokeWidth={2} />
            {[-7, -3.5, 0, 3.5, 7].map((dx) => (
              <path key={dx} d={`M0,-12 L${dx * 1.4},7`} stroke="#6b5025" strokeWidth={1.3} />
            ))}
          </g>

          {/* Front-face outline */}
          <path
            d={`M${GEO.x0},${topY(GEO.x0)}${xsFront.map((x) => `L${x},${topY(x).toFixed(1)}`).join("")}`}
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth={2}
          />
        </g>

        {/* Push arrow on India */}
        <g opacity={fade(20, 40, K.pushEnd - 20, K.pushEnd)}>
          <path
            d={`M${GEO.x0 + 20},770 L${GEO.x0 + 120 + Math.sin(frame / 4) * 6},770`}
            stroke={COLORS.gold}
            strokeWidth={12}
            strokeLinecap="round"
          />
          <path d={`M${GEO.x0 + 150 + Math.sin(frame / 4) * 6},770 l-34,-24 l0,48 z`} fill={COLORS.gold} />
        </g>

        {/* Thickness bracket (crust doubles) */}
        {(() => {
          const bx = GEO.trenchX + 300;
          const top = eurasiaTop(bx, uplift);
          const p = offsetPoint(path, GEO.mC, -21);
          const bottom = Math.max(GEO.eurCrustBase, Math.min(p.y, 1010));
          const o = fade(K.upliftStart + 50, K.upliftStart + 70);
          return (
            <g opacity={o}>
              <path d={`M${bx - 12},${top} h24 M${bx},${top} V${bottom} M${bx - 12},${bottom} h24`} stroke={COLORS.white} strokeWidth={4} />
              {label(bx - 10, bottom + 46, "CRUST ≈ 70 KM", o, 28, COLORS.gold)}
            </g>
          );
        })()}

        {label(indiaLabelX, 800, "INDIA", 1, 40, COLORS.gold)}
        {label(GEO.trenchX + 280, eurasiaTop(GEO.trenchX + 280, uplift) - 30, uplift > 0.3 ? "TIBET" : "ASIA", 1, 38)}
        {gapPx > 70 ? label(GEO.trenchX - gapPx / 2 - 10, GEO.sea + 34, "TETHYS", Math.min(1, (gapPx - 70) / 50), 26, "#bfe3ff") : null}
        {label(GEO.trenchX + 200, 1120, "OCEAN FLOOR SINKS", fade(40, 60, K.collision - 10, K.collision + 5), 30)}
        {label(GEO.trenchX + 190, 1160, "OLD SLAB BREAKS OFF", fade(K.breakoffStart + 10, K.breakoffStart + 30), 26, "#ffd0b0")}
        {label(GEO.x0 + 150, 1100, "HOT MANTLE", fade(30, 50), 26, "#ffd7b5")}
        {label(GEO.trenchX - 60, 640, "TOO BUOYANT TO SINK", fade(K.collision, K.collision + 15, K.upliftStart + 50, K.upliftStart + 65), 30, COLORS.white)}
        {label(GEO.trenchX + 80, eurasiaTop(GEO.trenchX + 80, 1) - 120, "HIMALAYAS", fade(K.upliftStart + 80, K.upliftStart + 100), 40, COLORS.white)}
        <g opacity={fade(K.upliftStart + 90, K.upliftStart + 110)}>
          <path d={`M${fossilX - 14},${fossilY - 4} L${fossilX - 150},${fossilY - 50}`} stroke={COLORS.gold} strokeWidth={3} />
          {label(fossilX - 240, fossilY - 56, "SEA FOSSILS", 1, 28, COLORS.gold)}
        </g>
        </g>
      </svg>

      {/* Impact flash */}
      <AbsoluteFill
        style={{
          backgroundColor: "#fff3df",
          opacity: interpolate(frame, [K.collision - 1, K.collision + 1, K.collision + 10], [0, 0.35, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />

      <CinematicGrade grain={0.05} />
      <ChapterTitle kicker="≈50 MILLION YEARS AGO" title="The Collision" inFrame={4} titleSize={80} top={170} />
      <div
        style={{
          position: "absolute",
          top: 385,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 28,
          opacity: fade(15, 30, K.upliftStart + 65, K.upliftStart + 80),
        }}
      >
        <Step n={1} label="SINK" active={phase === 1} done={phase > 1} />
        <Step n={2} label="COLLIDE" active={phase === 2} done={phase > 2} />
        <Step n={3} label="RISE" active={phase === 3} done={false} />
      </div>
    </AbsoluteFill>
  );
};
