import { getStaticFiles, staticFile } from "remotion";

/**
 * External asset manifest.
 *
 * Every path is relative to /public. Drop a file at the given path and it is
 * picked up automatically: no code change needed. Missing files are skipped,
 * so the project always previews and renders, even before you've produced
 * the voiceover, music or Meshy models.
 */
export const ASSETS = {
  narration: "audio/narration.mp3",
  music: "audio/music.mp3",
  /** Optional Whisper-generated captions that override src/data/narration.ts. */
  captionsJson: "captions.json",
  sfx: {
    whooshIntro: "audio/sfx/whoosh-intro.mp3",
    wind: "audio/sfx/wind-loop.mp3",
    whoosh: "audio/sfx/whoosh.mp3",
    rumble: "audio/sfx/tectonic-rumble.mp3",
    impact: "audio/sfx/deep-impact.mp3",
    riser: "audio/sfx/riser.mp3",
  },
  models: {
    /** Meshy: hero summit-pyramid model for Scene 5 (optional). */
    everest: "models/everest.glb",
    /** Meshy: trilobite fossil for the Scene 5 fossil inset (optional). */
    trilobite: "models/trilobite.glb",
  },
} as const;

let cache: Set<string> | null = null;

/** True if `public/<path>` exists. Works in Studio and during rendering. */
export const hasAsset = (path: string): boolean => {
  if (!cache) {
    cache = new Set(getStaticFiles().map((f) => f.name));
  }
  return cache.has(path);
};

export const assetUrl = (path: string) => staticFile(path);
