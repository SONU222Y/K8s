import "./config/fonts";
import { Composition, Folder } from "remotion";
import { HimalayasShort } from "./HimalayasShort";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH, sceneDuration } from "./config/timeline";
import { Scene1Aerial } from "./scenes/Scene1Aerial";
import { Scene2AncientEarth } from "./scenes/Scene2AncientEarth";
import { Scene3Collision } from "./scenes/Scene3Collision";
import { Scene4Formation } from "./scenes/Scene4Formation";
import { Scene5Everest } from "./scenes/Scene5Everest";

/**
 * The full Short plus each scene as a connected composition, so every scene
 * can be previewed and rendered on its own in Remotion Studio.
 */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="HimalayasShort"
      component={HimalayasShort}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={TOTAL_FRAMES}
    />
    <Folder name="Scenes">
      <Composition id="Scene1-Aerial" component={Scene1Aerial} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={sceneDuration("Scene1-Aerial")} />
      <Composition id="Scene2-AncientEarth" component={Scene2AncientEarth} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={sceneDuration("Scene2-AncientEarth")} />
      <Composition id="Scene3-Collision" component={Scene3Collision} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={sceneDuration("Scene3-Collision")} />
      <Composition id="Scene4-Formation" component={Scene4Formation} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={sceneDuration("Scene4-Formation")} />
      <Composition id="Scene5-Everest" component={Scene5Everest} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={sceneDuration("Scene5-Everest")} />
    </Folder>
  </>
);
