import { bluesky } from "./bluesky.js";
import { facebook } from "./facebook.js";
import { instagram } from "./instagram.js";
import { reddit } from "./reddit.js";
import { tiktok } from "./tiktok.js";
import type { Platform } from "./types.js";
import { twitter } from "./twitter.js";
import { youtube } from "./youtube.js";

export const platforms: Platform[] = [twitter, bluesky, instagram, tiktok, youtube, reddit, facebook];

export function findPlatform(url: URL): Platform | undefined {
  return platforms.find((platform) => platform.matches(url));
}
