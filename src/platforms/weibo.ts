import { config } from "../config.js";
import { rewriteManualLink } from "./manual.js";
import { bareHost, type Platform } from "./types.js";

function contentPath(url: URL): string | null {
  if (bareHost(url) === "weibo.cn") {
    const mobile = /^\/(?:status|detail)\/([A-Za-z0-9]+)\/?$/.exec(url.pathname);
    // Desktop's /0/<id> route identifies a post without requiring its author ID.
    return mobile ? `/0/${mobile[1]}` : null;
  }
  if (url.hostname === "video.weibo.com" && /^\/show\/?$/.test(url.pathname)) {
    const fid = url.searchParams.get("fid");
    return fid && /^\d+:[A-Za-z0-9]+$/.test(fid) ? `/tv/show/${fid}` : null;
  }
  if (bareHost(url) !== "weibo.com") return null;
  if (/^\/(?:\d+\/[A-Za-z0-9]+|tv\/show\/\d+:[A-Za-z0-9]+)\/?$/.test(url.pathname)) {
    return url.pathname.replace(/\/$/, "");
  }
  return null;
}

export const weibo: Platform = {
  id: "weibo",
  label: "Weibo",
  emoji: "💬",
  matches: (url) => contentPath(url) !== null,
  async resolve(url) {
    const path = contentPath(url);
    if (!path) return null;
    return rewriteManualLink(new URL(`https://weibo.com${path}`), config.domains.weibo);
  },
};
