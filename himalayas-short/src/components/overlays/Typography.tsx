import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { COLORS, LABEL_FONT, TITLE_FONT } from "../../config/fonts";

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

type KickerProps = {
  /** Small all-caps line above the title, e.g. "50 MILLION YEARS AGO". */
  kicker?: string;
  title: string;
  /** Local frame the block starts animating in. */
  inFrame?: number;
  /** Local frame it starts animating out (omit to stay on screen). */
  outFrame?: number;
  top?: number;
  titleSize?: number;
};

/** Documentary chapter title: kicker + engraved serif title + hairline. */
export const ChapterTitle: React.FC<KickerProps> = ({
  kicker,
  title,
  inFrame = 0,
  outFrame,
  top = 210,
  titleSize = 84,
}) => {
  const frame = useCurrentFrame();
  const out = outFrame ?? Number.MAX_SAFE_INTEGER;
  return (
    <Interactive.Div
      name="Chapter title"
      style={{
        position: "absolute",
        top,
        left: 80,
        right: 80,
        textAlign: "center",
        color: COLORS.white,
        opacity: interpolate(frame, [inFrame, inFrame + 18, out, out + 14], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: interpolate(frame, [inFrame, inFrame + 24], ["0px 30px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE_OUT,
        }),
      }}
    >
      {kicker ? (
        <div
          style={{
            fontFamily: LABEL_FONT,
            fontWeight: 700,
            fontSize: 34,
            letterSpacing: interpolate(frame, [inFrame, inFrame + 40], [2, 9], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE_OUT,
            }),
            color: COLORS.gold,
            marginBottom: 18,
            textShadow: "0 2px 12px rgba(0,0,0,0.7)",
          }}
        >
          {kicker}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: TITLE_FONT,
          fontWeight: 700,
          fontSize: titleSize,
          lineHeight: 1.08,
          textShadow: "0 6px 30px rgba(0,0,0,0.75)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          margin: "26px auto 0",
          height: 3,
          background: `linear-gradient(90deg, transparent, ${COLORS.gold}, transparent)`,
          width: interpolate(frame, [inFrame + 8, inFrame + 40], [0, 520], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_OUT,
          }),
        }}
      />
    </Interactive.Div>
  );
};

type PinProps = {
  x: number;
  y: number;
  label: string;
  sub?: string;
  inFrame: number;
  outFrame?: number;
  /** Length of the leader line from the anchor point. */
  lineLength?: number;
  /** "up" puts the text above the anchor, "down" below it. */
  direction?: "up" | "down";
};

/** A label pinned to a point in the frame with a leader line (map-callout style). */
export const PinLabel: React.FC<PinProps> = ({
  x,
  y,
  label,
  sub,
  inFrame,
  outFrame,
  lineLength = 150,
  direction = "up",
}) => {
  const down = direction === "down";
  const frame = useCurrentFrame();
  const out = outFrame ?? Number.MAX_SAFE_INTEGER;
  const grow = interpolate(frame, [inFrame, inFrame + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  const opacity = interpolate(frame, [inFrame, inFrame + 8, out, out + 12], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity }}>
      <div
        style={{
          position: "absolute",
          left: -9,
          top: -9,
          width: 18,
          height: 18,
          borderRadius: 9,
          background: COLORS.gold,
          boxShadow: `0 0 0 ${6 + 4 * Math.sin(frame / 5)}px rgba(255,201,74,0.25)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -1.5,
          ...(down ? { top: 9 } : { bottom: 9 }),
          width: 3,
          height: lineLength * grow,
          background: COLORS.gold,
        }}
      />
      <div
        style={{
          position: "absolute",
          ...(down ? { top: lineLength + 18 } : { bottom: lineLength + 18 }),
          left: 0,
          translate: "-50% 0px",
          whiteSpace: "nowrap",
          textAlign: "center",
          opacity: grow,
        }}
      >
        <div
          style={{
            fontFamily: LABEL_FONT,
            fontWeight: 800,
            fontSize: 46,
            letterSpacing: 4,
            color: COLORS.white,
            textShadow: "0 3px 18px rgba(0,0,0,0.85)",
          }}
        >
          {label}
        </div>
        {sub ? (
          <div
            style={{
              fontFamily: LABEL_FONT,
              fontWeight: 700,
              fontSize: 40,
              color: COLORS.gold,
              textShadow: "0 3px 18px rgba(0,0,0,0.85)",
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
};

/** Plain floating label (no pin). */
export const FloatLabel: React.FC<{
  x: number;
  y: number;
  text: string;
  inFrame: number;
  outFrame?: number;
  size?: number;
  color?: string;
  italic?: boolean;
}> = ({ x, y, text, inFrame, outFrame, size = 40, color = COLORS.white, italic }) => {
  const frame = useCurrentFrame();
  const out = outFrame ?? Number.MAX_SAFE_INTEGER;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        translate: "-50% -50%",
        whiteSpace: "nowrap",
        fontFamily: LABEL_FONT,
        fontWeight: 800,
        fontStyle: italic ? "italic" : "normal",
        fontSize: size,
        letterSpacing: size * 0.12,
        color,
        textShadow: "0 3px 16px rgba(0,0,0,0.9)",
        opacity: interpolate(frame, [inFrame, inFrame + 12, out, out + 12], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      {text}
    </div>
  );
};
