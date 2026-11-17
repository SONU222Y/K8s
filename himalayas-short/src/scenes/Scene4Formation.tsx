import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Easing, Interactive, interpolate, interpolateColors, useCurrentFrame, useVideoConfig } from "remotion";
import { CinematicGrade } from "../components/overlays/CinematicGrade";
import { ChapterTitle } from "../components/overlays/Typography";
import { CameraRig } from "../components/three/CameraRig";
import { CloudLayer, CloudPuffs } from "../components/three/Clouds";
import { Sky } from "../components/three/Sky";
import { Terrain, type Atmosphere } from "../components/three/Terrain";
import { COLORS, LABEL_FONT } from "../config/fonts";
import type { Shot } from "../lib/camera";
import { TERRAIN_EVEREST } from "../lib/terrain";

const PUFF_AREA = { x: [-3200, 3200] as [number, number], y: [520, 980] as [number, number], z: [-2400, 900] as [number, number] };
const EASE_IO = Easing.bezier(0.45, 0, 0.55, 1);

/**
 * SCENE 4 (22–33 s): time-lapse of the range being built. The heightfield's
 * vertical scale grows from a low plain to full height, the sun races across
 * the sky, clouds stream past the rising peaks and the snow line creeps down.
 */
export const Scene4Formation: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  const uplift = interpolate(frame, [8, durationInFrames - 40], [0.04, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_IO,
  });
  const snowLine = interpolate(frame, [110, durationInFrames - 10], [1.5, 0.42], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.2, 0, 0.4, 1),
  });

  // Time-lapse sun: one sweep from dawn (east) through noon to dusk (west).
  const az = interpolate(frame, [0, durationInFrames], [0.15, Math.PI - 0.15]);
  const el = 0.1 + 0.55 * Math.sin(az);
  const warm = 1 - Math.sin(az);
  const atmosphere: Atmosphere = {
    sunDir: [Math.cos(az), el, 0.55],
    sunColor: interpolateColors(warm, [0, 1], ["#fff4e2", "#ffb072"]),
    skyColor: interpolateColors(warm, [0, 1], ["#8fb0d6", "#8a86a8"]),
    fogColor: interpolateColors(warm, [0, 1], ["#b9c9da", "#d8b8a6"]),
    zenithColor: interpolateColors(warm, [0, 1], ["#1f4f92", "#2b3970"]),
    fogDensity: 0.00013,
  };

  const a = interpolate(frame, [0, durationInFrames], [-0.45, 0.12]);
  const R = interpolate(frame, [0, durationInFrames], [3600, 3000]);
  const shot: Shot = {
    position: [R * Math.sin(a), interpolate(uplift, [0, 1], [700, 1250]), -300 + R * Math.cos(a)],
    target: [0, 120 + 380 * uplift, -500],
    fov: 52,
  };

  const elevation = Math.round(uplift * 8849);
  const mya = Math.max(1, Math.round(interpolate(frame, [0, durationInFrames - 20], [50, 1], { extrapolateRight: "clamp" })));

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1018" }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
        <CameraRig shot={shot} />
        <Sky atmosphere={atmosphere} />
        <Terrain options={TERRAIN_EVEREST} atmosphere={atmosphere} uplift={uplift} snowLine={snowLine} />
        <CloudLayer frame={frame} height={60 + 260 * uplift} opacity={0.32} drift={[9, 3]} tint="#f2f5fa" />
        <CloudPuffs
          frame={frame}
          area={PUFF_AREA}
          drift={16}
          count={30}
          seed={11}
          opacity={0.8}
          tint={atmosphere.sunColor}
        />
      </ThreeCanvas>

      <CinematicGrade />
      <ChapterTitle kicker="TIME-LAPSE · 50 MILLION YEARS" title="The Rise" inFrame={6} top={190} />

      {/* Geological clock */}
      <div
        style={{
          position: "absolute",
          top: 430,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: LABEL_FONT,
          fontWeight: 800,
          fontSize: 36,
          letterSpacing: 4,
          color: COLORS.white,
          textShadow: "0 3px 16px rgba(0,0,0,0.8)",
          opacity: interpolate(frame, [20, 36], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <span style={{ color: "#ff4d4d" }}>● </span>
        {mya} MILLION YEARS AGO
      </div>

      {/* Elevation gauge (kept clear of the Shorts UI on the lower right). */}
      <Interactive.Div
        name="Elevation gauge"
        style={{
          position: "absolute",
          right: 70,
          top: 560,
          width: 150,
          height: 520,
          opacity: interpolate(frame, [30, 50], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 10,
            borderRadius: 5,
            background: "rgba(255,255,255,0.22)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 10,
            borderRadius: 5,
            height: `${uplift * 100}%`,
            background: `linear-gradient(0deg, ${COLORS.gold}, #ffffff)`,
            boxShadow: "0 0 18px rgba(255,201,74,0.7)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 26,
            bottom: `calc(${uplift * 100}% - 26px)`,
            textAlign: "right",
            fontFamily: LABEL_FONT,
            fontWeight: 800,
            color: COLORS.white,
            textShadow: "0 3px 14px rgba(0,0,0,0.9)",
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <div style={{ fontSize: 44 }}>{elevation.toLocaleString("en-US")} m</div>
          <div style={{ fontSize: 22, letterSpacing: 3, color: COLORS.gold }}>ELEVATION</div>
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
