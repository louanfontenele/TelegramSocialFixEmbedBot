import { config } from "../config.js";
import { bareHost, resolveFinalUrl, type Platform } from "./types.js";

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

    const fixed = new URL(target.toString());
    fixed.hostname = config.domains.twitter;
    fixed.search = "";
    fixed.hash = "";
    return fixed.toString();
  },
};
