import { ThreeCanvas } from "@remotion/three";
import { useMemo } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CameraRig } from "../components/three/CameraRig";
import { CloudPuffs } from "../components/three/Clouds";
import { Sky } from "../components/three/Sky";
import { Terrain, type Atmosphere } from "../components/three/Terrain";
import { CinematicGrade } from "../components/overlays/CinematicGrade";
import { ChapterTitle } from "../components/overlays/Typography";
import type { Shot } from "../lib/camera";
import { TERRAIN_FLYTHROUGH, createHeightField, valleyCenterX } from "../lib/terrain";

const ATMOSPHERE: Atmosphere = {
  sunDir: [0.75, 0.38, -0.45],
  sunColor: "#fff0d8",
  skyColor: "#86a3c6",
  fogColor: "#aebfd2",
  zenithColor: "#24508f",
  fogDensity: 0.00016,
};

const PUFF_AREA = { x: [-2600, 2600] as [number, number], y: [520, 900] as [number, number], z: [-2600, 1800] as [number, number] };

/**
 * SCENE 1 (0–5 s): aerial flight between snow-covered peaks.
 * The camera follows a valley carved into the heightfield and banks into
 * every turn like a real helicopter / FPV drone shot.
 */
export const Scene1Aerial: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const field = useMemo(() => createHeightField(TERRAIN_FLYTHROUGH), []);
  const valley = TERRAIN_FLYTHROUGH.valley!;

  const t = interpolate(frame, [0, durationInFrames], [0, 1], {
    easing: Easing.bezier(0.33, 0, 0.67, 1),
  });
  const z = interpolate(t, [0, 1], [2300, 700]);
  const lookAhead = 700;
  const x = valleyCenterX(z, valley);
  const ground = field.heightAt(x, z);
  const camY = Math.max(ground + 130, 250 + 30 * Math.sin(frame / 22));
  const tx = valleyCenterX(z - lookAhead, valley);
  const slope = (valleyCenterX(z - 60, valley) - x) / 60;

  const shot: Shot = {
    position: [x, camY, z],
    target: [tx, camY - 45, z - lookAhead],
    fov: 58,
    roll: Math.max(-0.22, Math.min(0.22, slope * 0.55)),
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1018" }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
        <CameraRig shot={shot} />
        <Sky atmosphere={ATMOSPHERE} />
        <Terrain options={TERRAIN_FLYTHROUGH} atmosphere={ATMOSPHERE} snowLine={0.5} />
        <CloudPuffs frame={frame} area={PUFF_AREA} drift={1.5} count={22} opacity={0.75} tint="#f4f7fc" />
      </ThreeCanvas>

      {/* Exposure ramp: fade up from black like a cold open. */}
      <AbsoluteFill
        style={{
          backgroundColor: "#000",
          opacity: interpolate(frame, [0, 20], [1, 0], { extrapolateRight: "clamp" }),
        }}
      />
      <CinematicGrade />
      <ChapterTitle kicker="THE ROOF OF THE WORLD" title="How Were the Himalayas Born?" inFrame={12} />
    </AbsoluteFill>
  );
};
