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
    instagram: optional("INSTAGRAM_FIX_DOMAIN", "ddinstagram.com"),
    tiktok: optional("TIKTOK_FIX_DOMAIN", "tfxktok.com"),
    // Empty string disables domain rewriting for YouTube.
    youtube: optional("YOUTUBE_FIX_DOMAIN", "koutube.com"),
  },
  stateTtlMs: Number(optional("STATE_TTL_MINUTES", "1440")) * 60 * 1000,
  access: {
    restrict: optional("RESTRICT_ACCESS", "false") === "true",
    allowedChatIds: optional("ALLOWED_CHAT_IDS", "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map(Number),
    ownerId: process.env.OWNER_USER_ID ? Number(process.env.OWNER_USER_ID) : undefined,
    // When restricted, leave any group the bot is added to that isn't allowlisted.
    autoLeave: optional("AUTO_LEAVE_UNAUTHORIZED", "true") === "true",
  },
  batching: {
    // Links are replied to in batches, pausing between them so a message
    // full of links doesn't hit Telegram's flood limits.
    size: Number(optional("BATCH_SIZE", "10")),
    cooldownMs: Number(optional("BATCH_COOLDOWN_SECONDS", "5")) * 1000,
    // Safety cap so one message can't tie up the bot indefinitely.
    maxLinksPerMessage: Number(optional("MAX_LINKS_PER_MESSAGE", "50")),
  },
};
