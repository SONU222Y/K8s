import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill } from "remotion";
import { AudioLayer } from "./components/AudioLayer";
import { Captions } from "./components/overlays/Captions";
import { TRANSITION_FRAMES, sceneDuration } from "./config/timeline";
import { Scene1Aerial } from "./scenes/Scene1Aerial";
import { Scene2AncientEarth } from "./scenes/Scene2AncientEarth";
import { Scene3Collision } from "./scenes/Scene3Collision";
import { Scene4Formation } from "./scenes/Scene4Formation";
import { Scene5Everest } from "./scenes/Scene5Everest";

// TransitionSeries only accepts its own elements as direct children, so the
// shared cross-fade is passed as props rather than wrapped in a component.
const crossFade = {
  presentation: fade(),
  timing: linearTiming({ durationInFrames: TRANSITION_FRAMES }),
};

/**
 * "How Were the Himalayas Born?" — 45 s, 1080×1920, 30 fps.
 * Scenes cross-fade on the storyboard boundaries (5 s, 12 s, 22 s, 33 s);
 * captions and audio run on the global timeline above them.
 */
export const HimalayasShort: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <TransitionSeries>
      <TransitionSeries.Sequence name="1 · Aerial hook" durationInFrames={sceneDuration("Scene1-Aerial")}>
        <Scene1Aerial />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition {...crossFade} />
      <TransitionSeries.Sequence name="2 · Ancient Earth" durationInFrames={sceneDuration("Scene2-AncientEarth")}>
        <Scene2AncientEarth />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition {...crossFade} />
      <TransitionSeries.Sequence name="3 · Collision" durationInFrames={sceneDuration("Scene3-Collision")}>
        <Scene3Collision />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition {...crossFade} />
      <TransitionSeries.Sequence name="4 · Mountains rise" durationInFrames={sceneDuration("Scene4-Formation")}>
        <Scene4Formation />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition {...crossFade} />
      <TransitionSeries.Sequence name="5 · Everest today" durationInFrames={sceneDuration("Scene5-Everest")}>
        <Scene5Everest />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    <Captions />
    <AudioLayer />
  </AbsoluteFill>
);
