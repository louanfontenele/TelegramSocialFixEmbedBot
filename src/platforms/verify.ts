import type { Resolved } from "./types.js";
import { probeEmbedUrl, type EmbedKind } from "./failover.js";

const MEDIA_PLATFORMS = new Set([
  "bilibili",
  "deviantart",
  "facebook",
  "instagram",
  "pixiv",
  "tiktok",
  "twitch",
  "youtube",
]);

/** Verifies third-party fixer output before it is presented as corrected.
 * Native links that only had tracking removed need no third-party check. */
export async function verifyResolvedLink(platformId: string, result: Resolved): Promise<boolean> {
  let original: URL;
  let fixed: URL;
  try {
    original = new URL(result.original);
    fixed = new URL(result.fixed);
  } catch {
    return false;
  }

  if (original.hostname === fixed.hostname) return true;
  const required: EmbedKind = MEDIA_PLATFORMS.has(platformId) ? "media" : "title";
  return probeEmbedUrl(fixed.toString(), required);
}
