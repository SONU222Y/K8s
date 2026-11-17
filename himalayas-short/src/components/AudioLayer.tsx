import { Audio } from "@remotion/media";
import { Sequence, interpolate, useVideoConfig } from "remotion";
import { ASSETS, assetUrl, hasAsset } from "../config/assets";
import { SCENES, TOTAL_FRAMES } from "../config/timeline";
import { isNarrating } from "../data/narration";

/** Sound-effect cue sheet: absolute seconds. Add/remove cues freely. */
const SFX_CUES: { file: string; atSec: number; volume: number; name: string }[] = [
  { name: "Intro whoosh", file: ASSETS.sfx.whooshIntro, atSec: 0, volume: 0.7 },
  // A whoosh on every scene boundary (the transition midpoint).
  ...SCENES.slice(1).map((s) => ({
    name: `Whoosh → ${s.label}`,
    file: ASSETS.sfx.whoosh,
    atSec: s.startSec - 0.35,
    volume: 0.55,
  })),
  { name: "Tectonic rumble", file: ASSETS.sfx.rumble, atSec: 13.5, volume: 0.8 },
  { name: "Collision impact", file: ASSETS.sfx.impact, atSec: 16.7, volume: 0.9 },
  { name: "Uplift riser", file: ASSETS.sfx.riser, atSec: 29.5, volume: 0.6 },
  { name: "Finale impact", file: ASSETS.sfx.impact, atSec: 41.4, volume: 0.7 },
];

/**
 * Narration, music (auto-ducked under the voice) and SFX.
 * Every layer is optional: missing files are skipped, so the project renders
 * silently until you drop your audio into public/audio/.
 */
export const AudioLayer: React.FC = () => {
  const { fps } = useVideoConfig();

  const musicVolume = (f: number) => {
    const ms = (f / fps) * 1000;
    const fadeIn = interpolate(f, [0, 20], [0, 1], { extrapolateRight: "clamp" });
    const fadeOut = interpolate(f, [TOTAL_FRAMES - 45, TOTAL_FRAMES], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const duck = isNarrating(ms) ? 0.16 : 0.32;
    return duck * fadeIn * fadeOut;
  };

  return (
    <>
      {hasAsset(ASSETS.music) ? (
        <Audio name="Music" src={assetUrl(ASSETS.music)} volume={musicVolume} loop />
      ) : null}
      {hasAsset(ASSETS.sfx.wind) ? (
        <Sequence name="Wind (Scene 1)" durationInFrames={Math.round(5.5 * fps)} layout="none">
          <Audio src={assetUrl(ASSETS.sfx.wind)} volume={0.35} loop />
        </Sequence>
      ) : null}
      {hasAsset(ASSETS.sfx.wind) ? (
        <Sequence name="Wind (Scene 5)" from={Math.round(33 * fps)} layout="none">
          <Audio src={assetUrl(ASSETS.sfx.wind)} volume={0.25} loop />
        </Sequence>
      ) : null}
      {SFX_CUES.filter((c) => hasAsset(c.file)).map((c) => (
        <Sequence key={c.name} name={c.name} from={Math.max(0, Math.round(c.atSec * fps))} layout="none">
          <Audio src={assetUrl(c.file)} volume={c.volume} />
        </Sequence>
      ))}
      {hasAsset(ASSETS.narration) ? (
        <Audio name="Narration" src={assetUrl(ASSETS.narration)} volume={1} />
      ) : null}
    </>
  );
};
