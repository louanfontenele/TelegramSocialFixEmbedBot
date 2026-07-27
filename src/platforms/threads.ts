import { config } from "../config.js";
import { pickLiveDomain } from "./failover.js";
import { bareHost, canonicalize, type Platform } from "./types.js";

const POST_PATH = /^\/@[^/]+\/post\/[A-Za-z0-9_-]+/;

// Threads posts -> whichever vxThreads/FixThreads-compatible backend
// currently serves an embed for that post. Meta's own threads.net/.com
// links don't unfurl reliably for bots.
export const threads: Platform = {
  id: "threads",
  label: "Threads",
  emoji: "🧵",

  matches(url) {
    const host = bareHost(url);
    return (host === "threads.net" || host === "threads.com") && POST_PATH.test(url.pathname);
  },

  async resolve(url) {
    const base = canonicalize(url);
    base.search = "";
    base.hash = "";
    const original = base.toString();

    const domain = await pickLiveDomain("threads", config.domains.threads, base.pathname, "title");
    if (!domain) return null;

    const fixed = new URL(base.toString());
    fixed.hostname = domain;

    return { original, fixed: fixed.toString() };
  },
};
