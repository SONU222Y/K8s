/**
 * Single source of truth for timing.
 *
 * Edit `SCENES[].startSec / endSec` to retime the storyboard. Every scene
 * duration, transition overlap and the total length are derived from it.
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** Length of the cross-fade between two scenes (frames). Keep it even. */
export const TRANSITION_FRAMES = 16;

export type SceneId =
  | "Scene1-Aerial"
  | "Scene2-AncientEarth"
  | "Scene3-Collision"
  | "Scene4-Formation"
  | "Scene5-Everest";

type SceneDef = {
  id: SceneId;
  label: string;
  startSec: number;
  endSec: number;
};

export const SCENES: SceneDef[] = [
  { id: "Scene1-Aerial", label: "Aerial hook", startSec: 0, endSec: 5 },
  { id: "Scene2-AncientEarth", label: "Ancient Earth", startSec: 5, endSec: 12 },
  { id: "Scene3-Collision", label: "Plate collision", startSec: 12, endSec: 22 },
  { id: "Scene4-Formation", label: "Mountains rise", startSec: 22, endSec: 33 },
  { id: "Scene5-Everest", label: "Everest today", startSec: 33, endSec: 45 },
];

export const TOTAL_SECONDS = SCENES[SCENES.length - 1].endSec;
export const TOTAL_FRAMES = Math.round(TOTAL_SECONDS * FPS);

const HALF = TRANSITION_FRAMES / 2;

/**
 * Each scene is padded by half a transition on every side that has a
 * neighbour, so the *middle* of each cross-fade lands exactly on the
 * storyboard boundary (5s, 12s, 22s, 33s).
 */
export const sceneDuration = (id: SceneId): number => {
  const i = SCENES.findIndex((s) => s.id === id);
  const s = SCENES[i];
  const padStart = i > 0 ? HALF : 0;
  const padEnd = i < SCENES.length - 1 ? HALF : 0;
  return Math.round((s.endSec - s.startSec) * FPS + padStart + padEnd);
};

/** Absolute frame (in the full video) at which a scene's local frame 0 sits. */
export const sceneStartFrame = (id: SceneId): number => {
  const i = SCENES.findIndex((s) => s.id === id);
  return Math.round(SCENES[i].startSec * FPS - (i > 0 ? HALF : 0));
};

/** Convert an absolute time in the video (seconds) into a scene-local frame. */
export const localFrame = (id: SceneId, absoluteSec: number): number =>
  Math.round(absoluteSec * FPS) - sceneStartFrame(id);
