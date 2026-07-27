import { config } from "../config.js";
import { bareHost, canonicalize, type Platform } from "./types.js";

// Bluesky post links -> FxBsky-compatible domain.
export const bluesky: Platform = {
  id: "bluesky",
  label: "Bluesky",
  emoji: "🦋",

  matches(url) {
    return bareHost(url) === "bsky.app" && url.pathname.includes("/post/");
  },

  async resolve(url) {
    const original = canonicalize(url);

    const fixed = new URL(original.toString());
    fixed.hostname = config.domains.bluesky;
    fixed.search = "";
    fixed.hash = "";

    // FxBsky is the same FxEmbed project as fixupx and supports the same
    // /<lang> machine-translation suffix.
    if (config.translate.enabled) {
      fixed.pathname = `${fixed.pathname.replace(/\/$/, "")}/${config.translate.language}`;
    }

    return { original: original.toString(), fixed: fixed.toString() };
  },
};
