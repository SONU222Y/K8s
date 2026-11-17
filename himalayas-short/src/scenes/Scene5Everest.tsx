import { ThreeCanvas } from "@remotion/three";
import { useMemo } from "react";
import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CinematicGrade } from "../components/overlays/CinematicGrade";
import { FossilCard } from "../components/overlays/FossilCard";
import { PinLabel } from "../components/overlays/Typography";
import { CameraRig } from "../components/three/CameraRig";
import { CloudLayer, CloudPuffs } from "../components/three/Clouds";
import { MeshyModel } from "../components/three/MeshyModel";
import { Sky } from "../components/three/Sky";
import { Terrain, type Atmosphere } from "../components/three/Terrain";
import { ASSETS, hasAsset } from "../config/assets";
import { COLORS, LABEL_FONT, TITLE_FONT } from "../config/fonts";
import { localFrame } from "../config/timeline";
import { projectToScreen, type Shot } from "../lib/camera";
import { TERRAIN_EVEREST, createHeightField } from "../lib/terrain";

const ATMOSPHERE: Atmosphere = {
  sunDir: [-0.85, 0.2, 0.35],
  sunColor: "#ffc690",
  skyColor: "#8a9cc4",
  fogColor: "#d9bfae",
  zenithColor: "#26407e",
  fogDensity: 0.00011,
};

const PUFF_AREA = { x: [-3400, 3400] as [number, number], y: [180, 420] as [number, number], z: [-2600, 1600] as [number, number] };

/** Narration-synced beats (absolute seconds -> scene-local frames). */
const BEATS = {
  fossilIn: localFrame("Scene5-Everest", 33.3),
  fossilOut: localFrame("Scene5-Everest", 37.8),
  pinIn: localFrame("Scene5-Everest", 33.6),
  statsIn: localFrame("Scene5-Everest", 38.0),
  finaleIn: localFrame("Scene5-Everest", 41.5),
};

const useSummit = () =>
  useMemo(() => {
    const field = createHeightField(TERRAIN_EVEREST);
    const e = TERRAIN_EVEREST.everest!;
    let best = { x: e.x, z: e.z, y: -Infinity };
    for (let x = e.x - 500; x <= e.x + 500; x += 10) {
      for (let z = e.z - 500; z <= e.z + 500; z += 10) {
        const y = field.heightAt(x, z);
        if (y > best.y) best = { x, z, y };
      }
    }
    return best;
  }, []);

/**
 * SCENE 5 (33–45 s): golden-hour orbit around Everest, the fossil reveal,
 * and the payoff: the mountains are still growing.
 */
export const Scene5Everest: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const summit = useSummit();
  const useHeroModel = hasAsset(ASSETS.models.everest);

  const t = interpolate(frame, [0, durationInFrames], [0, 1], { easing: Easing.bezier(0.3, 0, 0.6, 1) });
  const a = interpolate(t, [0, 1], [0.95, -0.15]);
  const R = interpolate(t, [0, 1], [2700, 2050]);
  const shot: Shot = {
    position: [
      summit.x + R * Math.sin(a),
      summit.y + interpolate(t, [0, 1], [120, 380]),
      summit.z + R * Math.cos(a),
    ],
    target: [summit.x, summit.y - 260, summit.z],
    fov: 50,
  };
  const pin = projectToScreen(shot, [summit.x, summit.y + 10, summit.z], width, height);

  // Final push-in: everything gently scales up as the line lands.
  const finale = interpolate(frame, [BEATS.finaleIn, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1018" }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
        <CameraRig shot={shot} />
        <Sky atmosphere={ATMOSPHERE} />
        {useHeroModel ? (
          <>
            <ambientLight intensity={0.45} />
            <directionalLight position={[-3000, 1200, 1400]} intensity={2.4} color={ATMOSPHERE.sunColor} />
            <MeshyModel path={ASSETS.models.everest} size={3200} position={[summit.x, summit.y * 0.5, summit.z]} />
          </>
        ) : (
          <Terrain options={TERRAIN_EVEREST} atmosphere={ATMOSPHERE} snowLine={0.4} />
        )}
        <CloudLayer frame={frame} height={240} opacity={0.4} drift={[2.5, 0.8]} tint="#ffe3cc" />
        <CloudPuffs frame={frame} area={PUFF_AREA} drift={3} count={26} seed={5} opacity={0.75} tint="#ffd9bd" />
      </ThreeCanvas>

      <CinematicGrade />

      <FossilCard inFrame={BEATS.fossilIn} outFrame={BEATS.fossilOut} />

      {pin.visible ? (
        <PinLabel
          x={pin.x}
          y={pin.y}
          label="MOUNT EVEREST"
          sub="8,849 m"
          inFrame={BEATS.pinIn + 20}
          outFrame={BEATS.finaleIn - 10}
          lineLength={150}
          direction="down"
        />
      ) : null}

      {/* Still-moving stats */}
      <Interactive.Div
        name="Stats"
        style={{
          position: "absolute",
          top: 210,
          left: 90,
          right: 90,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "center",
          opacity: interpolate(frame, [BEATS.statsIn, BEATS.statsIn + 14, BEATS.finaleIn - 6, BEATS.finaleIn + 6], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {[
          ["INDIA STILL PUSHES NORTH", "≈ 4–5 cm every year"],
          ["THE HIMALAYAS RISE", "a few mm every year"],
        ].map(([k, v], i) => (
          <div
            key={k}
            style={{
              textAlign: "center",
              translate: `0px ${interpolate(frame, [BEATS.statsIn + i * 10, BEATS.statsIn + i * 10 + 18], [30, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              })}px`,
            }}
          >
            <div style={{ fontFamily: LABEL_FONT, fontWeight: 800, fontSize: 32, letterSpacing: 4, color: COLORS.gold }}>{k}</div>
            <div style={{ fontFamily: TITLE_FONT, fontWeight: 700, fontSize: 62, color: COLORS.white, textShadow: "0 6px 30px rgba(0,0,0,0.75)" }}>
              {v}
            </div>
          </div>
        ))}
      </Interactive.Div>

      {/* Finale lockup */}
      <Interactive.Div
        name="Finale"
        style={{
          position: "absolute",
          top: 230,
          left: 60,
          right: 60,
          textAlign: "center",
          opacity: interpolate(finale, [0, 0.15], [0, 1], { extrapolateRight: "clamp" }),
          scale: String(interpolate(finale, [0, 1], [0.94, 1.04])),
        }}
      >
        <svg width={120} height={120} viewBox="0 0 120 120" style={{ translate: `0px ${-finale * 30}px` }}>
          <path d="M60 12 L100 62 L74 62 L74 108 L46 108 L46 62 L20 62 Z" fill={COLORS.gold} />
        </svg>
        <div
          style={{
            fontFamily: TITLE_FONT,
            fontWeight: 700,
            fontSize: 104,
            lineHeight: 1.02,
            color: COLORS.white,
            textShadow: "0 8px 40px rgba(0,0,0,0.8)",
          }}
        >
          Still
          <br />
          Growing
        </div>
      </Interactive.Div>

      {/* Fade to black on the very last beat */}
      <AbsoluteFill
        style={{
          backgroundColor: "#000",
          opacity: interpolate(frame, [durationInFrames - 12, durationInFrames - 1], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
    </AbsoluteFill>
  );
};
