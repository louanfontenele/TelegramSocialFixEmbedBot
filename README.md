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
| Bilibili  | Rewrites videos and Opus posts to [BiliFix](https://vxbilibili.com/), which redirects human visitors back to the original post |
| Threads   | Probes [vxThreads](https://github.com/everettsouthwick/vxThreads)/[FixThreads](https://github.com/milanmdev/fixthreads) and uses the first that serves an embed |
| Twitch (clips) | Rewrites `clips.twitch.tv` links to [fxtwitch](https://github.com/seriaati/fxtwitch) |
| Tumblr    | Rewrites post links to [fxtumblr](https://github.com/knuxify/fxtumblr) |
| Pixiv     | Rewrites artwork links to [Phixiv](https://github.com/thelaao/phixiv) |
| DeviantArt | Rewrites deviation links to [fixdeviantart](https://github.com/Tschrock/fixdeviantart) |
| Facebook  | Follows redirects and strips tracking params; Reels/Watch additionally try [facebed](https://github.com/4pii4/facebed) |

### Link forms recognized

| Platform  | Accepted hosts and paths |
| --------- | ------------------------ |
| X/Twitter | `x.com`, `twitter.com` (+ `www`/`m`/`mobile`) on `/status/` or `/statuses/`; `t.co` shortlinks, followed only as far as X's own domains |
| Bluesky   | `bsky.app` on `/post/` |
| Instagram | `instagram.com`, `instagr.am` on `/p/`, `/reel/`, `/reels/`, `/tv/`, with or without a leading username; `/share/` links are followed to their canonical post. Stories are left alone |
| TikTok    | Any `*.tiktok.com`, covering `vm.`, `vt.`, `m.` and `/t/` shortlinks, resolved to the canonical video |
| YouTube   | `youtube.com`, `youtu.be`, `youtube-nocookie.com` (+ `www`/`m`/`music`) on `/watch?v=`, `/shorts/`, `/live/`, `/embed/`. Channels, search and the home page are ignored |
| Reddit    | Any `*.reddit.com` (`old`, `new`, `np`, `amp`, `m`) on `/r/…/comments/…`, `/r/…/s/…`, `/u/…`, `/user/…` or `/comments/…`; `redd.it` shortlinks. Direct media hosts (`i.redd.it`, `v.redd.it`) are left alone since Telegram embeds those already |
| Bilibili  | `bilibili.com/video/BV…`, `/video/av…`, `/bangumi/play/…`, `/opus/…`, `/read/cv…`, festival video shares, legacy `t.bilibili.com/…` posts, and `b23.tv` shortlinks |
| Threads   | `threads.net`/`threads.com` on `/@user/post/…` |
| Twitch    | `clips.twitch.tv/<slug>` only - channel and VOD pages aren't touched |
| Tumblr    | `tumblr.com/<blog>/<id>` or `<blog>.tumblr.com/<id>`, either form |
| Pixiv     | `pixiv.net` on `/artworks/…` (with or without a locale prefix like `/en/`) or the legacy `member_illust.php?illust_id=` form |
| DeviantArt | `deviantart.com` on `/<user>/art/…`; the legacy `/view/<id>` form is expanded to the canonical path first |
| Facebook  | Any `*.facebook.com` (`m`, `web`, `mbasic`, …), `fb.watch`, `fb.me` |

All of the above use public hosted instances of these projects by default —
no self-hosting required. Domains are configurable via environment
variables (see `.env.example`) in case a public instance goes down.

Instagram, Reddit, Bilibili, Threads, Twitch, Tumblr, Pixiv, DeviantArt and the
Facebook Reel fixer all take a *list* rather than a single domain: this
category of fixer gets blocked and replaced often (the long-standing
`ddinstagram.com` stopped responding once InstaFix was archived in April
2026). The preferred backend is probed against the actual post being
shared; if it doesn't serve Open Graph tags the rest are raced
concurrently, and the winner is remembered for 10 minutes.

Native DeviantArt and Pixiv links often already carry working
`og:title`/`og:image` on their own for plain single-image content - these
fixers earn their keep on galleries, mature-content gates, and animated
(ugoira) works, which weren't tested here. Twitch is the opposite case:
its own `og:video` points at an `<iframe>` (`text/html`), which Telegram
can't play inline, so a fixer is required for any embed at all, not just
an improved one.

### Considered but not implemented

**Kwai/Kuaishou** was tried and dropped: no third-party fixer exists for
it anywhere in the embed-fixer ecosystem. Its own pages do serve
`og:title`/`og:description`/`og:image`, so Telegram already shows a
title-and-thumbnail card; the actual video is only reachable from a script
blob, not an `og:video` tag, and nothing can make it play inline without
someone building and hosting a proxy for it.

**PTT** was left out as a Taiwanese-language platform with limited relevance
to this bot's audience. **FurAffinity, Iwara** were
left out as adult-content-oriented communities.

## Security notes

- Redirects for TikTok, Facebook, X (`t.co`), Instagram (`/share/`),
  DeviantArt (`/view/`), Bilibili (`b23.tv`) and Reddit share links are
  followed one hop at a time
  and each hop is validated: private, loopback and link-local addresses are
  refused, and the chain may not leave the platform's own domains. Without
  this, Facebook's `/l.php?u=` open redirect would let a posted link steer
  the bot into requesting internal services or a cloud metadata endpoint.
- Response bodies are discarded rather than buffered when only the final
  URL matters.
- Incoming URLs and redirect hops with credentials or nonstandard ports are
  rejected.
- Button clicks are authorized on click (Telegram has no per-user keyboard,
  so the buttons are visible to everyone) and the stored chat is checked
  against the clicking chat.

## How it works

1. Someone posts a message containing one or more supported links in a group.
2. Before replying, the bot requests each third-party fixer URL with
   Telegram's crawler identity and checks for non-empty Open Graph metadata.
   If validation fails, it sends a warning with only the original link.
3. For each validated link, the bot sends a separate reply crediting the
   sender. One message per link, since Telegram only renders a single link
   preview per message.
4. Inline buttons let anyone open the original link, and let the original
   sender or group admins refresh the embed or delete that reply.

Set `VERIFY_LINKS_BEFORE_SEND=false` to disable this preflight check. A
successful check proves that the service responded with preview metadata at
that moment; Telegram may still reuse an older cached preview.

The link a reply points to as "original" is always the canonical form:
mobile and legacy subdomains (`m.`, `mobile.`, `old.`, `music.`, …) are
stripped, and shortlinks (`t.co`, `vt.tiktok.com`, `fb.watch`, …) are
expanded to the real link they redirect to.

fixupx/FxTwitter and FxBsky (the same FxEmbed project) render a machine
translation next to the original text when `TRANSLATE_LINKS=true` (the
default) - see `TRANSLATE_LANGUAGE` in `.env.example`. This bot applies
that setting only to Twitter and Bluesky.

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

https://eeinstagram.com/p/xyz
```

`structured`:

```
🔗 Link Corrigido
👤 Enviado por: Louan

📸 https://eeinstagram.com/p/xyz
```

`quote` — the same header inside a Telegram blockquote card, followed by
the link.

## Restricting access

By default the bot responds in any group it's added to. To lock it down to
specific groups (recommended, so randoms can't add it and spam it), set in
`.env`:

- `RESTRICT_ACCESS=true`
- `ALLOWED_CHAT_IDS=` a comma-separated list of allowed chat ids
- `OWNER_USER_ID=` your Telegram user id, always allowed regardless of chat
  restrictions in groups and the only user allowed to send links in DMs

Private chats are **owner-only**, independently of `RESTRICT_ACCESS` and
`ALLOWED_CHAT_IDS`. Set `OWNER_USER_ID` to your numeric Telegram user ID,
restart the bot, and send it a supported link privately. Text messages and
attachment captions use the same link processing, Original, Refresh and
Delete buttons as groups. Other users get no private replies; if
`OWNER_USER_ID` is unset, private link processing is disabled for everyone.
This is a link-fixing bot; text without supported links is ignored.

When a chat isn't allowed, the bot returns immediately without doing any
link processing, and logs the chat id to the console so you can add it to
`ALLOWED_CHAT_IDS`.

With `AUTO_LEAVE_UNAUTHORIZED=true` (the default) the bot goes further: if
someone adds it to a group that isn't allowlisted, it posts a short notice
and leaves right away. Groups the *owner* adds it to are exempt, so you can
still set up a new group before allowlisting it.

Channels are never allowed, unconditionally - not gated by
`RESTRICT_ACCESS`, and with no owner exception. The bot posts a short
notice (if it can) and leaves immediately. Besides the owner's private
chat, it fixes links in regular groups and supergroups, topics included -
a forum is still a supergroup as far as Telegram's API is concerned.

To find a chat's id, send `/id` in it — the command only answers the
`OWNER_USER_ID`, and works in any chat, including ones not yet allowlisted.
The usual setup flow is: add the bot to your group, run `/id`, copy the id
into `ALLOWED_CHAT_IDS`, set `RESTRICT_ACCESS=true`, and restart.

## Refreshing links and Telegram preview caching

The Refresh button reprocesses the original URL and edits the bot's reply.
It can choose a different working backend, but it does not invalidate
Telegram's preview cache. An unchanged link is reported as unchanged,
not as proof that Telegram fetched fresh metadata.

The documented
[Bot API link-preview options](https://core.telegram.org/bots/api#linkpreviewoptions)
select the URL and presentation, with no force-refresh/cache-purge option.
The separate MTProto method
[`messages.getWebPagePreview`](https://core.telegram.org/method/messages.getWebPagePreview)
is user-only and does not document a force-refresh option either. It is
not available through this bot's Bot API token.

For a stale preview, the owner can manually submit the fixed URL shown in
the reply to [@WebpageBot](https://t.me/WebpageBot) and use its update
controls. Telegram's
[bot FAQ](https://core.telegram.org/bots/faq#why-doesn-39t-my-bot-see-messages-from-other-bots)
documents that bots do not receive messages from other bots, so this is
not automated here. Fetching the source from this server only checks the
source; it does not clear Telegram's cache.

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
    twitter.ts, bluesky.ts, instagram.ts, tiktok.ts, youtube.ts,
    reddit.ts, threads.ts, twitch.ts, tumblr.ts, pixiv.ts,
    deviantart.ts, facebook.ts, bilibili.ts
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
