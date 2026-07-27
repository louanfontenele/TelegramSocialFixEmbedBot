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

1. Someone posts a message containing one or more supported links in a group.
2. For each link, the bot sends a separate reply crediting the sender with
   the fixed link (Telegram renders the embed automatically from the link's
   Open Graph tags). One message per link, since Telegram only renders a
   single link preview per message.
3. Inline buttons let anyone open the original link, and let the original
   sender or group admins refresh the embed or delete that reply.

Duplicate links in the same message are skipped, and replies go out in
batches (`BATCH_SIZE`, default 10) with a pause between them
(`BATCH_COOLDOWN_SECONDS`, default 5) so link-heavy messages don't trip
Telegram's flood limits.

## Message style

`MESSAGE_STYLE` picks how replies are formatted. The sender is always a
clickable mention, which works even for users without a `@username`.

`compact` (default):

```
📸 Instagram · enviado por Louan

https://ddinstagram.com/p/xyz
```

`structured`:

```
🔗 Link Corrigido
👤 Enviado por: Louan

📸 https://ddinstagram.com/p/xyz
```

`quote` — the same header inside a Telegram blockquote card, followed by
the link.

## Restricting access

By default the bot responds in any chat it's added to. To lock it down to
specific groups (recommended, so randoms can't add it and spam it), set in
`.env`:

- `RESTRICT_ACCESS=true`
- `ALLOWED_CHAT_IDS=` a comma-separated list of allowed chat ids
- `OWNER_USER_ID=` your Telegram user id, always allowed regardless of chat
  (handy for testing in a DM or another group)

When a chat isn't allowed, the bot returns immediately without doing any
link processing, and logs the chat id to the console so you can add it to
`ALLOWED_CHAT_IDS`.

With `AUTO_LEAVE_UNAUTHORIZED=true` (the default) the bot goes further: if
someone adds it to a group that isn't allowlisted, it posts a short notice
and leaves right away. Groups the *owner* adds it to are exempt, so you can
still set up a new group before allowlisting it.

To find a chat's id, send `/id` in it — the command only answers the
`OWNER_USER_ID`, and works in any chat, including ones not yet allowlisted.
The usual setup flow is: add the bot to your group, run `/id`, copy the id
into `ALLOWED_CHAT_IDS`, set `RESTRICT_ACCESS=true`, and restart.

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
  access.ts             # chat/user allowlist gate
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
