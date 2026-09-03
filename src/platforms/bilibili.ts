import { config } from "../config.js";
import { pickLiveDomain } from "./failover.js";
import { bareHost, resolveFinalUrl, type Platform } from "./types.js";

const VIDEO_ID = /^(?:BV[A-Za-z0-9]{10}|av\d+)$/i;
const CONTENT_PATH =
  /^\/(?:video\/(?:BV[A-Za-z0-9]{10}|av\d+)|opus\/\d+|bangumi\/play\/(?:ep|ss)\d+|read\/cv\d+)\/?$/i;
const SOURCE_DOMAINS = ["bilibili.com", "b23.tv"];

function contentPath(url: URL): string | null {
  if (url.hostname === "t.bilibili.com" && /^\/\d+\/?$/.test(url.pathname)) {
    return `/opus${url.pathname.replace(/\/$/, "")}`;
  }
  if (bareHost(url) !== "bilibili.com") return null;
  if (CONTENT_PATH.test(url.pathname)) return url.pathname.replace(/\/$/, "");

  // Festival share pages identify their video in the query string.
  const bvid = url.searchParams.get("bvid");
  if (/^\/festival\/[^/]+\/?$/.test(url.pathname) && bvid && VIDEO_ID.test(bvid)) {
    return `/video/${bvid}`;
  }
  return null;
}

function isShortlink(url: URL): boolean {
  return bareHost(url) === "b23.tv" && /^\/[A-Za-z0-9]+\/?$/.test(url.pathname);
}

/** Bilibili videos and image/text Opus posts -> BiliFix. */
export const bilibili: Platform = {
  id: "bilibili",
  label: "Bilibili",
  emoji: "📺",

  matches(url) {
    return isShortlink(url) || contentPath(url) !== null;
  },

  async resolve(url) {
    // Expand Bilibili's short links and legacy t.bilibili.com posts before
    // rewriting so the Original button points at a normal canonical page.
    const target = isShortlink(url)
      ? await resolveFinalUrl(url.toString(), SOURCE_DOMAINS)
      : url;
    if (!target) return null;

    const path = contentPath(target);
    if (!path) return null;

    const original = new URL(`https://bilibili.com${path}`);
    // `p` selects a part of a multipart video and `t` its start time.
    if (path.startsWith("/video/")) {
      for (const key of ["p", "t"]) {
        const value = target.searchParams.get(key);
        const valid = key === "p" ? /^[1-9]\d*$/.test(value ?? "") : /^\d+(?:\.\d+)?$/.test(value ?? "");
        if (value && valid) original.searchParams.set(key, value);
      }
    }

    const probePath = original.pathname + original.search;
    // Videos and episodes must expose playable/image media. Opus and article
    // posts may legitimately be text-only, so a real Open Graph title is
    // sufficient for those routes.
    const requiredEmbed = path.startsWith("/video/") || path.startsWith("/bangumi/") ? "media" : "title";
    const domain = await pickLiveDomain("bilibili", config.domains.bilibili, probePath, requiredEmbed);
    if (!domain) return null;

    const fixed = new URL(original.toString());
    fixed.hostname = domain;
    return { original: original.toString(), fixed: fixed.toString() };
  },
};
