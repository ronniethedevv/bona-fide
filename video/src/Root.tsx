import { Composition, continueRender, delayRender } from "remotion";
import { Demo } from "./Demo";
import { calculateDemoMetadata } from "./timing";
import { FPS, HEIGHT, WIDTH } from "./theme";

// Bundled with the project: never fetch fonts at render time, it stalls.
import "@fontsource/newsreader/300-italic.css";
import "@fontsource/newsreader/400.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";

const fontsHandle = delayRender("loading fonts");
void document.fonts.ready.then(() => continueRender(fontsHandle));

export function RemotionRoot() {
  return (
    <Composition
      id="Demo"
      component={Demo}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      // The film is sized by the narration, not the other way round.
      calculateMetadata={calculateDemoMetadata}
      durationInFrames={1}
      defaultProps={{ scenes: [], music: null }}
    />
  );
}
