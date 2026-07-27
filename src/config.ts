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

export const config = {
  botToken: required("BOT_TOKEN"),
  domains: {
    twitter: optional("TWITTER_FIX_DOMAIN", "fixupx.com"),
    bluesky: optional("BLUESKY_FIX_DOMAIN", "fxbsky.app"),
    instagram: optional("INSTAGRAM_FIX_DOMAIN", "ddinstagram.com"),
    tiktok: optional("TIKTOK_FIX_DOMAIN", "tfxktok.com"),
    // Empty string disables domain rewriting for YouTube.
    youtube: optional("YOUTUBE_FIX_DOMAIN", "koutube.com"),
  },
  stateTtlMs: Number(optional("STATE_TTL_MINUTES", "1440")) * 60 * 1000,
};
