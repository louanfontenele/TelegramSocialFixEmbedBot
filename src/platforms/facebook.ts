import { isHostWithin, resolveFinalUrl, type Platform } from "./types.js";

// Facebook doesn't have a workable third-party embed fixer, so this only
// resolves shortened fb.watch links and strips tracking params, keeping
// only the parameters actually needed to identify the content (ported
// from the original bot's logic).
const ESSENTIAL_PARAMS = ["v", "id", "story_fbid", "set", "post_id", "fbid", "view_single"];

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

    // Facebook forces a login wall for some content; just return the bare path.
    if (final.pathname.includes("/login")) {
      final.search = "";
      final.hash = "";
      return final.toString().replace(/\/$/, "");
    }

    const cleanParams = new URLSearchParams();
    for (const key of ESSENTIAL_PARAMS) {
      const value = final.searchParams.get(key);
      if (value !== null) cleanParams.set(key, value);
    }
    final.search = cleanParams.toString();
    final.hash = "";

    return final.toString().replace(/\/$/, "");
  },
};
