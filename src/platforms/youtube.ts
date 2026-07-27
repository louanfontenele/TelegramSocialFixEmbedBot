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
    // different front door - the button should point at the plain
    // youtube.com/youtu.be page, not the mobile or embed variant.
    const base = new URL(url.toString());
    base.hostname = bareHost(url);
    base.hash = "";

    // youtu.be/<id> has no /watch path, just the video id - normalize it
    // to /watch?v= on both the original and the fixed link, so the button
    // isn't left pointing at a bare, tracker-carrying shortlink.
    if (bareHost(base) === "youtu.be") {
      const videoId = base.pathname.slice(1);
      base.hostname = "youtube.com";
      base.pathname = "/watch";
      base.search = "";
      base.searchParams.set("v", videoId);
    } else {
      for (const param of TRACKING_PARAMS) {
        base.searchParams.delete(param);
      }
    }

    const original = base.toString();

    const fixed = new URL(base.toString());
    if (config.domains.youtube) {
      fixed.hostname = config.domains.youtube;
    }

    return { original, fixed: fixed.toString() };
  },
};
