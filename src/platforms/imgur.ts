import { config } from "../config.js";
import { rewriteManualLink } from "./manual.js";
import { bareHost, type Platform } from "./types.js";

// Imgur IDs are case-sensitive. A descriptive slug can precede an ID.
const ID = "([A-Za-z0-9]{5}|[A-Za-z0-9]{7})";
const POST = new RegExp(`^/(?:[^/]+-)?${ID}(?:\\.(?:jpe?g|png|webp|gif|gifv|mp4))?/?$`, "i");
const ALBUM = new RegExp(`^/(a|gallery)/(?:[^/]+-)?${ID}/?$`);
const TOPIC_POST = new RegExp(`^/(?:t|topic|r)/[^/]+/(?:[^/]+-)?${ID}/?$`);
const RESERVED = new Set(["about", "account", "advertising", "contact", "explore", "gallery", "library", "privacy", "publish", "random", "register", "removal", "search", "signin", "signup", "support", "upload", "welcome"]);

function contentPath(url: URL): string | null {
  // Direct images and MP4s already work as media. GIFV is an HTML wrapper,
  // so only that direct-host form needs conversion to the post page.
  if (url.hostname === "i.imgur.com") {
    const gifv = new RegExp(`^/${ID}\\.gifv$`, "i").exec(url.pathname);
    return gifv ? `/${gifv[1]}` : null;
  }
  if (bareHost(url) !== "imgur.com") return null;
  const album = ALBUM.exec(url.pathname);
  if (album) return `/${album[1]}/${album[2]}`;
  const topic = TOPIC_POST.exec(url.pathname);
  if (topic) return `/gallery/${topic[1]}`;
  if (RESERVED.has(url.pathname.replace(/^\/|\/$/g, "").toLowerCase())) return null;
  const post = POST.exec(url.pathname);
  return post ? `/${post[1]}` : null;
}

export const imgur: Platform = {
  id: "imgur",
  label: "Imgur",
  emoji: "🖼️",
  matches: (url) => contentPath(url) !== null,
  async resolve(url) {
    const path = contentPath(url);
    if (!path) return null;
    const original = new URL(`https://imgur.com${path}`);
    // Album anchors may select a particular image; they are not trackers.
    if (/^\/(?:a|gallery)\//.test(path) && /^#(?:\d+|[A-Za-z0-9]{5}|[A-Za-z0-9]{7})$/.test(url.hash)) {
      original.hash = url.hash;
    }
    return rewriteManualLink(original, config.domains.imgur);
  },
};
