import { config } from "../config.js";
import { resolveFinalUrl, type Platform } from "./types.js";

// TikTok links (including short vm.tiktok.com/vt.tiktok.com links) -> follow
// redirects to the canonical URL, then rewrite to a TikTok embed-fix domain.
export const tiktok: Platform = {
  id: "tiktok",
  label: "TikTok",

  matches(url) {
    const host = url.hostname.replace(/^www\./, "");
    return host === "tiktok.com" || host === "vm.tiktok.com" || host === "vt.tiktok.com";
  },

  async resolve(url) {
    const final = await resolveFinalUrl(url.toString());
    if (!final) return null;

    final.hostname = config.domains.tiktok;
    final.search = "";
    final.hash = "";
    return final.toString();
  },
};
