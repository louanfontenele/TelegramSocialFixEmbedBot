import { config } from "../config.js";
import type { Platform } from "./types.js";

// Bluesky post links -> FxBsky-compatible domain.
export const bluesky: Platform = {
  id: "bluesky",
  label: "Bluesky",

  matches(url) {
    const host = url.hostname.replace(/^www\./, "");
    return host === "bsky.app" && url.pathname.includes("/post/");
  },

  async resolve(url) {
    const fixed = new URL(url.toString());
    fixed.hostname = config.domains.bluesky;
    fixed.search = "";
    fixed.hash = "";
    return fixed.toString();
  },
};
