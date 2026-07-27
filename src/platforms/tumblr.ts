import { config } from "../config.js";
import { pickLiveDomain } from "./failover.js";
import type { Platform } from "./types.js";

interface TumblrPost {
  blog: string;
  postId: string;
  slug?: string;
}

/**
 * Tumblr posts can be shared either as tumblr.com/<blog>/<id> or as
 * <blog>.tumblr.com/<id> - both mean the same post.
 */
function parsePost(url: URL): TumblrPost | null {
  const host = url.hostname.toLowerCase();

  if (host === "tumblr.com" || host === "www.tumblr.com" || host === "m.tumblr.com") {
    const match = url.pathname.match(/^\/([a-zA-Z0-9_-]+)\/(\d+)(?:\/([^/?#]*))?/);
    if (!match) return null;
    return { blog: match[1], postId: match[2], slug: match[3] };
  }

  if (host.endsWith(".tumblr.com")) {
    const blog = host.slice(0, -".tumblr.com".length);
    const match = url.pathname.match(/^\/(\d+)(?:\/([^/?#]*))?/);
    if (!match) return null;
    return { blog, postId: match[1], slug: match[2] };
  }

  return null;
}

// Tumblr posts -> fxtumblr-compatible domain. Tumblr's own pages frequently
// come back without an og:title at all, which InstaFix's author summed up
// as "Tumblr embeds are poor quality" - the reason this project exists.
export const tumblr: Platform = {
  id: "tumblr",
  label: "Tumblr",
  emoji: "📓",

  matches(url) {
    return parsePost(url) !== null;
  },

  async resolve(url) {
    const post = parsePost(url);
    if (!post) return null;

    const slugPart = post.slug ? `/${post.slug}` : "";
    const original = `https://${post.blog}.tumblr.com/${post.postId}${slugPart}`;

    const domain = await pickLiveDomain("tumblr", config.domains.tumblr, `/${post.blog}/${post.postId}`, "title");
    if (!domain) return null;

    const fixed = `https://${domain}/${post.blog}/${post.postId}${slugPart}`;
    return { original, fixed };
  },
};
