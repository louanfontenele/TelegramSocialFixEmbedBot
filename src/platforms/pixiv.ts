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
    const base = canonicalize(url);
    base.hash = "";

    // The modern /artworks/:id path is self-contained and never needs a
    // query; the legacy form's illust_id *is* the identifier, so it's kept
    // and everything else (tracking or otherwise) is dropped.
    if (ARTWORK_PATH.test(base.pathname)) {
      base.search = "";
    } else {
      const illustId = base.searchParams.get("illust_id");
      base.search = illustId ? `illust_id=${illustId}` : "";
    }

    const original = base.toString();

    const domain = await pickLiveDomain("pixiv", config.domains.pixiv, base.pathname + base.search);
    if (!domain) return null;

    const fixed = new URL(base.toString());
    fixed.hostname = domain;

    return { original, fixed: fixed.toString() };
  },
};
