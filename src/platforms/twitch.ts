import { config } from "../config.js";
import { pickLiveDomain } from "./failover.js";
import { bareHost, canonicalize, type Platform } from "./types.js";

const CLIP_PATH = /^\/[A-Za-z0-9_-]+/;

/**
 * Twitch clip links -> fxtwitch. Twitch's own og:video points at an
 * `<iframe>` (og:video:type is text/html), not a direct video file, which
 * is why most link-preview consumers - Telegram included - only ever show
 * the static thumbnail instead of a playable clip.
 */
export const twitch: Platform = {
  id: "twitch",
  label: "Twitch",
  emoji: "🎮",

  matches(url) {
    return bareHost(url) === "clips.twitch.tv" && CLIP_PATH.test(url.pathname);
  },

  async resolve(url) {
    const base = canonicalize(url);
    base.search = "";
    base.hash = "";
    const original = base.toString();

    const domain = await pickLiveDomain("twitch", config.domains.twitch, base.pathname);
    if (!domain) return null;

    const fixed = new URL(base.toString());
    fixed.hostname = domain;

    return { original, fixed: fixed.toString() };
  },
};
