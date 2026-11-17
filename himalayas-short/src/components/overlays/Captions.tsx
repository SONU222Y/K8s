import type { Caption, TikTokPage } from "@remotion/captions";
import { createTikTokStyleCaptions } from "@remotion/captions";
import { useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { ASSETS, assetUrl, hasAsset } from "../../config/assets";
import { CAPTION_FONT, COLORS } from "../../config/fonts";
import { NARRATION, narrationToCaptions } from "../../data/narration";

/** Max time a caption page stays up (ms). Lower = fewer words per page. */
const SWITCH_CAPTIONS_EVERY_MS = 1300;

const CaptionPage: React.FC<{ page: TikTokPage }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = page.startMs + (frame / fps) * 1000;

  return (
    <AbsoluteFill
      style={{
        // Sits above the YouTube Shorts UI (title/channel bar ≈ bottom 22%).
        top: 1180,
        bottom: "auto",
        height: 360,
        justifyContent: "center",
        alignItems: "center",
        paddingLeft: 90,
        paddingRight: 130,
      }}
    >
      <div
        style={{
          fontFamily: CAPTION_FONT,
          fontWeight: 900,
          fontSize: 72,
          lineHeight: 1.12,
          textAlign: "center",
          whiteSpace: "pre-wrap",
          letterSpacing: -0.5,
          opacity: interpolate(frame, [0, 4], [0, 1], { extrapolateRight: "clamp" }),
          scale: interpolate(frame, [0, 6], [0.92, 1], {
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {page.tokens.map((t) => {
          const active = nowMs >= t.fromMs && nowMs < t.toMs;
          const spoken = nowMs >= t.fromMs;
          return (
            <span
              key={t.fromMs}
              style={{
                color: active ? COLORS.gold : COLORS.white,
                opacity: spoken ? 1 : 0.55,
                WebkitTextStroke: "10px rgba(0,0,0,0.85)",
                paintOrder: "stroke fill",
                textShadow: "0 6px 24px rgba(0,0,0,0.6)",
              }}
            >
              {t.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const useCaptions = (): Caption[] | null => {
  const fromScript = useMemo(() => narrationToCaptions(NARRATION), []);
  const useJson = hasAsset(ASSETS.captionsJson);
  const [captions, setCaptions] = useState<Caption[] | null>(useJson ? null : fromScript);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => (useJson ? delayRender("Loading captions.json") : null));

  useEffect(() => {
    if (!useJson || handle === null) return;
    fetch(assetUrl(ASSETS.captionsJson))
      .then((r) => r.json())
      .then((data: Caption[]) => {
        setCaptions(data);
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
  }, [useJson, handle, continueRender, cancelRender]);

  return captions;
};

/** Word-by-word animated English captions, synced to the narration. */
export const Captions: React.FC = () => {
  const { fps } = useVideoConfig();
  const captions = useCaptions();

  const pages = useMemo(
    () =>
      captions
        ? createTikTokStyleCaptions({
            captions,
            combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
          }).pages
        : [],
    [captions],
  );

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {pages.map((page, index) => {
        const next = pages[index + 1] ?? null;
        const startFrame = Math.round((page.startMs / 1000) * fps);
        const endFrame = Math.round(
          Math.min(
            next ? (next.startMs / 1000) * fps : Infinity,
            ((page.startMs + page.durationMs) / 1000) * fps + 8,
          ),
        );
        const durationInFrames = endFrame - startFrame;
        if (durationInFrames <= 0) return null;
        return (
          <Sequence
            key={index}
            name={`Caption ${index + 1}`}
            from={startFrame}
            durationInFrames={durationInFrames}
          >
            <CaptionPage page={page} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
