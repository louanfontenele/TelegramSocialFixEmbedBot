import { config } from "../config.js";
import type { Platform } from "./types.js";

const TRACKING_PARAMS = ["si", "feature", "pp", "ab_channel"];

// YouTube links -> strip tracking params, then rewrite to koutube.com
// (https://github.com/iGerman00/koutube), which mirrors youtube.com's
// /watch?v= and /shorts/ path structure on its own domain.
export const youtube: Platform = {
  id: "youtube",
  label: "YouTube",
  emoji: "▶️",

  matches(url) {
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
    return host === "youtube.com" || host === "youtu.be";
  },

  async resolve(url) {
    const fixed = new URL(url.toString());
    const host = fixed.hostname.replace(/^www\./, "").replace(/^m\./, "");

    // youtu.be/<id> has no /watch path, just the video id - normalize it.
    if (host === "youtu.be") {
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

    return fixed.toString();
  },
};
