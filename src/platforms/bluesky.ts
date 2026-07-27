import { config } from "../config.js";
import { bareHost, type Platform } from "./types.js";

// Bluesky post links -> FxBsky-compatible domain.
export const bluesky: Platform = {
  id: "bluesky",
  label: "Bluesky",
  emoji: "🦋",

  matches(url) {
    return bareHost(url) === "bsky.app" && url.pathname.includes("/post/");
  },

  async resolve(url) {
    const fixed = new URL(url.toString());
    fixed.hostname = config.domains.bluesky;
    fixed.search = "";
    fixed.hash = "";
    return fixed.toString();
  },
};
