# Narration script: "How Were the Himalayas Born?"

**Read time:** 45 s · **Words:** 105 · **Pace:** about 2.5 words/sec while speaking (slow, documentary)
**Voice:** deep, warm male narrator. Low register, unhurried, close-mic'd. Keep the energy up on the hook and the final line.

Timings are absolute and match the included `public/audio/narration.mp3` exactly. They live in `src/data/narration.ts`, which drives the captions and the music ducking.

**Included voiceover:** generated with the vidIQ voiceover tool (ElevenLabs voice "Brian – Deep, Resonant and Comforting"). Each line was generated separately, sped up 7% to fit the storyboard, placed at the timestamps below, and loudness-normalised to −16 LUFS. If you re-record it yourself, keep the line starts close to these times or run `npm run captions`.

| # | Start | End | Scene | Line | Delivery note |
|---|-------|-----|-------|------|---------------|
| 1 | 00:00.4 | 00:04.2 | 1 · Aerial | **What if I told you that the world's highest mountains were once under an ocean?** | Intimate and curious. Lean on "*highest*" and "*ocean*". |
| 2 | 00:04.9 | 00:07.1 | 2 · Ancient Earth | **Rewind seventy million years.** | Slow, almost whispered. |
| 3 | 00:07.3 | 00:12.2 | 2 · Ancient Earth | **India was an island, racing north across the Tethys Ocean, toward Asia.** | Build momentum on "*racing north*". Pronounce Tethys "TEE-this". |
| 4 | 00:12.5 | 00:14.2 | 3 · Collision | **Then came the collision.** | Short and heavy. The collision visual and impact SFX land at about 17.7 s, on "crashed in". |
| 5 | 00:14.4 | 00:18.6 | 3 · Collision | **The ocean floor slid beneath Asia, until India itself crashed in.** | Hit "*crashed*". |
| 6 | 00:18.8 | 00:21.9 | 3 · Collision | **The old seabed was crumpled, and lifted toward the sky.** | Rising inflection on "*sky*". |
| 7 | 00:22.4 | 00:25.2 | 4 · Formation | **Over millions of years, the crust doubled in thickness.** | Measured, factual. |
| 8 | 00:25.5 | 00:30.4 | 4 · Formation | **Peaks rose higher and higher, until snow and ice claimed the roof of the world.** | Crescendo. Let "*roof of the world*" breathe. |
| 9 | 00:33.3 | 00:37.7 | 5 · Everest | **Today, fossils of sea creatures lie near the summit of Mount Everest.** | Wonder. Short pause after "*Today*". |
| 10 | 00:38.0 | 00:41.0 | 5 · Everest | **And even today, the Himalayas continue to rise.** | Quieter and confiding. |
| 11 | 00:41.6 | 00:43.1 | 5 · Everest | **The mountains are still growing!** | Payoff. Strongest line in the video. |

## Plain script (for TTS or a voice actor)

```
What if I told you that the world's highest mountains were once under an ocean?

Rewind seventy million years.
India was an island, racing north across the Tethys Ocean, toward Asia.

Then came the collision.
The ocean floor slid beneath Asia, until India itself crashed in.
The old seabed was crumpled, and lifted toward the sky.

Over millions of years, the crust doubled in thickness.
Peaks rose higher and higher, until snow and ice claimed the roof of the world.

Today, fossils of sea creatures lie near the summit of Mount Everest.
And even today, the Himalayas continue to rise.
The mountains are still growing!
```

## Fact-check notes (what the visuals and script claim)

- **"Once under an ocean"**: the hook is a simplification. The *mountains* were never underwater. The *rock at the summit* was: Everest's top is marine limestone (the Qomolangma Formation) laid down on an ancient seafloor. Line 9 states the precise version.
- **India drifted ~70 → 50 Ma.** Collision onset is usually placed at about 50–55 million years ago. India's peak speed is often quoted at about 15 cm/yr or more, which makes it one of the fastest plate motions known.
- **"The ocean floor slid beneath Asia"**: the oceanic part of the Indian plate subducted first. India's continental crust is too buoyant to sink, so it was underthrust beneath Tibet. The old oceanic slab later broke off. All three steps are shown in Scene 3.
- **"Crust doubled in thickness"**: crust under Tibet is about 70 km thick, against about 35 km for typical continental crust.
- **Still rising**: India still converges with Asia at about 4–5 cm/yr, and the Himalayas gain a few millimetres a year. Erosion offsets part of that gain. Everest's official height is 8,848.86 m (2020 China–Nepal survey), shown as 8,849 m.
- **Scene 4 elevation gauge**: this is illustrative. It maps the time-lapse progress linearly onto 0 → 8,849 m. The real uplift history was uneven.
