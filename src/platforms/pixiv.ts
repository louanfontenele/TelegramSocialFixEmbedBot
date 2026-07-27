import { config } from "../config.js";
import { pickLiveDomain } from "./failover.js";
import { bareHost, canonicalize, type Platform } from "./types.js";

// Covers the current /artworks/:id path (with an optional locale prefix
// like /en/artworks/:id) and the legacy member_illust.php?illust_id= form.
const ARTWORK_PATH = /^\/(?:[a-z]{2}\/)?artworks\/\d+/;

export const pixiv: Platform = {
  id: "pixiv",
  label: "Pixiv",
  emoji: "🖌️",

  matches(url) {
    if (bareHost(url) !== "pixiv.net") return false;
    return ARTWORK_PATH.test(url.pathname) || url.searchParams.has("illust_id");
  },

  async resolve(url) {
    const original = canonicalize(url);

    const domain = await pickLiveDomain("pixiv", config.domains.pixiv, original.pathname + original.search);
    if (!domain) return null;

    const fixed = new URL(original.toString());
    fixed.hostname = domain;
    fixed.hash = "";

    return { original: original.toString(), fixed: fixed.toString() };
  },
};
