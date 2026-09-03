function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

const TRUE_VALUES = ["true", "1", "yes", "on"];
const FALSE_VALUES = ["false", "0", "no", "off"];

/**
 * Accepts the spellings people actually write in a .env file, and rejects
 * anything else rather than quietly treating it as false - a mistyped flag
 * that silently disables a feature is hard to notice.
 */
function boolean(name: string, fallback: boolean): boolean {
  const raw = optional(name, String(fallback)).trim().toLowerCase();
  if (TRUE_VALUES.includes(raw)) return true;
  if (FALSE_VALUES.includes(raw)) return false;
  throw new Error(`Invalid ${name}="${raw}". Expected true or false.`);
}

/**
 * Fails fast on a non-numeric value: silently falling back to NaN makes the
 * bot misbehave in ways that are hard to trace back to a typo in .env.
 */
function positiveNumber(name: string, fallback: string): number {
  const raw = optional(name, fallback);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}="${raw}". Expected a positive number.`);
  }
  return value;
}

function idList(name: string): number[] {
  return optional(name, "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const id = Number(entry);
      if (!Number.isInteger(id)) {
        throw new Error(`Invalid entry "${entry}" in ${name}. Expected a numeric chat id.`);
      }
      return id;
    });
}

function domainList(name: string, fallback: string): string[] {
  return optional(name, fallback)
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

function optionalId(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const id = Number(raw);
  if (!Number.isInteger(id)) {
    throw new Error(`Invalid ${name}="${raw}". Expected a numeric user id.`);
  }
  return id;
}

const LANGUAGE_CODE = /^[a-z]{2}$/;

function languageCode(name: string, fallback: string): string {
  const raw = optional(name, fallback).toLowerCase();
  if (!LANGUAGE_CODE.test(raw)) {
    throw new Error(`Invalid ${name}="${raw}". Expected a two-letter ISO 639-1 code, e.g. "pt".`);
  }
  return raw;
}

export type MessageStyle = "compact" | "structured" | "quote";

const MESSAGE_STYLES: MessageStyle[] = ["compact", "structured", "quote"];

function messageStyle(): MessageStyle {
  const value = optional("MESSAGE_STYLE", "compact") as MessageStyle;
  if (!MESSAGE_STYLES.includes(value)) {
    throw new Error(`Invalid MESSAGE_STYLE "${value}". Expected one of: ${MESSAGE_STYLES.join(", ")}`);
  }
  return value;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  messageStyle: messageStyle(),
  verifyLinksBeforeSend: boolean("VERIFY_LINKS_BEFORE_SEND", true),
  domains: {
    twitter: optional("TWITTER_FIX_DOMAIN", "fixupx.com"),
    bluesky: optional("BLUESKY_FIX_DOMAIN", "fxbsky.app"),
    // Instagram fixers get blocked and replaced often, so this is a list
    // preferred first, then fallbacks. Keep this in sync with .env.example.
    instagram: domainList(
      "INSTAGRAM_FIX_DOMAINS",
      "eeinstagram.com,kkinstagram.com,n.zzinstagram.com,toinstagram.com,fxig.seria.moe",
    ),
    tiktok: optional("TIKTOK_FIX_DOMAIN", "tfxktok.com"),
    // rxddit.com is fxreddit's own instance and is preferred, but it has
    // been intermittently unable to reach Reddit; the rest are fallbacks.
    reddit: domainList("REDDIT_FIX_DOMAINS", "rxddit.com,vxreddit.com,redditfix.com"),
    // BiliFix serves rich metadata to Telegram and redirects people who click
    // the fixed link back to the original Bilibili page.
    bilibili: domainList("BILIBILI_FIX_DOMAINS", "vxbilibili.com"),
    // Empty string disables domain rewriting for YouTube.
    youtube: optional("YOUTUBE_FIX_DOMAIN", "koutube.com"),
    // vxThreads and FixThreads are separate projects; either can be down
    // independently of the other.
    threads: domainList("THREADS_FIX_DOMAINS", "vxthreads.net,fixthreads.net"),
    // fxfb.seria.moe's own maintainer calls it unreliable and recommends
    // facebed; kept as a second attempt rather than dropped, since a probe
    // that fails just costs one extra request. Empty disables reel/watch
    // fixing entirely, falling back to the tracking-cleaned Facebook link.
    facebookReel: domainList("FACEBOOK_REEL_FIX_DOMAINS", "facebed.com,fxfb.seria.moe"),
    twitch: domainList("TWITCH_FIX_DOMAINS", "fxtwitch.seria.moe"),
    // fx.dissonant.dev has gone dark; kept as a second attempt in case it
    // comes back, since a failed probe just costs one extra request.
    tumblr: domainList("TUMBLR_FIX_DOMAINS", "tpmblr.com,fx.dissonant.dev"),
    // Phixiv publishes two equivalent domains.
    pixiv: domainList("PIXIV_FIX_DOMAINS", "phixiv.net,ppxiv.net"),
    deviantart: domainList("DEVIANTART_FIX_DOMAINS", "fixdeviantart.com"),
  },
  stateTtlMs: positiveNumber("STATE_TTL_MINUTES", "1440") * 60 * 1000,
  // fxtwitter/fixupx and fxbsky are both FxEmbed under the hood and support
  // appending /<lang> to show a machine translation alongside the original.
  // This option is intentionally limited to Twitter and Bluesky.
  translate: {
    enabled: boolean("TRANSLATE_LINKS", true),
    language: languageCode("TRANSLATE_LANGUAGE", "pt"),
  },
  // The "Original" button is always present; these two are optional.
  buttons: {
    refresh: boolean("SHOW_REFRESH_BUTTON", true),
    delete: boolean("SHOW_DELETE_BUTTON", true),
  },
  access: {
    restrict: boolean("RESTRICT_ACCESS", false),
    allowedChatIds: idList("ALLOWED_CHAT_IDS"),
    ownerId: optionalId("OWNER_USER_ID"),
    // When restricted, leave any group the bot is added to that isn't allowlisted.
    autoLeave: boolean("AUTO_LEAVE_UNAUTHORIZED", true),
  },
  batching: {
    // Links are replied to in batches, pausing between them so a message
    // full of links doesn't hit Telegram's flood limits.
    size: positiveNumber("BATCH_SIZE", "10"),
    cooldownMs: positiveNumber("BATCH_COOLDOWN_SECONDS", "5") * 1000,
    // Safety cap so one message can't tie up the bot indefinitely.
    maxLinksPerMessage: positiveNumber("MAX_LINKS_PER_MESSAGE", "50"),
  },
};
