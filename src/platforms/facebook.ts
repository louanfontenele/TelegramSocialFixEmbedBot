import { resolveFinalUrl, type Platform } from "./types.js";

// Facebook doesn't have a workable third-party embed fixer, so this only
// resolves shortened fb.watch links and strips tracking params, keeping
// only the parameters actually needed to identify the content (ported
// from the original bot's logic).
const ESSENTIAL_PARAMS = ["v", "id", "story_fbid", "set", "post_id", "fbid", "view_single"];

export const facebook: Platform = {
  id: "facebook",
  label: "Facebook",

  matches(url) {
    const host = url.hostname.replace(/^www\./, "");
    return host === "facebook.com" || host === "fb.watch";
  },

  async resolve(url) {
    const final = await resolveFinalUrl(url.toString());
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
