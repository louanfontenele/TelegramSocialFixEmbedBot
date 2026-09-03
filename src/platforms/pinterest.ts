import { config } from "../config.js";
import { rewriteManualLink } from "./manual.js";
import { bareHost, isHostWithin, resolveFinalUrl, type Platform } from "./types.js";

// Explicit regional domains, never pinterest.<arbitrary suffix>.
// URL forms cross-checked with yt-dlp's Pinterest extractor.
const PINTEREST_DOMAINS = [
  "com", "fr", "de", "ch", "jp", "cl", "ca", "it", "co.uk", "nz", "ru", "com.au",
  "at", "pt", "co.kr", "es", "com.mx", "dk", "ph", "th", "com.uy", "co", "nl",
  "info", "kr", "ie", "vn", "com.vn", "ec", "mx", "in", "pe", "co.at", "hu",
  "co.in", "co.nz", "id", "com.ec", "com.py", "tw", "be", "uk", "com.bo", "com.pe",
].map((suffix) => `pinterest.${suffix}`);
const PIN_PATH = /^\/pin\/(?:[^/]+--)?(\d+)\/?$/;

function pinId(url: URL): string | undefined {
  return isHostWithin(url.hostname, PINTEREST_DOMAINS) ? PIN_PATH.exec(url.pathname)?.[1] : undefined;
}

function isShortlink(url: URL): boolean {
  return bareHost(url) === "pin.it" && /^\/[A-Za-z0-9]+\/?$/.test(url.pathname);
}

export const pinterest: Platform = {
  id: "pinterest",
  label: "Pinterest",
  emoji: "📌",
  matches: (url) => isShortlink(url) || pinId(url) !== undefined,
  async resolve(url) {
    const target = isShortlink(url)
      ? await resolveFinalUrl(url.toString(), ["pin.it", ...PINTEREST_DOMAINS])
      : url;
    if (!target) return null;
    const id = pinId(target);
    if (!id) return null;
    const original = new URL(`https://pinterest.com/pin/${id}/`);
    return rewriteManualLink(original, config.domains.pinterest);
  },
};
