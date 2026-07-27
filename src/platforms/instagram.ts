import { config } from "../config.js";
import type { Platform } from "./types.js";

// Instagram posts/reels/tv links -> InstaFix-compatible domain.
// Stories are intentionally left untouched: they aren't embeddable this way
// and stripping their query string breaks the link.
export const instagram: Platform = {
  id: "instagram",
  label: "Instagram",

  matches(url) {
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "instagram.com") return false;
    return /\/(p|reel|reels|tv)\//.test(url.pathname);
  },

  async resolve(url) {
    const fixed = new URL(url.toString());
    fixed.hostname = config.domains.instagram;
    fixed.search = "";
    fixed.hash = "";
    return fixed.toString();
  },
};
