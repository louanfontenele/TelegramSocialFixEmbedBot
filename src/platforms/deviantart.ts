import { config } from "../config.js";
import { pickLiveDomain } from "./failover.js";
import { bareHost, canonicalize, resolveFinalUrl, type Platform } from "./types.js";

// Current deviation URLs: /<username>/art/<slug>-<id>. Legacy numeric-only
// permalinks (/view/<id>) still resolve on DeviantArt's own site, but
// fixdeviantart.com doesn't understand that form - it has to be expanded
// to the canonical /art/ path first.
const ART_PATH = /^\/[^/]+\/art\/[^/]+/;
const LEGACY_VIEW_PATH = /^\/view\/\d+/;

export const deviantart: Platform = {
  id: "deviantart",
  label: "DeviantArt",
  emoji: "🎨",

  matches(url) {
    if (bareHost(url) !== "deviantart.com") return false;
    return ART_PATH.test(url.pathname) || LEGACY_VIEW_PATH.test(url.pathname);
  },

  async resolve(url) {
    let target = url;

    if (LEGACY_VIEW_PATH.test(url.pathname)) {
      const resolved = await resolveFinalUrl(url.toString(), ["deviantart.com"]);
      if (!resolved || !ART_PATH.test(resolved.pathname)) return null;
      target = resolved;
    }

    const base = canonicalize(target);
    base.search = "";
    base.hash = "";
    const original = base.toString();

    const domain = await pickLiveDomain("deviantart", config.domains.deviantart, base.pathname);
    if (!domain) return null;

    const fixed = new URL(base.toString());
    fixed.hostname = domain;

    return { original, fixed: fixed.toString() };
  },
};
