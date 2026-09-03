import { config } from "../config.js";
import { rewriteManualLink } from "./manual.js";
import { bareHost, resolveFinalUrl, type Platform } from "./types.js";

const VIDEO_ID = /^(?:BV[A-Za-z0-9]{10}|av\d+)$/i;
const CONTENT_PATH = /^\/(?:video\/(?:BV[A-Za-z0-9]{10}|av\d+)|opus\/\d+|bangumi\/play\/(?:ep|ss)\d+|audio\/au\d+)\/?$/i;

function contentPath(url: URL): string | null {
  if (url.hostname === "t.bilibili.com" && /^\/\d+\/?$/.test(url.pathname)) {
    return `/opus${url.pathname.replace(/\/$/, "")}`;
  }
  if (bareHost(url) !== "bilibili.com") return null;
  if (CONTENT_PATH.test(url.pathname)) return url.pathname.replace(/\/$/, "");
  // Festival share URLs identify a video in the query, not in the path.
  const bvid = url.searchParams.get("bvid");
  if (/^\/festival\/[^/]+\/?$/.test(url.pathname) && bvid && VIDEO_ID.test(bvid)) {
    return `/video/${bvid}`;
  }
  return null;
}

function isShortlink(url: URL): boolean {
  return bareHost(url) === "b23.tv" && /^\/[A-Za-z0-9]+\/?$/.test(url.pathname);
}

export const bilibili: Platform = {
  id: "bilibili",
  label: "Bilibili",
  emoji: "📺",
  matches: (url) => isShortlink(url) || contentPath(url) !== null,
  async resolve(url) {
    const target = isShortlink(url)
      ? await resolveFinalUrl(url.toString(), ["b23.tv", "bilibili.com"])
      : url;
    if (!target) return null;
    const path = contentPath(target);
    if (!path) return null;
    const original = new URL(`https://bilibili.com${path}`);
    // p selects a multipart video's part; t selects its start time.
    // Dropping p silently changes the requested content to part one.
    if (path.startsWith("/video/")) {
      for (const key of ["p", "t"]) {
        const value = target.searchParams.get(key);
        if (value && (key === "p" ? /^[1-9]\d*$/ : /^\d+(?:\.\d+)?$/).test(value)) {
          original.searchParams.set(key, value);
        }
      }
    }
    return rewriteManualLink(original, config.domains.bilibili);
  },
};
