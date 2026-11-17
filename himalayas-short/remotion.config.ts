/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);

// WebGL (Three.js) needs a GPU-backed renderer. "angle" uses your GPU.
// On a server/VM without a GPU, render with `--gl=swangle` (npm run render:cpu).
Config.setChromiumOpenGlRenderer("angle");

// The 3D scenes take a few seconds to build their terrain on first load.
Config.setDelayRenderTimeoutInMilliseconds(120000);
