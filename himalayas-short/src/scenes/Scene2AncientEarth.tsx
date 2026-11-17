import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CinematicGrade } from "../components/overlays/CinematicGrade";
import { FloatLabel } from "../components/overlays/Typography";
import { CameraRig } from "../components/three/CameraRig";
import { PaleoGlobe, globeRotationFacing, lonLatToVector } from "../components/three/PaleoGlobe";
import { COLORS, LABEL_FONT, TITLE_FONT } from "../config/fonts";
import { indiaCentroidAt, type LonLat } from "../data/paleoGeography";
import { projectToScreen, type Shot } from "../lib/camera";

const EASE = Easing.bezier(0.45, 0, 0.25, 1);

/**
 * SCENE 2 (5–12 s): the ancient Earth. India breaks north across the
 * Neo-Tethys Ocean toward the Eurasian plate while the clock rewinds
 * from 70 to 50 million years ago.
 */
export const Scene2AncientEarth: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  const progress = interpolate(frame, [12, durationInFrames - 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const zoom = interpolate(frame, [0, durationInFrames], [0, 1], { easing: EASE });

  // Where the globe faces: drift from the Indian Ocean to the collision zone.
  const focus: LonLat = [
    interpolate(zoom, [0, 1], [62, 80]),
    interpolate(zoom, [0, 1], [-4, 20]),
  ];
  const rotation = globeRotationFacing(focus);
  const shot: Shot = {
    position: [0, 0, interpolate(zoom, [0, 1], [8.2, 4.7])],
    target: [0, 0, 0],
    fov: 30,
  };

  const euler = new THREE.Euler(...rotation);
  const toScreen = (p: LonLat) => {
    const v = lonLatToVector(p, 1.02).applyEuler(euler);
    const s = projectToScreen(shot, [v.x, v.y, v.z], width, height);
    return { ...s, visible: s.visible && v.z > 0.25 };
  };

  const india = toScreen(indiaCentroidAt(progress));
  const eurasia = toScreen([100, 38]);
  const tethysLat = (indiaCentroidAt(progress)[1] + 13 + 29) / 2;
  const tethys = toScreen([66, tethysLat]);
  const mya = Math.round(interpolate(progress, [0, 1], [70, 50]));

  return (
    <AbsoluteFill style={{ backgroundColor: "#01030a" }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
        <CameraRig shot={shot} near={0.1} far={200} />
        <PaleoGlobe progress={progress} frame={frame} rotation={rotation} />
      </ThreeCanvas>

      <CinematicGrade grain={0.05} />

      {/* Rewinding geological clock. */}
      <Interactive.Div
        name="Geological clock"
        style={{
          position: "absolute",
          top: 200,
          left: 0,
          right: 0,
          textAlign: "center",
          color: COLORS.white,
          opacity: interpolate(frame, [4, 20], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <div
          style={{
            fontFamily: TITLE_FONT,
            fontWeight: 700,
            fontSize: 150,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 8px 40px rgba(0,0,0,0.8)",
          }}
        >
          {mya}
        </div>
        <div
          style={{
            fontFamily: LABEL_FONT,
            fontWeight: 800,
            fontSize: 38,
            letterSpacing: 8,
            color: COLORS.gold,
            marginTop: 8,
          }}
        >
          MILLION YEARS AGO
        </div>
      </Interactive.Div>

      {eurasia.visible ? (
        <FloatLabel x={eurasia.x} y={eurasia.y} text="EURASIAN PLATE" inFrame={25} size={42} />
      ) : null}
      {tethys.visible ? (
        <FloatLabel
          x={tethys.x}
          y={tethys.y}
          text="TETHYS OCEAN"
          inFrame={45}
          outFrame={durationInFrames - 50}
          size={34}
          color={COLORS.ice}
          italic
        />
      ) : null}
      {india.visible ? (
        <>
          <FloatLabel x={india.x} y={india.y} text="INDIA" inFrame={15} size={50} color={COLORS.gold} />
          <FloatLabel
            x={india.x}
            y={india.y + 58}
            text="≈15 CM / YEAR"
            inFrame={70}
            outFrame={durationInFrames - 30}
            size={30}
          />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
