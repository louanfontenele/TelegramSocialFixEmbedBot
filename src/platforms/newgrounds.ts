import { config } from "../config.js";
import { rewriteManualLink } from "./manual.js";
import { bareHost, type Platform } from "./types.js";

// Art, audio and portal content use distinct routes. A Flash/HTML5 game
// does not become a playable video just because its link is rewritten.
const CONTENT_PATH = /^\/(?:art\/view\/[^/]+\/[^/]+|audio\/listen\/\d+|portal\/view\/\d+)\/?$/;

export const newgrounds: Platform = {
  id: "newgrounds",
  label: "Newgrounds",
  emoji: "🎨",
  matches: (url) => bareHost(url) === "newgrounds.com" && CONTENT_PATH.test(url.pathname),
  async resolve(url) {
    if (!newgrounds.matches(url)) return null;
    const original = new URL(`https://newgrounds.com${url.pathname.replace(/\/$/, "")}`);
    return rewriteManualLink(original, config.domains.newgrounds);
  },
};
