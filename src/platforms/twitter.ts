import { config } from "../config.js";
import type { Platform } from "./types.js";

// X / Twitter status links -> FixTweet/FxTwitter-compatible domain.
export const twitter: Platform = {
  id: "twitter",
  label: "X / Twitter",
  emoji: "🐦",

  matches(url) {
    const host = url.hostname.replace(/^www\./, "");
    return (host === "twitter.com" || host === "x.com") && url.pathname.includes("/status/");
  },

  async resolve(url) {
    const fixed = new URL(url.toString());
    fixed.hostname = config.domains.twitter;
    fixed.search = "";
    fixed.hash = "";
    return fixed.toString();
  },
};
