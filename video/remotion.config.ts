import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// This container ships Chromium at a fixed path; don't let Remotion fetch its own.
Config.setBrowserExecutable("/opt/pw-browsers/chromium");
Config.setChromiumOpenGlRenderer("swangle");
