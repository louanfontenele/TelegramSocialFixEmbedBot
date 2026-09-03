import { bluesky } from "./bluesky.js";
import { bilibili } from "./bilibili.js";
import { deviantart } from "./deviantart.js";
import { facebook } from "./facebook.js";
import { instagram } from "./instagram.js";
import { imgur } from "./imgur.js";
import { ifunny } from "./ifunny.js";
import { newgrounds } from "./newgrounds.js";
import { pinterest } from "./pinterest.js";
import { pixiv } from "./pixiv.js";
import { reddit } from "./reddit.js";
import { snapchat } from "./snapchat.js";
import { threads } from "./threads.js";
import { tiktok } from "./tiktok.js";
import { tumblr } from "./tumblr.js";
import type { Platform } from "./types.js";
import { twitch } from "./twitch.js";
import { twitter } from "./twitter.js";
import { youtube } from "./youtube.js";
import { weibo } from "./weibo.js";

export const platforms: Platform[] = [
  twitter,
  bluesky,
  instagram,
  tiktok,
  youtube,
  reddit,
  threads,
  twitch,
  tumblr,
  pixiv,
  deviantart,
  facebook,
  bilibili,
  imgur,
  ifunny,
  pinterest,
  weibo,
  snapchat,
  newgrounds,
];

export function findPlatform(url: URL): Platform | undefined {
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return undefined;
  return platforms.find((platform) => platform.matches(url));
}
