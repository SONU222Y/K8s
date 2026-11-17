import type { Caption } from "@remotion/captions";

/**
 * Narration script, timed to the 45-second storyboard.
 * Times are absolute (from the start of the video), in milliseconds.
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
    endMs: 4600,
    text: "What if I told you that the world's highest mountains were once under an ocean?",
  },
  { scene: 2, startMs: 5300, endMs: 7300, text: "Rewind seventy million years." },
  {
    scene: 2,
    startMs: 7500,
    endMs: 11600,
    text: "India was an island, racing north across the Tethys Ocean, toward Asia.",
  },
  { scene: 3, startMs: 12300, endMs: 13900, text: "Then came the collision." },
  {
    scene: 3,
    startMs: 14100,
    endMs: 17600,
    text: "The ocean floor slid beneath Asia, until India itself crashed in.",
  },
  {
    scene: 3,
    startMs: 17800,
    endMs: 21600,
    text: "The old seabed was crumpled, and lifted toward the sky.",
  },
  {
    scene: 4,
    startMs: 22400,
    endMs: 26200,
    text: "Over millions of years, the crust doubled in thickness.",
  },
  {
    scene: 4,
    startMs: 26400,
    endMs: 32400,
    text: "Peaks rose higher and higher, until snow and ice claimed the roof of the world.",
  },
  {
    scene: 5,
    startMs: 33300,
    endMs: 37600,
    text: "Today, fossils of sea creatures lie near the summit of Mount Everest.",
  },
  {
    scene: 5,
    startMs: 37900,
    endMs: 41300,
    text: "And even today, the Himalayas continue to rise.",
  },
  { scene: 5, startMs: 41500, endMs: 44300, text: "The mountains are still growing!" },
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
