import { ThreeCanvas } from "@remotion/three";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { ASSETS, hasAsset } from "../../config/assets";
import { COLORS, LABEL_FONT } from "../../config/fonts";
import { CameraRig } from "../three/CameraRig";
import { MeshyModel } from "../three/MeshyModel";

/** Procedural trilobite, used when no Meshy model is present. */
const TrilobiteSvg: React.FC = () => {
  const segs = Array.from({ length: 9 }, (_, i) => i);
  return (
    <svg viewBox="0 0 200 260" width={230} height={300}>
      <defs>
        <radialGradient id="stone" cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#efe2c4" />
          <stop offset="1" stopColor="#b59f78" />
        </radialGradient>
        <filter id="emboss">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#2b2116" floodOpacity="0.75" />
        </filter>
      </defs>
      <g filter="url(#emboss)" fill="url(#stone)" stroke="#6f5a3c" strokeWidth={2}>
        {/* Cephalon (head shield) with genal spines */}
        <path d="M18,92 Q100,-8 182,92 L196,150 L170,100 Q100,116 30,100 L4,150 Z" />
        {/* Glabella */}
        <ellipse cx={100} cy={62} rx={22} ry={30} />
        <circle cx={62} cy={74} r={7} />
        <circle cx={138} cy={74} r={7} />
        {/* Thorax segments: axial lobe + pleural lobes */}
        {segs.map((i) => {
          const y = 104 + i * 12;
          const w = 74 - i * 3.2;
          return (
            <g key={i}>
              <path d={`M${100 - w},${y} Q${100 - w - 8},${y + 8} ${100 - w + 4},${y + 12} L${100 + w - 4},${y + 12} Q${100 + w + 8},${y + 8} ${100 + w},${y} Z`} />
              <rect x={86} y={y + 1} width={28} height={10} rx={5} />
            </g>
          );
        })}
        {/* Pygidium (tail shield) */}
        <path d="M54,212 Q100,262 146,212 Z" />
      </g>
    </svg>
  );
};

/**
 * "Fossils of sea creatures near the summit" inset card.
 * Shows a rotating Meshy model if public/models/trilobite.glb exists,
 * otherwise the procedural trilobite above.
 */
export const FossilCard: React.FC<{ inFrame: number; outFrame: number }> = ({ inFrame, outFrame }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [inFrame, inFrame + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const opacity = interpolate(frame, [inFrame, inFrame + 10, outFrame, outFrame + 12], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const useModel = hasAsset(ASSETS.models.trilobite);

  return (
    <div
      style={{
        position: "absolute",
        top: 190,
        left: 140,
        right: 140,
        padding: "28px 24px 30px",
        borderRadius: 28,
        background: "linear-gradient(160deg, rgba(40,34,26,0.82), rgba(14,12,10,0.86))",
        border: "2px solid rgba(255,201,74,0.45)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity,
        scale: String(0.9 + 0.1 * t),
        translate: `0px ${(1 - t) * 40}px`,
      }}
    >
      <div style={{ height: 300, display: "flex", alignItems: "center", rotate: `${Math.sin(frame / 25) * 4}deg` }}>
        {useModel ? (
          <ThreeCanvas width={300} height={300}>
            <CameraRig shot={{ position: [0, 0.6, 3], target: [0, 0, 0], fov: 40 }} near={0.1} far={50} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[2, 3, 2]} intensity={2.2} />
            <MeshyModel path={ASSETS.models.trilobite} size={2} rotation={[0.4, frame * 0.03, 0]} />
          </ThreeCanvas>
        ) : (
          <TrilobiteSvg />
        )}
      </div>
      <div
        style={{
          marginTop: 10,
          fontFamily: LABEL_FONT,
          fontWeight: 800,
          fontSize: 34,
          letterSpacing: 3,
          color: COLORS.gold,
          textAlign: "center",
        }}
      >
        MARINE FOSSILS
      </div>
      <div
        style={{
          marginTop: 6,
          fontFamily: LABEL_FONT,
          fontWeight: 700,
          fontSize: 28,
          color: COLORS.white,
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        found in the limestone
        <br />
        at Everest's summit
      </div>
    </div>
  );
};
