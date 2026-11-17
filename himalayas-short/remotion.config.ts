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

// WebGL (Three.js) renderer for headless Chrome.
// "swangle" = software WebGL: works everywhere (WSL, servers, laptops without
// GPU passthrough) and gives identical output, just slower.
// If you have a working GPU, `npm run render:gpu` uses "angle" (much faster).
Config.setChromiumOpenGlRenderer("swangle");

// The 3D scenes take a few seconds to build their terrain on first load.
Config.setDelayRenderTimeoutInMilliseconds(120000);
