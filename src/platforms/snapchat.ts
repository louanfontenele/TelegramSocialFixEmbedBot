import { config } from "../config.js";
import { rewriteManualLink } from "./manual.js";
import { bareHost, resolveFinalUrl, type Platform } from "./types.js";

function contentPath(url: URL): string | null {
  if (bareHost(url) !== "snapchat.com") return null;
  const spotlight = /^\/(?:@[^/]+\/)?spotlight\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
  if (spotlight) return `/spotlight/${spotlight[1]}`;
  // Public story links include both the story owner and the individual snap.
  if (/^\/add\/[^/]+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
    return url.pathname.replace(/\/$/, "");
  }
  return null;
}

function isShortlink(url: URL): boolean {
  return (bareHost(url) === "snapchat.com" && /^\/t\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) ||
    (url.hostname === "t.snapchat.com" && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname));
}

export const snapchat: Platform = {
  id: "snapchat",
  label: "Snapchat",
  emoji: "👻",
  matches: (url) => isShortlink(url) || contentPath(url) !== null,
  async resolve(url) {
    const target = isShortlink(url) ? await resolveFinalUrl(url.toString(), ["snapchat.com"]) : url;
    if (!target) return null;
    const path = contentPath(target);
    if (!path) return null;
    return rewriteManualLink(new URL(`https://snapchat.com${path}`), config.domains.snapchat);
  },
};
