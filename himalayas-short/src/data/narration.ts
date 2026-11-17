import type { Caption } from "@remotion/captions";

/**
 * Narration script, timed to the 45-second storyboard.
 * Times are absolute (from the start of the video), in milliseconds, and
 * match where each line sits in public/audio/narration.mp3.
 *
 * This file drives BOTH the on-screen captions and the music ducking.
 * After you record the voiceover, either
 *   a) nudge these startMs / endMs values to match your take, or
 *   b) run `npm run captions` (Whisper) to generate public/captions.json,
 *      which automatically overrides the word timings derived here.
 */
export type NarrationLine = {
  scene: 1 | 2 | 3 | 4 | 5;
  startMs: number;
  endMs: number;
  text: string;
};

export const NARRATION: NarrationLine[] = [
  {
    scene: 1,
    startMs: 400,
    endMs: 4180,
    text: "What if I told you that the world's highest mountains were once under an ocean?",
  },
  { scene: 2, startMs: 4900, endMs: 7100, text: "Rewind seventy million years." },
  {
    scene: 2,
    startMs: 7300,
    endMs: 12210,
    text: "India was an island, racing north across the Tethys Ocean, toward Asia.",
  },
  { scene: 3, startMs: 12450, endMs: 14210, text: "Then came the collision." },
  {
    scene: 3,
    startMs: 14410,
    endMs: 18560,
    text: "The ocean floor slid beneath Asia, until India itself crashed in.",
  },
  {
    scene: 3,
    startMs: 18760,
    endMs: 21930,
    text: "The old seabed was crumpled, and lifted toward the sky.",
  },
  {
    scene: 4,
    startMs: 22400,
    endMs: 25210,
    text: "Over millions of years, the crust doubled in thickness.",
  },
  {
    scene: 4,
    startMs: 25500,
    endMs: 30410,
    text: "Peaks rose higher and higher, until snow and ice claimed the roof of the world.",
  },
  {
    scene: 5,
    startMs: 33300,
    endMs: 37740,
    text: "Today, fossils of sea creatures lie near the summit of Mount Everest.",
  },
  {
    scene: 5,
    startMs: 38000,
    endMs: 40950,
    text: "And even today, the Himalayas continue to rise.",
  },
  { scene: 5, startMs: 41600, endMs: 43140, text: "The mountains are still growing!" },
];

/**
 * Converts the line-level script into word-level `Caption` tokens.
 * Words share each line's duration in proportion to their length (plus a
 * small pause after punctuation), which tracks natural speech closely.
 */
export const narrationToCaptions = (lines: NarrationLine[]): Caption[] => {
  const out: Caption[] = [];
  for (const line of lines) {
    const words = line.text.split(/\s+/).filter(Boolean);
    const weights = words.map((w) => w.replace(/[^\w']/g, "").length + 2 + (/[,.!?]$/.test(w) ? 3 : 0));
    const total = weights.reduce((a, b) => a + b, 0);
    let t = line.startMs;
    words.forEach((w, i) => {
      const dur = ((line.endMs - line.startMs) * weights[i]) / total;
      out.push({
        text: (i === 0 ? "" : " ") + w,
        startMs: Math.round(t),
        endMs: Math.round(t + dur),
        timestampMs: Math.round(t + dur / 2),
        confidence: 1,
        pageBreakAfter: i === words.length - 1,
      });
      t += dur;
    });
  }
  return out;
};

export const isNarrating = (ms: number, padMs = 250) =>
  NARRATION.some((l) => ms >= l.startMs - padMs && ms <= l.endMs + padMs);
