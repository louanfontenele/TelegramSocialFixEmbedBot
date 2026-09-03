import { config } from "../config.js";
import { rewriteManualLink } from "./manual.js";
import { bareHost, type Platform } from "./types.js";

const POST_PATH = /^\/(?:picture|video|gif|meme)\/[A-Za-z0-9_-]+\/?$/;

export const ifunny: Platform = {
  id: "ifunny",
  label: "iFunny",
  emoji: "😄",
  matches: (url) => ["ifunny.co", "br.ifunny.co"].includes(bareHost(url)) && POST_PATH.test(url.pathname),
  async resolve(url) {
    if (!ifunny.matches(url)) return null;
    const original = new URL(`https://ifunny.co${url.pathname.replace(/\/$/, "")}`);
    return rewriteManualLink(original, config.domains.ifunny);
  },
};
