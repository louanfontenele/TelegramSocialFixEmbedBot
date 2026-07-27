# TelegramSocialFixEmbedBot

A Telegram bot that rewrites social media links so they embed properly
inside Telegram, instead of showing broken or tracker-filled previews.

Supported platforms:

| Platform  | Strategy                                                                  |
| --------- | -------------------------------------------------------------------------- |
| X/Twitter | Rewrites `x.com`/`twitter.com` status links to [FixupX/FxTwitter](https://github.com/FxEmbed/FxEmbed) |
| Bluesky   | Rewrites `bsky.app` post links to [FxBsky](https://github.com/FxEmbed/FxEmbed) |
| Instagram | Probes a list of [InstaEmbedRouter](https://github.com/Knoppiix/InstaEmbedRouter) backends and uses the first that serves an embed |
| TikTok    | Follows redirects, then rewrites to [tfxktok.com](https://tfxktok.com/) |
| YouTube   | Strips tracking params, rewrites to [koutube](https://github.com/iGerman00/koutube) |
| Reddit    | Probes a list of [fxreddit](https://github.com/MinnDevelopment/fxreddit) backends (rxddit.com and friends) and uses the first that serves an embed |
| Facebook  | Follows redirects and strips tracking params (no third-party embed fixer available) |

### Link forms recognized

| Platform  | Accepted hosts and paths |
| --------- | ------------------------ |
| X/Twitter | `x.com`, `twitter.com` (+ `www`/`m`/`mobile`) on `/status/` or `/statuses/`; `t.co` shortlinks, followed only as far as X's own domains |
| Bluesky   | `bsky.app` on `/post/` |
| Instagram | `instagram.com`, `instagr.am` on `/p/`, `/reel/`, `/reels/`, `/tv/`, with or without a leading username; `/share/` links are followed to their canonical post. Stories are left alone |
| TikTok    | Any `*.tiktok.com`, covering `vm.`, `vt.`, `m.` and `/t/` shortlinks, resolved to the canonical video |
| YouTube   | `youtube.com`, `youtu.be`, `youtube-nocookie.com` (+ `www`/`m`/`music`) on `/watch?v=`, `/shorts/`, `/live/`, `/embed/`. Channels, search and the home page are ignored |
| Reddit    | Any `*.reddit.com` (`old`, `new`, `np`, `amp`, `m`) on `/r/…/comments/…`, `/r/…/s/…`, `/u/…`, `/user/…` or `/comments/…`; `redd.it` shortlinks. Direct media hosts (`i.redd.it`, `v.redd.it`) are left alone since Telegram embeds those already |
| Facebook  | Any `*.facebook.com` (`m`, `web`, `mbasic`, …), `fb.watch`, `fb.me` |

All of the above use public hosted instances of these projects by default —
no self-hosting required. Domains are configurable via environment
variables (see `.env.example`) in case a public instance goes down.

Instagram and Reddit are the exceptions: their fixers get blocked and
replaced often (the long-standing `ddinstagram.com` stopped responding once
InstaFix was archived in April 2026), so `INSTAGRAM_FIX_DOMAINS` and
`REDDIT_FIX_DOMAINS` take a *list*. The preferred backend is probed against
the actual post being shared; if it doesn't serve Open Graph tags the rest
are raced concurrently, and the winner is remembered for 10 minutes.

## Security notes

- Redirects for TikTok and Facebook links are followed one hop at a time
  and each hop is validated: private, loopback and link-local addresses are
  refused, and the chain may not leave the platform's own domains. Without
  this, Facebook's `/l.php?u=` open redirect would let a posted link steer
  the bot into requesting internal services or a cloud metadata endpoint.
- Response bodies are discarded rather than buffered when only the final
  URL matters.
- Button clicks are authorized on click (Telegram has no per-user keyboard,
  so the buttons are visible to everyone) and the stored chat is checked
  against the clicking chat.

## How it works

1. Someone posts a message containing one or more supported links in a group.
2. For each link, the bot sends a separate reply crediting the sender with
   the fixed link (Telegram renders the embed automatically from the link's
   Open Graph tags). One message per link, since Telegram only renders a
   single link preview per message.
3. Inline buttons let anyone open the original link, and let the original
   sender or group admins refresh the embed or delete that reply.

The link a reply points to as "original" is always the canonical form:
mobile and legacy subdomains (`m.`, `mobile.`, `old.`, `music.`, …) are
stripped, and shortlinks (`t.co`, `vt.tiktok.com`, `fb.watch`, …) are
expanded to the real link they redirect to.

fixupx/FxTwitter and FxBsky (the same FxEmbed project) render a machine
translation next to the original text when `TRANSLATE_LINKS=true` (the
default) - see `TRANSLATE_LANGUAGE` in `.env.example`. Other fixers don't
support this.

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

Channels are never allowed, unconditionally - not gated by
`RESTRICT_ACCESS`, and with no owner exception. The bot posts a short
notice (if it can) and leaves immediately. It only ever fixes links in
regular groups and supergroups, topics included - a forum is still a
supergroup as far as Telegram's API is concerned.

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

**Required BotFather setting:** send `/setprivacy` to
[@BotFather](https://t.me/BotFather), pick this bot, and choose **Disable**.
With privacy mode enabled (the default) a bot only receives commands and
replies directed at it, so it would never see the links people post and
would appear to do nothing in groups.

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
    twitter.ts, bluesky.ts, instagram.ts, tiktok.ts,
    youtube.ts, reddit.ts, facebook.ts
    types.ts                # Platform interface, host helpers, SSRF-safe fetch
    failover.ts             # picks a live embed backend from a list
    index.ts                # platform registry
```

Each platform module is a small, independent adapter (`matches()` +
`resolve()`). Swapping which public instance a platform uses, or later
adding a self-hosted fallback, only touches that one file.

## License

[PolyForm Noncommercial License 1.0.0](./LICENSE) — free to use, modify,
and redistribute for any noncommercial purpose. Selling this software or
any modified version of it is not permitted.
