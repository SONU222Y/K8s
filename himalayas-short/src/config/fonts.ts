import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

/**
 * Fonts are self-hosted in public/fonts (all SIL Open Font License), so
 * renders work offline and never stall on a CDN. loadFont() holds the render
 * with delayRender() until each face is ready.
 */
export const TITLE_FONT = "Cinzel";
export const LABEL_FONT = "Inter";
export const CAPTION_FONT = "Montserrat";

loadFont({ family: TITLE_FONT, url: staticFile("fonts/Cinzel-700.woff2"), weight: "700" });
loadFont({ family: LABEL_FONT, url: staticFile("fonts/Inter-700.woff2"), weight: "700" });
loadFont({ family: LABEL_FONT, url: staticFile("fonts/Inter-800.woff2"), weight: "800" });
loadFont({ family: CAPTION_FONT, url: staticFile("fonts/Montserrat-900.woff2"), weight: "900" });

export const COLORS = {
  gold: "#FFC94A",
  ice: "#DDEBFF",
  magma: "#FF6A2B",
  white: "#FFFFFF",
  ink: "#05070C",
};
