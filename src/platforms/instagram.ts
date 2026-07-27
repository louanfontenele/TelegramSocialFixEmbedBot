import { config } from "../config.js";
import { pickLiveDomain } from "./failover.js";
import { bareHost, type Platform } from "./types.js";

// Instagram posts/reels/tv links -> whichever InstaFix-compatible backend
// actually serves an embed for that post. Stories are intentionally left
// untouched: they aren't embeddable this way and stripping their query
// string breaks the link.
export const instagram: Platform = {
  id: "instagram",
  label: "Instagram",
  emoji: "📸",

  matches(url) {
    if (bareHost(url) !== "instagram.com") return false;
    return /^\/(?:[^/]+\/)?(p|reel|reels|tv)\/[^/]+/.test(url.pathname);
  },

  async resolve(url) {
    const domain = await pickLiveDomain("instagram", config.domains.instagram, url.pathname);
    if (!domain) return null;

    const fixed = new URL(url.toString());
    fixed.hostname = domain;
    fixed.search = "";
    fixed.hash = "";
    return fixed.toString();
  },
};
