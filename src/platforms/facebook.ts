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
    const original = canonicalize(final);

    // Facebook forces a login wall for some content; offer the bare path.
    if (original.pathname.includes("/login")) {
      const fixed = new URL(original.toString());
      fixed.search = "";
      fixed.hash = "";
      const bare = fixed.toString().replace(/\/$/, "");
      return { original: original.toString(), fixed: bare };
    }

    if (REEL_OR_WATCH_PATH.test(original.pathname) && config.domains.facebookReel.length > 0) {
      const domain = await pickLiveDomain("facebook-reel", config.domains.facebookReel, original.pathname);
      if (domain) {
        const fixed = new URL(original.toString());
        fixed.hostname = domain;
        fixed.hash = "";
        return { original: original.toString(), fixed: fixed.toString() };
      }
      // No third-party backend served this reel either - fall through to
      // the tracking-cleaned Facebook link below rather than giving up.
    }

    const fixed = new URL(original.toString());
    const cleanParams = new URLSearchParams();
    for (const key of ESSENTIAL_PARAMS) {
      const value = fixed.searchParams.get(key);
      if (value !== null) cleanParams.set(key, value);
    }
    fixed.search = cleanParams.toString();
    fixed.hash = "";

    return { original: original.toString(), fixed: fixed.toString().replace(/\/$/, "") };
  },
};
