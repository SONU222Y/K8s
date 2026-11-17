# External assets

The project renders without any optional assets. Every visual is generated in code: the procedural terrain, the paleo-globe, the cross-section, the clouds and the fossil. Fonts are already bundled in `public/fonts/`.

Drop the files below into `public/` using the exact paths shown and they are picked up automatically (`src/config/assets.ts`). You don't need to change any code. A file that's missing is simply skipped.

## 1. Narration and music: included

| Path | What | Source |
|------|------|--------|
| `public/audio/narration.mp3` | 45 s voiceover, deep male narrator (11 lines placed on the storyboard, −16 LUFS) | Generated with the vidIQ voiceover tool, voice "Brian – Deep, Resonant and Comforting" (ElevenLabs). See `NARRATION_SCRIPT.md`. |
| `public/audio/music.mp3` | 46 s cinematic orchestral bed (strings, brass, taiko, swell) | Generated with vidIQ AI music (described by vidIQ as original and royalty-free). Auto-ducked under the voice in code. |

To replace either, overwrite the file with the same name. If your new voiceover has different timing, either edit `startMs` / `endMs` in `src/data/narration.ts` or run `npm run captions` (Whisper writes `public/captions.json`, which overrides the script timings automatically).

## 2. Sound effects: NOT included (optional, recommended)

No SFX files ship with the project, so the rendered MP4 has narration and music but no whooshes, rumbles or impacts. Add any of these and re-render:

| Path | Cue (absolute time) | Search terms |
|------|---------------------|--------------|
| `public/audio/sfx/whoosh-intro.mp3` | 0.0 s | "cinematic whoosh intro", "air swoosh deep" |
| `public/audio/sfx/wind-loop.mp3` | 0–5.5 s and 33–45 s (looped) | "high altitude wind loop", "mountain wind ambience" |
| `public/audio/sfx/whoosh.mp3` | 4.65 s, 11.65 s, 21.65 s, 32.65 s (each scene cut) | "transition whoosh", "swoosh" |
| `public/audio/sfx/tectonic-rumble.mp3` | 13.5 s | "earthquake rumble", "low frequency rumble" |
| `public/audio/sfx/deep-impact.mp3` | 17.65 s (collision) and 41.5 s (finale) | "cinematic boom", "trailer hit", "sub drop" |
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
