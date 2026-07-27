# TelegramSocialFixEmbedBot

A Telegram bot that rewrites social media links so they embed properly
inside Telegram, instead of showing broken or tracker-filled previews.

Supported platforms:

| Platform  | Strategy                                                                  |
| --------- | -------------------------------------------------------------------------- |
| X/Twitter | Rewrites `x.com`/`twitter.com` status links to [FixupX/FxTwitter](https://github.com/FxEmbed/FxEmbed) |
| Bluesky   | Rewrites `bsky.app` post links to [FxBsky](https://github.com/FxEmbed/FxEmbed) |
| Instagram | Rewrites post/reel/tv links to an [InstaFix](https://github.com/Wikidepia/InstaFix)-compatible domain |
| TikTok    | Follows redirects, then rewrites to [tfxktok.com](https://tfxktok.com/) |
| YouTube   | Strips tracking params, rewrites to [koutube](https://github.com/iGerman00/koutube) |
| Facebook  | Follows redirects and strips tracking params (no third-party embed fixer available) |

All of the above use public hosted instances of these projects by default —
no self-hosting required. Domains are configurable via environment
variables (see `.env.example`) in case a public instance goes down.

## How it works

1. Someone posts a message containing a supported link in a group.
2. The bot replies with the fixed link(s) (Telegram renders the embed
   automatically from the link's Open Graph tags) and credits the sender.
3. Inline buttons let anyone open the original link, and let the original
   sender or group admins refresh the embed or delete the bot's reply.

## Setup

```bash
npm install
cp .env.example .env   # fill in BOT_TOKEN from @BotFather
npm run dev
```

## Production

```bash
npm run build
npm start
```

Or with Docker:

```bash
docker compose up -d --build
```

## Project structure

```
src/
  bot.ts               # wires up the grammY bot instance
  index.ts              # entrypoint
  config.ts             # environment variables
  store.ts              # in-memory state for button callbacks (TTL-based)
  ui.ts                  # message text / inline keyboard builders
  handlers/
    message.ts            # detects links, replies with the fix
    callbacks.ts           # handles refresh/delete button clicks
  platforms/
    twitter.ts, bluesky.ts, instagram.ts, tiktok.ts, youtube.ts, facebook.ts
    index.ts                # platform registry
```

Each platform module is a small, independent adapter (`matches()` +
`resolve()`). Swapping which public instance a platform uses, or later
adding a self-hosted fallback, only touches that one file.

## License

[PolyForm Noncommercial License 1.0.0](./LICENSE) — free to use, modify,
and redistribute for any noncommercial purpose. Selling this software or
any modified version of it is not permitted.
