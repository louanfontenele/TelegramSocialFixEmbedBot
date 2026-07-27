import { config } from "../config.js";
import { isHostWithin, resolveFinalUrl, type Platform } from "./types.js";

// TikTok links (including short vm.tiktok.com/vt.tiktok.com links) -> follow
// redirects to the canonical URL, then rewrite to a TikTok embed-fix domain.
export const tiktok: Platform = {
  id: "tiktok",
  label: "TikTok",
  emoji: "🎵",

  matches(url) {
    // Covers tiktok.com plus its many short-link and regional subdomains.
    return isHostWithin(url.hostname, ["tiktok.com"]);
  },

  async resolve(url) {
    // Short links redirect within TikTok's own domains; anything else is
    // either useless to us or an attempt to steer the bot elsewhere.
    const final = await resolveFinalUrl(url.toString(), ["tiktok.com"]);
    if (!final) return null;

    final.hostname = config.domains.tiktok;
    final.search = "";
    final.hash = "";
    return final.toString();
  },
};
