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
  domains: {
    twitter: optional("TWITTER_FIX_DOMAIN", "fixupx.com"),
    bluesky: optional("BLUESKY_FIX_DOMAIN", "fxbsky.app"),
    // Instagram fixers get blocked and replaced often, so this is a list
    // tried in order. Mirrors the backends InstaEmbedRouter routes between.
    // n.zzinstagram.com is the variant that embeds description + username,
    // per InstaEmbedRouter's own docs; the rest are fallbacks.
    instagram: domainList(
      "INSTAGRAM_FIX_DOMAINS",
      "n.zzinstagram.com,eeinstagram.com,kkinstagram.com,uuinstagram.com,vxinstagram.com",
    ),
    tiktok: optional("TIKTOK_FIX_DOMAIN", "tfxktok.com"),
    // Empty string disables domain rewriting for YouTube.
    youtube: optional("YOUTUBE_FIX_DOMAIN", "koutube.com"),
  },
  stateTtlMs: positiveNumber("STATE_TTL_MINUTES", "1440") * 60 * 1000,
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
