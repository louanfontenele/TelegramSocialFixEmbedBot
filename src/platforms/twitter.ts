import { config } from "../config.js";
import { bareHost, canonicalize, resolveFinalUrl, type Platform } from "./types.js";

const STATUS_PATH = /\/status(?:es)?\/\d+/;
const SOURCE_HOSTS = ["twitter.com", "x.com"];

// X / Twitter status links -> FixTweet/FxTwitter-compatible domain.
export const twitter: Platform = {
  id: "twitter",
  label: "X / Twitter",
  emoji: "✖️",

  matches(url) {
    const host = bareHost(url);

    // t.co shortens arbitrary URLs, so it only qualifies once the redirect
    // is followed and proves to land on a status.
    if (host === "t.co") return true;
    return SOURCE_HOSTS.includes(host) && STATUS_PATH.test(url.pathname);
  },

  async resolve(url) {
    let target = url;

    if (bareHost(target) === "t.co") {
      // Pinned to X's own hosts: a t.co link can point anywhere, and this
      // bot has no business fetching whatever else it might resolve to.
      const resolved = await resolveFinalUrl(target.toString(), ["t.co", ...SOURCE_HOSTS]);
      if (!resolved || !STATUS_PATH.test(resolved.pathname)) return null;
      target = resolved;
    }

    // m./mobile. shares are common from phones, and share links carry a
    // tracking query (?s=.. &t=..) - the button should point at a clean
    // link on the normal site, not a mobile subdomain with trackers.
    const base = canonicalize(target);
    base.search = "";
    base.hash = "";
    const original = base.toString();

    const fixed = new URL(base.toString());
    fixed.hostname = config.domains.twitter;

    // fixupx/FxTwitter render a machine translation when the path ends in
    // /<lang>, e.g. https://fixupx.com/i/status/123/pt. This only makes
    // sense on the fixer link, not on the real X link.
    if (config.translate.enabled) {
      fixed.pathname = `${fixed.pathname.replace(/\/$/, "")}/${config.translate.language}`;
    }

    return { original, fixed: fixed.toString() };
  },
};
