import { config } from "../config.js";
import { canonicalize, isHostWithin, resolveFinalUrl, type Platform } from "./types.js";

// What a resolved short link should look like. An unknown or expired
// vm./vt.tiktok.com code redirects to the bare homepage (often with a
// tracking query like ?_r=1) instead of failing outright.
const VIDEO_PATH = /\/@[^/]+\/(?:video|photo)\/\d+/;
const LIVE_PATH = /\/@[^/]+\/live$/;

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
    // either useless to us or an attempt to steer the bot elsewhere. This
    // also turns a vm./vt.tiktok.com shortlink into the full @user/video/id
    // (or /live) link, which is what the "original link" button should
    // point at.
    const final = await resolveFinalUrl(url.toString(), ["tiktok.com"]);
    if (!final || !(VIDEO_PATH.test(final.pathname) || LIVE_PATH.test(final.pathname))) return null;

    // The redirect chain adds its own tracking query (_r, _t, share id...) -
    // strip it so the button points at a bare, shareable link.
    const base = canonicalize(final);
    base.search = "";
    base.hash = "";
    const original = base.toString();

    // tfxktok explicitly doesn't support /live (it serves a "Live isn't
    // supported" card), whereas TikTok's own live page already carries a
    // working og:title/description/image - so there's nothing to fix here.
    if (LIVE_PATH.test(base.pathname)) {
      return { original, fixed: original };
    }

    const fixed = new URL(base.toString());
    fixed.hostname = config.domains.tiktok;

    return { original, fixed: fixed.toString() };
  },
};
