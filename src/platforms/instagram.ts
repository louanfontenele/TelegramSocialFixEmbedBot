import { config } from "../config.js";
import { pickLiveDomain } from "./failover.js";
import { bareHost, canonicalize, resolveFinalUrl, type Platform } from "./types.js";

// Optional leading username, e.g. /username/p/ABC as well as /p/ABC.
const POST_PATH = /^\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/[^/]+/;
const SHARE_PATH = /^\/share\//;

// Instagram posts/reels/tv links -> whichever InstaFix-compatible backend
// actually serves an embed for that post. Stories are intentionally left
// untouched: they aren't embeddable this way and stripping their query
// string breaks the link.
export const instagram: Platform = {
  id: "instagram",
  label: "Instagram",
  emoji: "📸",

  matches(url) {
    const host = bareHost(url);
    if (host !== "instagram.com" && host !== "instagr.am") return false;
    return POST_PATH.test(url.pathname) || SHARE_PATH.test(url.pathname);
  },

  async resolve(url) {
    let target = url;

    // /share/ links carry no post id of their own; they redirect to the
    // canonical /p/ or /reel/ URL, which is what the fixers understand.
    if (SHARE_PATH.test(target.pathname)) {
      const resolved = await resolveFinalUrl(target.toString(), ["instagram.com", "instagr.am"]);
      if (!resolved || !POST_PATH.test(resolved.pathname)) return null;
      target = resolved;
    }

    // igshid and similar tracking params ride along on every share - the
    // button should point at a clean post link, not a tracked one.
    const base = canonicalize(target);
    base.search = "";
    base.hash = "";
    const original = base.toString();

    const domain = await pickLiveDomain("instagram", config.domains.instagram, base.pathname);
    if (!domain) return null;

    const fixed = new URL(base.toString());
    fixed.hostname = domain;

    return { original, fixed: fixed.toString() };
  },
};
