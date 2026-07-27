import { bluesky } from "./bluesky.js";
import { deviantart } from "./deviantart.js";
import { facebook } from "./facebook.js";
import { instagram } from "./instagram.js";
import { pixiv } from "./pixiv.js";
import { reddit } from "./reddit.js";
import { threads } from "./threads.js";
import { tiktok } from "./tiktok.js";
import { tumblr } from "./tumblr.js";
import type { Platform } from "./types.js";
import { twitch } from "./twitch.js";
import { twitter } from "./twitter.js";
import { youtube } from "./youtube.js";

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
];

export function findPlatform(url: URL): Platform | undefined {
  return platforms.find((platform) => platform.matches(url));
}
