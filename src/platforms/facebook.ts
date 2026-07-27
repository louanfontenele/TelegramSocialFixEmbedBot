import { config } from "../config.js";
import { pickLiveDomain } from "./failover.js";
import { canonicalize, isHostWithin, resolveFinalUrl, type Platform } from "./types.js";

const ESSENTIAL_PARAMS = ["v", "id", "story_fbid", "set", "post_id", "fbid", "view_single"];

// Reels/Watch are the content Facebook's own OG tags most often fail to
// serve to bots; regular posts and photos usually already unfurl fine.
const REEL_OR_WATCH_PATH = /^\/(?:[a-z]{2}\/)?(?:reel|watch)\//;

export const facebook: Platform = {
  id: "facebook",
  label: "Facebook",
  emoji: "👤",

  matches(url) {
    // isHostWithin covers m., web., mbasic., l. and the regional subdomains.
    return isHostWithin(url.hostname, ["facebook.com", "fb.watch", "fb.me"]);
  },

  async resolve(url) {
    // Facebook's /l.php?u= is an open redirect, so the hop chain is pinned
    // to Facebook's own domains.
    const final = await resolveFinalUrl(url.toString(), ["facebook.com", "fb.watch", "fb.me"]);
    if (!final) return null;

    // m./web./mbasic. shares are common from phones; the button should
    // point at the normal site, not the mobile subdomain.
    const base = canonicalize(final);
    base.hash = "";

    // Facebook forces a login wall for some content; offer the bare path,
    // with no query at all since none of it is meaningful there.
    if (base.pathname.includes("/login")) {
      base.search = "";
      const bare = base.toString().replace(/\/$/, "");
      return { original: bare, fixed: bare };
    }

    // Keep only the params that actually identify the content - the rest
    // is tracking, and this cleanup applies before branching so neither
    // the button link nor the embed link ever carries it.
    const cleanParams = new URLSearchParams();
    for (const key of ESSENTIAL_PARAMS) {
      const value = base.searchParams.get(key);
      if (value !== null) cleanParams.set(key, value);
    }
    base.search = cleanParams.toString();
    const original = base.toString().replace(/\/$/, "");

    if (REEL_OR_WATCH_PATH.test(base.pathname) && config.domains.facebookReel.length > 0) {
      const domain = await pickLiveDomain("facebook-reel", config.domains.facebookReel, base.pathname);
      if (domain) {
        const fixed = new URL(base.toString());
        fixed.hostname = domain;
        return { original, fixed: fixed.toString().replace(/\/$/, "") };
      }
      // No third-party backend served this reel either - fall through to
      // the tracking-cleaned Facebook link below rather than giving up.
    }

    return { original, fixed: original };
  },
};
