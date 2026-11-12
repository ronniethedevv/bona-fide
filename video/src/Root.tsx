import { Composition, continueRender, delayRender } from "remotion";
import { Demo, TOTAL } from "./Demo";
import { FPS, HEIGHT, WIDTH } from "./theme";

// Fonts ship with the project (no network at render time), but Chromium still
// has to finish loading them before the first frame is captured.
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
      durationInFrames={TOTAL}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
}
