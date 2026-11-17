/**
 * Generates word-accurate captions from YOUR recorded voiceover.
 *
 *   npm run captions
 *
 * Reads  public/audio/narration.mp3
 * Writes public/captions.json  (auto-detected; overrides src/data/narration.ts timings)
 *
 * First run downloads whisper.cpp (needs `make` + a C++ compiler) and the
 * medium.en model (~1.5 GB) into ./whisper.cpp (git-ignored).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  downloadWhisperModel,
  installWhisperCpp,
  toCaptions,
  transcribe,
} from "@remotion/install-whisper-cpp";

const root = process.cwd();
const input = path.join(root, "public/audio/narration.mp3");
const whisperDir = path.join(root, "whisper.cpp");
const wav = path.join(whisperDir, "narration-16k.wav");
const MODEL = "medium.en";
const VERSION = "1.5.5";

if (!fs.existsSync(input)) {
  console.error(`Missing ${input}. Record or generate the voiceover first.`);
  process.exit(1);
}

await installWhisperCpp({ to: whisperDir, version: VERSION });
await downloadWhisperModel({ model: MODEL, folder: whisperDir });

// Whisper needs 16 kHz mono WAV. Remotion ships its own ffmpeg.
execSync(`npx remotion ffmpeg -y -i "${input}" -ar 16000 -ac 1 "${wav}"`, { stdio: "inherit" });

const whisperCppOutput = await transcribe({
  model: MODEL,
  whisperPath: whisperDir,
  whisperCppVersion: VERSION,
  inputPath: wav,
  tokenLevelTimestamps: true,
});

const { captions } = toCaptions({ whisperCppOutput });
fs.writeFileSync(path.join(root, "public/captions.json"), JSON.stringify(captions, null, 2));
console.log(`Wrote public/captions.json (${captions.length} tokens).`);
