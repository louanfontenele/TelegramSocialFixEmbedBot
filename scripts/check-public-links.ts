// Optional, read-only smoke check of public pages. Never runs as part of
// npm test; never calls a downloader API or sends Telegram messages.
import { mkdir, writeFile } from "node:fs/promises";
import { hasEmbedMetadata } from "../src/platforms/failover.js";
import { BROWSER_USER_AGENT, isHostWithin } from "../src/platforms/types.js";

const samples = [
  ["Bilibili video", "https://www.bilibili.com/video/BV1Xy4y1A7Ys", "https://bilibiliez.com/video/BV1Xy4y1A7Ys"],
  ["Bilibili multipart", "https://www.bilibili.com/video/BV1ms411Q7vw?p=4", "https://bilibiliez.com/video/BV1ms411Q7vw?p=4"],
  ["Bilibili dynamic", "https://t.bilibili.com/998134289197432852", "https://bilibiliez.com/opus/998134289197432852"],
  ["Imgur image", "https://imgur.com/TUf9TF8", "https://imgurez.com/TUf9TF8"],
  ["Imgur album", "https://imgur.com/a/xK77p", "https://imgurez.com/a/xK77p"],
  ["Imgur gallery", "https://imgur.com/gallery/imgur-album-links-xK77p", "https://imgurez.com/gallery/xK77p"],
  ["Imgur GIFV", "https://i.imgur.com/A61SaA1.gifv", "https://imgurez.com/A61SaA1"],
  ["iFunny picture", "https://ifunny.co/picture/camp-aga-dad-camprigh-3pECLibx9", "https://ifunnyez.co/picture/camp-aga-dad-camprigh-3pECLibx9"],
  ["iFunny video", "https://ifunny.co/video/GirTjZTaB", "https://ifunnyez.co/video/GirTjZTaB"],
  ["Pinterest image", "https://jp.pinterest.com/pin/133137732706533426/", "https://pinterestez.com/pin/133137732706533426/"],
  ["Pinterest video", "https://www.pinterest.com/pin/664281013778109217/", "https://pinterestez.com/pin/664281013778109217/"],
  ["Weibo post", "https://weibo.com/7827771738/N4xlMvjhI", "https://weiboez.com/7827771738/N4xlMvjhI"],
  ["Weibo mobile", "https://m.weibo.cn/status/4189191225395228", "https://weiboez.com/0/4189191225395228"],
  ["Weibo video", "https://video.weibo.com/show?fid=1034:4967272104787984", "https://weiboez.com/tv/show/1034:4967272104787984"],
  ["Snapchat Spotlight", "https://www.snapchat.com/@nasa/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYeG9xcGd0ZWd3AZ14BVv0AZ14BQkrAAAAAQ", "https://snapchatez.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYeG9xcGd0ZWd3AZ14BVv0AZ14BQkrAAAAAQ"],
  ["Newgrounds art", "https://www.newgrounds.com/art/view/dragonofaura/cat-front-view", "https://newgroundsez.com/art/view/dragonofaura/cat-front-view"],
  ["Newgrounds portal", "https://www.newgrounds.com/portal/view/310495", "https://newgroundsez.com/portal/view/310495"],
  ["TikTok video", "https://www.tiktok.com/@embedez/video/7474838594847378731", "https://tiktokez.com/@embedez/video/7474838594847378731"],
  ["Reddit text", "https://www.reddit.com/r/announcements/comments/3cucye/an_old_team_at_reddit/", "https://redditez.com/r/announcements/comments/3cucye/an_old_team_at_reddit/"],
] as const;

async function inspect(start: string, fixer: boolean) {
  const chain: { url: string; status: number; location?: string }[] = [];
  const startHost = new URL(start).hostname;
  // Only original platform hosts and the public manual mirror landing page.
  const platformRoots = ["bilibili.com", "imgur.com", "ifunny.co", "pinterest.com", "weibo.com", "weibo.cn", "snapchat.com", "newgrounds.com", "tiktok.com", "reddit.com"];
  const roots = fixer ? [startHost, "embedez.com"] : platformRoots.filter((host) => isHostWithin(startHost, [host]));
  let current = new URL(start);
  const deadline = AbortSignal.timeout(20_000);
  try {
    for (let hop = 0; hop <= 5; hop++) {
      if (!isHostWithin(current.hostname, roots) || !["http:", "https:"].includes(current.protocol) || current.username || current.password || current.port) {
        return { chain, stoppedAt: current.toString(), note: "Redirect outside allowed public hosts" };
      }
      if (fixer && current.hostname === "embedez.com" && current.pathname !== "/download") {
        return { chain, note: "Unexpected EmbedEZ route; not fetched" };
      }
      const response = await fetch(current, {
        redirect: "manual", signal: deadline,
        headers: { "User-Agent": fixer ? `TelegramBot (like TwitterBot) ${BROWSER_USER_AGENT}` : BROWSER_USER_AGENT },
      });
      const location = response.headers.get("location") ?? undefined;
      chain.push({ url: current.toString(), status: response.status, ...(location ? { location } : {}) });
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        current = new URL(location, current);
        continue;
      }
      const reader = response.body?.getReader();
      let html = "";
      const decoder = new TextDecoder();
      let bytes = 0;
      if (reader) try {
        while (bytes < 128 * 1024) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = value.subarray(0, 128 * 1024 - bytes);
          bytes += chunk.byteLength;
          html += decoder.decode(chunk, { stream: true });
          if (/<\/head>/i.test(html)) break;
        }
      } finally { await reader.cancel().catch(() => {}); }
      // Keep structural evidence and media tags, not copies of post text.
      const metadata = (html.match(/<meta\b[^>]*>/gi) ?? [])
        .filter((tag) => /(?:og:|twitter:)/i.test(tag) && !/(?:og|twitter):description/i.test(tag));
      return { chain, metadata, hasMediaMetadata: hasEmbedMetadata(metadata.join(""), "media"), bytesInspected: bytes };
    }
    return { chain, note: "Redirect limit reached" };
  } catch (error) {
    return { chain, error: error instanceof Error ? error.message : String(error) };
  }
}

const results = [];
// Small batches avoid hammering the public service.
for (let start = 0; start < samples.length; start += 3) {
  results.push(...await Promise.all(samples.slice(start, start + 3).map(async ([label, original, fixed]) => {
    const [source, mirror] = await Promise.all([inspect(original, false), inspect(fixed, true)]);
    console.log(`${label}: source ${source.chain.at(-1)?.status ?? "error"}; mirror ${mirror.chain.at(-1)?.status ?? "error"}; media tags ${"hasMediaMetadata" in mirror ? mirror.hasMediaMetadata : "unverified"}`);
    return { label, original, fixed, source, mirror };
  })));
}
await mkdir(new URL("../docs/", import.meta.url), { recursive: true });
await writeFile(new URL("../docs/public-link-check.json", import.meta.url), JSON.stringify({
  checkedAt: new Date().toISOString(),
  method: "Public HTTP pages only, desktop UA on sources, Telegram crawler UA on mirrors, 128 KiB head cap. No Telegram client validation or paid API calls.",
  results,
}, null, 2) + "\n");
