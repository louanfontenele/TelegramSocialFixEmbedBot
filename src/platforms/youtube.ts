import { config } from "../config.js";
import type { Platform } from "./types.js";

const TRACKING_PARAMS = ["si", "feature", "pp", "ab_channel"];

function bareHost(url: URL): string {
  return url.hostname
    .toLowerCase()
    .replace(/^(www|m|music)\./, "")
    // The privacy-preserving embed host serves the same paths.
    .replace(/^youtube-nocookie\.com$/, "youtube.com");
}

// YouTube links -> strip tracking params, then rewrite to koutube.com
// (https://github.com/iGerman00/koutube), which mirrors youtube.com's
// /watch?v= and /shorts/ path structure on its own domain.
export const youtube: Platform = {
  id: "youtube",
  label: "YouTube",
  emoji: "▶️",

  matches(url) {
    const host = bareHost(url);

    // A youtu.be link is always a video; on youtube.com only these paths
    // are. Search results, channels and the home page have nothing to
    // embed, and rewriting them would just point at a 404.
    if (host === "youtu.be") return url.pathname.length > 1;
    if (host !== "youtube.com") return false;
    return (
      (url.pathname === "/watch" && url.searchParams.has("v")) ||
      /^\/(shorts|live|embed)\/[^/]+/.test(url.pathname)
    );
  },

  async resolve(url) {
    // m./music. and the nocookie host are all the same content under a
    // different front door - the "original link" button should point at
    // the plain youtube.com/youtu.be page, not the mobile or embed variant.
    const original = new URL(url.toString());
    original.hostname = bareHost(url);

    const fixed = new URL(original.toString());

    // youtu.be/<id> has no /watch path, just the video id - normalize it.
    if (bareHost(fixed) === "youtu.be") {
      const videoId = fixed.pathname.slice(1);
      fixed.pathname = "/watch";
      fixed.search = "";
      fixed.searchParams.set("v", videoId);
    } else {
      for (const param of TRACKING_PARAMS) {
        fixed.searchParams.delete(param);
      }
    }
    fixed.hash = "";

    if (config.domains.youtube) {
      fixed.hostname = config.domains.youtube;
    }

    return { original: original.toString(), fixed: fixed.toString() };
  },
};
