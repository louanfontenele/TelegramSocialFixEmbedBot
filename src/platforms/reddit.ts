import { config } from "../config.js";
import { pickLiveDomain } from "./failover.js";
import { bareHost, canonicalize, isHostWithin, resolveFinalUrl, type Platform } from "./types.js";

/**
 * The routes fxreddit exposes: a post under a subreddit or a user profile,
 * reached either by comment permalink or by share id, plus the bare
 * /comments/:id form. Trailing slug and comment id are optional.
 */
const POST_PATH =
  /^\/(?:(?:r|u|user)\/[^/]+\/(?:comments\/[a-z0-9]+|s\/[A-Za-z0-9]+)|comments\/[a-z0-9]+)/i;

// redd.it/<id> is a post shortlink. Its i. and v. siblings are direct media
// hosts that Telegram already embeds on its own - rewriting those would
// replace a working image with a broken page.
const MEDIA_SHORTLINK_HOSTS = ["i.redd.it", "v.redd.it", "preview.redd.it", "a.thumbs.redd.it"];

// Reddit posts -> whichever fxreddit-compatible backend currently serves an
// embed. Reddit's own links unfurl poorly in Telegram: no image, no video,
// and nothing at all for galleries.
export const reddit: Platform = {
  id: "reddit",
  label: "Reddit",
  emoji: "👽",

  matches(url) {
    const host = url.hostname.toLowerCase();
    if (MEDIA_SHORTLINK_HOSTS.includes(host)) return false;

    // Covers www, old, new, np, amp, i and m variants of reddit.com.
    if (isHostWithin(host, ["reddit.com"])) return POST_PATH.test(url.pathname);

    // Bare redd.it shortlink: /<postid>
    return bareHost(url) === "redd.it" && /^\/[a-z0-9]+\/?$/i.test(url.pathname);
  },

  async resolve(url) {
    // old./new./np./amp./m. shares are common, and the share sheet appends
    // a tracking query (?utm_source=share&...) - the button should point
    // at a clean link on the normal site, not a tracked mobile front-end.
    // Share tokens aren't post IDs: expand them before changing the domain.
    const target = /^\/(?:r|u|user)\/[^/]+\/s\//i.test(url.pathname)
      ? await resolveFinalUrl(url.toString(), ["reddit.com"])
      : url;
    if (!target || !reddit.matches(target)) return null;
    if (/^\/(?:r|u|user)\/[^/]+\/s\//i.test(target.pathname)) return null;
    const base = canonicalize(target);
    // /comments/<id> works on Reddit itself and the manual RedditEZ mirror;
    // a bare /<id> path is only understood by some fxreddit instances.
    if (bareHost(base) === "redd.it") {
      base.hostname = "reddit.com";
      base.pathname = `/comments${base.pathname.replace(/\/$/, "")}`;
    }
    base.search = "";
    base.hash = "";
    const original = base.toString();

    const domain = await pickLiveDomain("reddit", config.domains.reddit, base.pathname, "title");
    if (!domain) return null;

    const fixed = new URL(base.toString());
    fixed.hostname = domain;

    return { original, fixed: fixed.toString() };
  },
};
