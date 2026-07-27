import { config } from "../config.js";
import { pickLiveDomain } from "./failover.js";
import { bareHost, isHostWithin, type Platform } from "./types.js";

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
    // A redd.it path is already the bare post id, which is exactly the
    // "direct id" route these backends expose - no rewriting needed.
    const domain = await pickLiveDomain("reddit", config.domains.reddit, url.pathname, "title");
    if (!domain) return null;

    const fixed = new URL(url.toString());
    fixed.hostname = domain;
    fixed.search = "";
    fixed.hash = "";
    return fixed.toString();
  },
};
