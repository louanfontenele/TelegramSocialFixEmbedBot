# Manual embed integration: research and validation

Researched and checked on September 3, 2026. The bot now recognizes 19
platforms, including seven new manual adapters. Twitter/X and Bluesky
continue to use FxEmbed. No EmbedEZ account, subscription, API key, paid
bot or downloader API was used.

## Source decisions

- The current [manual conversion guide](https://embedez.com/how-to-use)
  publishes `bilibiliez.com`, `imgurez.com`, `ifunnyez.co`,
  `pinterestez.com`, `weiboez.com`, `snapchatez.com` and
  `newgroundsez.com`, plus the Reddit/TikTok alternatives. Its
  [coverage page](https://embedez.com/coverage) distinguishes manual
  domains from Dumpert's bot/download-only support and future platforms.
- The [Pinterest article](https://embedez.com/blog/pinterest-links-discord-image-embeds)
  says there is no manual workaround. That conflicts with the current
  guide. Actual requests to `pinterestez.com/pin/<id>/` returned pin
  metadata, so the guide and live behavior informed this implementation.
- The [Bilibili/Weibo article](https://embedez.com/blog/bilibili-weibo-embeds-discord-global-communities)
  identifies videos, dynamic posts, episodes, audio and mobile/video link
  variants. The [Bilibili domain guide](https://embedez.com/blog/fix-bilibili-embeds)
  documents the manual replacement.
- The [Imgur guide](https://embedez.com/blog/imgurez-better-imgur-embeds)
  documents its manual domain. The newer
  [iFunny/Imgur/Newgrounds article](https://embedez.com/blog/ifunny-imgur-newgrounds-embeds-discord)
  distinguishes albums from direct media and explicitly describes art,
  audio and portal routes for Newgrounds. The older coverage page mentions
  only Newgrounds art; the newer article supports the expanded routes.
- [iFunny's manual guide](https://embedez.com/blog/ifunnyez-better-ifunny-sharing)
  specifies **ifunnyez.co**, not `.com`. The
  [TikTok](https://embedez.com/blog/embed-tiktok-videos-discord-tiktokez) and
  [Reddit](https://embedez.com/blog/what-is-redditez-reddit-embed-preview)
  guides document their corresponding manual replacements.

URL forms were also cross-checked against maintained extractor source and
actual public pages, rather than inferred from domain names:
[Imgur](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/imgur.py),
[Pinterest](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/pinterest.py),
[Bilibili](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/bilibili.py),
[Weibo](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/weibo.py),
[Snapchat Spotlight](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/snapchat.py),
[Snapchat stories](https://github.com/imputnet/cobalt/blob/main/api/src/processing/services/snapchat.js),
[iFunny picture examples](https://github.com/yupiel/ifunny-embed) and
[Brazilian iFunny examples](https://github.com/e43b/Ifunny-Downloader).
These projects are research references, not dependencies of this bot.

## What the bot preserves and normalizes

| Platform | Behavior |
| --- | --- |
| Bilibili | Keeps BV/AV identity, `p` multipart selection and numeric `t`; expands `b23.tv`; maps numeric dynamic links to `/opus/<id>`; accepts episode/season and audio paths. Festival links extract their `bvid` instead of discarding it with tracking parameters. |
| Imgur | Keeps ID casing and the distinction between a single post, `/a/` album and `/gallery/` post. Handles descriptive slugs and topic/subreddit gallery links. Keeps valid album image anchors. Converts GIFV wrappers; leaves direct CDN images/GIFs/MP4s untouched. |
| iFunny | Handles picture, video, GIF and meme paths, including the `br.ifunny.co` frontend. Keeps the post slug/ID and removes tracking. |
| Pinterest | Resolves `pin.it`, including intermediate Pinterest shortener redirects; normalizes regional domains and SEO slugs to a numeric pin URL. Does not rewrite boards or profiles. |
| Weibo | Maps mobile status/detail IDs to the desktop `/0/<id>` route; keeps desktop post IDs and converts query-based video `fid` to `/tv/show/<fid>`. |
| Snapchat | Normalizes creator Spotlight URLs to `/spotlight/<id>`; accepts individual public story snaps and expands `/t/`/`t.snapchat.com` shortlinks. Ignores bare profiles and lenses. |
| Newgrounds | Recognizes art, audio and portal entry URLs separately. An interactive game or Flash file is not turned into a video by a domain swap. |
| Reddit | Adds RedditEZ to the requested fallback list. Converts `redd.it/<id>` to `/comments/<id>` and expands share tokens before choosing a mirror. |
| TikTok | Adds TikTokEZ as a fallback, retains the singular legacy override, supports videos and photo slideshows, and keeps live links native. Full post URLs no longer require a successful request to TikTok first. |

All new full-URL manual adapters are pure conversions: the bot does not
fetch the original post or call EmbedEZ during conversion. Shortlinks need
an HTTP redirect chain; each hop must remain on approved platform domains.
Usernames/passwords in URLs, nonstandard ports and off-platform redirects
are rejected. Expired shortlinks landing on home/profile pages are ignored.

The list-based probes for TikTok and Reddit recognize their documented
redirect to the public EmbedEZ `/download?q=<same-post>` page. The exception
is restricted to those known domains, HTTPS, that path and the original
post; it is not a general permission to follow arbitrary URLs or API routes.
The probe recognizes `og:video:url`, which the live pages use instead of
plain `og:video`, and does not accept empty tags or dimensions alone.

## Live HTTP findings

The initial check requested 19 original/mirror pairs. Targeted follow-ups
retried unresolved cases or checked alternate public posts. Complete
status/redirect chains and structural metadata are in
[public-link-check.json](public-link-check.json). Post descriptions are
excluded from the saved report.

| Sample | Observed result |
| --- | --- |
| Bilibili user example, multipart video, dynamic post and alternate video | Public mirror returned HTTP 200 after a redirect, but no embed metadata. The user's source example returned 412 to this client. URL conversion is tested; working media previews were not confirmed for these samples. |
| Imgur `/a/xK77p` and `/gallery/xK77p` | Each returned three `og:image` entries, confirming album/gallery handling beyond a single thumbnail. |
| Imgur GIFV `A61SaA1` | Mirror returned `og:video:url` and `video/mp4`. |
| Imgur standalone images `TUf9TF8` and `INqD4Ys` | No metadata from the sampled mirrors. One original page request also failed. No claim of a working single-image preview for these particular IDs. Direct `i.imgur.com` images remain untouched. |
| iFunny picture `3pECLibx9` | Image metadata returned. |
| iFunny video `GirTjZTaB` | Original returned 404 and mirror had no metadata. Alternate video `i2V9Zm2YB` returned video metadata. |
| Pinterest image and video pins | Image and `og:video:url` metadata respectively. |
| Weibo desktop post | Video metadata returned. |
| Weibo mobile status `4189191225395228` | First mirror request timed out; a targeted retry returned video metadata using `/0/<id>`. |
| Weibo TV `1034:4967272104787984` | Initial request timed out; retry returned HTTP 200 without metadata. Normalization is tested, but this sample's preview remains unconfirmed. |
| Snapchat NASA Spotlight | Video metadata returned. |
| Newgrounds art | Image metadata returned even though the source denied this client with HTTP 403. |
| Newgrounds portal `310495` | Image metadata returned. This does not establish inline video playback. |
| TikTok EmbedEZ example | Video metadata returned; the bot's actual probe selected `tiktokez.com` without a failure warning. |
| Reddit text post | Title metadata returned, appropriately without media; the actual probe selected `redditez.com` without a failure warning. |

These checks verify public HTTP responses, not Telegram's final renderer.
The service's metadata contains public media delivery URLs; those were
recorded as evidence, not fetched through an API. No test message was sent
to a real Telegram chat. The bot still sends one preview link per post,
not a media-group upload of every album image.

## Reproducing validation

```sh
npm test
npm run typecheck
npm run build
# Optional network check; refreshes the initial HTTP report:
npx tsx scripts/check-public-links.ts
```

The deterministic suite tests conversions, negative URL cases, meaningful
query/fragment preservation, shortlink failures and redirect boundaries,
backend overrides and priority/cache behavior, the `.env.example`
defaults, FxEmbed translation, and the real group message handler with
mocked Telegram API calls. Live availability is deliberately separate from
these repeatable tests.
