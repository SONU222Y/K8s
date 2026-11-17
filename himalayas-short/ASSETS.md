# External assets

The project renders a **complete, silent video with no external assets**. Every visual is generated in code: the procedural terrain, the paleo-globe, the cross-section, the clouds and the fossil. Fonts are already bundled in `public/fonts/`.

Drop the files below into `public/` using the exact paths shown and they are picked up automatically (`src/config/assets.ts`). You don't need to change any code. A file that's missing is simply skipped.

## 1. Required for a publishable Short

| Path | What | Spec | Where to get it |
|------|------|------|-----------------|
| `public/audio/narration.mp3` | Voiceover, one continuous take, starting at 0 s | 44.1/48 kHz, mono or stereo, ≤ 45 s, peak −1 dBFS, around −16 LUFS | Voice actor or TTS (ElevenLabs, vidIQ voiceover, etc.) reading `NARRATION_SCRIPT.md`. Use a "deep male documentary" voice. |
| `public/audio/music.mp3` | Cinematic orchestral bed | ≥ 45 s (it loops if shorter), no vocals | A royalty-free library such as YouTube Audio Library, Artlist, Epidemic or Pixabay Music. Search "epic cinematic documentary", "orchestral build", around 80–100 BPM. The volume is auto-ducked under the narration. |

After recording the VO, sync the captions in one of two ways:
- **Quick:** nudge `startMs` / `endMs` in `src/data/narration.ts` to match your take.
- **Exact:** run `npm run captions`. Whisper writes `public/captions.json` with word-level timings, which then overrides the script timings automatically.

## 2. Sound effects (optional, recommended)

| Path | Cue (absolute time) | Search terms |
|------|---------------------|--------------|
| `public/audio/sfx/whoosh-intro.mp3` | 0.0 s | "cinematic whoosh intro", "air swoosh deep" |
| `public/audio/sfx/wind-loop.mp3` | 0–5.5 s and 33–45 s (looped) | "high altitude wind loop", "mountain wind ambience" |
| `public/audio/sfx/whoosh.mp3` | 4.65 s, 11.65 s, 21.65 s, 32.65 s (each scene cut) | "transition whoosh", "swoosh" |
| `public/audio/sfx/tectonic-rumble.mp3` | 13.5 s | "earthquake rumble", "low frequency rumble" |
| `public/audio/sfx/deep-impact.mp3` | 16.7 s (collision) and 41.4 s (finale) | "cinematic boom", "trailer hit", "sub drop" |
| `public/audio/sfx/riser.mp3` | 29.5 s | "cinematic riser 3 seconds" |

Cue times live in `SFX_CUES` in `src/components/AudioLayer.tsx`.

## 3. Meshy-generated 3D assets (optional upgrades)

**Being straight about Meshy:** it generates *object-scale* meshes. That suits hero props and dioramas. It is the wrong tool for kilometres of mountain range that a camera flies through: you would get a tabletop model with visible edges. So the flythrough terrain stays procedural on purpose, and Meshy is used only where an object-scale model actually helps.

### 3a. Trilobite fossil (Scene 5 fossil card): best value

- **Path:** `public/models/trilobite.glb`
- **Meshy mode:** Text to 3D (or Image to 3D from a museum photo you have the rights to)
- **Prompt:** `A fossilized trilobite embedded in a flat slab of pale grey limestone, highly detailed segmented exoskeleton, cephalon with compound eyes, natural stone texture, museum specimen, photorealistic PBR`
- **Negative prompt:** `cartoon, toy, plastic, bright colors, text`
- **Settings:** Art style *Realistic*, PBR textures on, target polycount about 30k, symmetry *auto*
- **Export:** GLB
- **What happens:** the fossil card swaps the procedural SVG trilobite for your model, slowly rotating, auto-centred and auto-scaled.

### 3b. Everest hero model (Scene 5): use with care

- **Path:** `public/models/everest.glb`
- **Prompt:** `Mount Everest summit pyramid, sharp triangular peak with three faces, snow-covered ridges, dark rock buttresses, yellow limestone band near the summit, realistic terrain diorama, PBR, no base, no text`
- **Settings:** *Realistic*, PBR on, high polycount (100k+), GLB export
- **What happens:** Scene 5 renders your model instead of the procedural terrain, lit by the same golden-hour sun, and the Everest pin and orbit stay the same.
- **Caveat:** check it in Studio first (`npm run dev`, then *Scenes › Scene5-Everest*). If the summit label doesn't sit on the peak, adjust `position` / `size` on `<MeshyModel>` in `src/scenes/Scene5Everest.tsx`.

### How to import any Meshy model

1. In Meshy, choose **Download → GLB** (it embeds textures. Don't use FBX/OBJ).
2. Save it to the path above, inside `public/models/`.
3. Restart `npm run dev` so Studio re-indexes `public/`.
4. `<MeshyModel>` (`src/components/three/MeshyModel.tsx`) loads it with three.js' `GLTFLoader`. It holds the render until the file is parsed, then centres it and normalises its size. Scale, units and pivot from Meshy don't matter.

To use a model somewhere else: `<MeshyModel path="models/your.glb" size={2} position={[0,0,0]} />` inside any `<ThreeCanvas>`, with at least one light.

## 4. Already included

| Path | Licence |
|------|---------|
| `public/fonts/Cinzel-700.woff2` | SIL Open Font License |
| `public/fonts/Inter-700.woff2`, `Inter-800.woff2` | SIL Open Font License |
| `public/fonts/Montserrat-900.woff2` | SIL Open Font License |
