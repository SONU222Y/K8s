# How Were the Himalayas Born? (YouTube Short)

A 45-second, 1080×1920, 30 fps vertical documentary built with **Remotion 4 + React + TypeScript + React Three Fiber**.

| Time | Scene | Technique |
|------|-------|-----------|
| 0–5 s | **1 · Aerial hook**: flight through snowy peaks | Procedural ridged-multifractal terrain (custom GLSL: snow line, aerial perspective, AO), sky dome, cloud billboards, banking camera |
| 5–12 s | **2 · Ancient Earth**: India races north, 70 → 50 Ma | 3D globe, paleogeography redrawn to a canvas texture every frame, atmosphere shader, cloud shell, starfield |
| 12–22 s | **3 · Collision**: subduction → collision → uplift | Kinematic 2.5D block diagram: oceanic slab dives, continental crust underthrusts, crust doubles, slab breaks off, sea-floor sediments (with fossils) rise to the summit |
| 22–33 s | **4 · Formation**: time-lapse of the range rising | Same terrain shader with animated uplift and snow line, racing sun, fast clouds, elevation gauge |
| 33–45 s | **5 · Everest**: golden-hour orbit and "still growing" | Summit auto-located from the heightfield, 3D-projected pin label, fossil card (Meshy-ready), stats, finale |

Captions are animated word by word and synced to the narration. Music is auto-ducked under the voice. SFX hooks are wired in.

## Project structure

```
himalayas-short/
├── README.md                    ← you are here
├── NARRATION_SCRIPT.md          ← timestamped VO script, delivery notes, fact-check
├── ASSETS.md                    ← audio + Meshy assets to add (with exact prompts)
├── package.json                 ← npm scripts (dev / render / captions …)
├── remotion.config.ts           ← GL renderer, timeouts
├── scripts/
│   └── transcribe.mjs           ← Whisper → public/captions.json (exact word timings)
├── public/
│   ├── fonts/                   ← Cinzel, Inter, Montserrat (OFL, self-hosted)
│   ├── audio/                   ← narration.mp3, music.mp3   (you add)
│   │   └── sfx/                 ← whoosh, wind, rumble, impact, riser (you add)
│   └── models/                  ← trilobite.glb, everest.glb (optional, Meshy)
└── src/
    ├── index.ts                 ← registerRoot
    ├── Root.tsx                 ← HimalayasShort + each scene as its own composition
    ├── HimalayasShort.tsx       ← master timeline: TransitionSeries + captions + audio
    ├── config/
    │   ├── timeline.ts          ← ★ storyboard timing (edit scene boundaries here)
    │   ├── assets.ts            ← asset manifest + auto-detection of files in public/
    │   └── fonts.ts             ← font loading, colour palette
    ├── data/
    │   ├── narration.ts         ← ★ script lines + timings → captions + ducking
    │   └── paleoGeography.ts    ← 70–50 Ma continent outlines, India drift model
    ├── lib/
    │   ├── noise.ts             ← seeded simplex / fbm / ridged noise (deterministic)
    │   ├── terrain.ts           ← heightfield + terrain presets
    │   ├── tectonics.ts         ← plate-kinematics model for the cross-section
    │   ├── textures.ts          ← procedural cloud textures
    │   └── camera.ts            ← Shot type, 3D→screen projection for labels
    ├── components/
    │   ├── AudioLayer.tsx       ← narration, ducked music, SFX cue sheet
    │   ├── three/               ← Terrain, Sky, Clouds, PaleoGlobe, CameraRig, MeshyModel
    │   └── overlays/            ← Captions, ChapterTitle/PinLabel, FossilCard, CinematicGrade
    └── scenes/
        ├── Scene1Aerial.tsx
        ├── Scene2AncientEarth.tsx
        ├── Scene3Collision.tsx
        ├── Scene4Formation.tsx
        └── Scene5Everest.tsx
```

## Install

Requires **Node.js 20.19+ or 22.13+** (`node -v`).

```bash
cd himalayas-short
```

```bash
npm install
```

## Preview

```bash
npm run dev
```

This opens Remotion Studio (default http://localhost:3000). Pick **HimalayasShort** for the full video, or open the **Scenes** folder to work on one scene at a time with its own timeline.

## Render the final MP4

```bash
npm run render
```

The output is `out/himalayas-short.mp4` (1080×1920, H.264, CRF 18). This uses software WebGL ("swangle"), which works on any machine, including WSL and servers with no GPU. On a 4-core CPU it takes roughly 30–60 minutes.

If your machine has a working GPU for headless Chrome, this is much faster:

```bash
npm run render:gpu
```

> If `render:gpu` fails with `Error creating WebGL context`, your GPU isn't reachable from headless Chrome (common on WSL). Use `npm run render` instead.

A fast half-resolution draft for review:

```bash
npm run render:draft
```

A thumbnail still:

```bash
npm run thumbnail
```

### Play it

On Linux desktop:

```bash
mpv out/himalayas-short.mp4
```

On WSL (opens the folder in Windows Explorer; double-click the MP4):

```bash
explorer.exe out
```

## Add the voice, music and captions

1. Record or generate the voiceover from `NARRATION_SCRIPT.md` and save it as `public/audio/narration.mp3`.
2. Add a music bed at `public/audio/music.mp3` (and optional SFX; see `ASSETS.md`).
3. Sync the captions to your actual take:

```bash
npm run captions
```

Restart `npm run dev` after adding files to `public/` so Studio sees them.

## Editing cheatsheet

- **Retime scenes:** `src/config/timeline.ts`, in `SCENES[].startSec/endSec`. All durations and transitions follow.
- **Change words or caption timing:** `src/data/narration.ts`.
- **Change the geology choreography:** the `K` keyframes at the top of `src/scenes/Scene3Collision.tsx`.
- **Different mountains:** the `seed`, `maxHeight` and `everest` fields in `src/lib/terrain.ts`.
- **Lighting and mood:** each scene's `ATMOSPHERE` object (sun direction and colours, fog).
- **Caption look:** `src/components/overlays/Captions.tsx` (font size, highlight colour, position).

## Known limitations (and what was done instead)

| Requested | Reality | What this project does |
|-----------|---------|------------------------|
| "Ultra-realistic" 3D | Remotion renders WebGL in a browser. You get real-time-game quality, not offline path-traced film CGI (Houdini, Unreal, etc.). | A custom terrain shader with aerial perspective, snow-on-slope logic, AO and a sun-glow sky gets as close as a browser can. For true photoreal, swap Scenes 1 and 5 for licensed drone footage via `<Video>` from `@remotion/media`. |
| Narrator voice and music | Code can't produce a human voice or licensed music. | Timestamped script + automatic integration + ducking + Whisper caption sync. |
| Meshy assets everywhere | Meshy makes object-scale models, not flyable landscapes. | The terrain is procedural. Meshy is used for the fossil and an optional Everest hero model (`ASSETS.md`). |
| Scientifically accurate cross-section | Any diagram must exaggerate vertical scale. | The process order and mechanics are right (subduction → collision → underthrusting → crustal thickening → slab break-off). The scale is schematic. |
