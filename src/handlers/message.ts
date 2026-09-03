import type { Bot } from "grammy";
import { setTimeout as sleep } from "node:timers/promises";
import { isAllowed, isOwner } from "../access.js";
import { config } from "../config.js";
import { findPlatform } from "../platforms/index.js";
import type { Platform, Resolved } from "../platforms/types.js";
import { verifyResolvedLink } from "../platforms/verify.js";
import { createId, saveMessage, type ResolvedLink } from "../store.js";
import { buildKeyboard, buildMessageText, buildValidationFailureText, type Sender } from "../ui.js";

const URL_REGEX = /https?:\/\/\S+/g;

// URLs at the end of a sentence often pick up trailing punctuation, and
// a URL inside parentheses picks up the closing one.
function trimUrl(raw: string): string {
  return raw.replace(/[.,;:!?)\]}'"]+$/, "");
}

interface FailedLink {
  failed: true;
  platformLabel: string;
  platformEmoji: string;
  originalUrl: string;
}

type ProcessedLink = ResolvedLink | FailedLink;

async function resolveLinks(text: string): Promise<ProcessedLink[]> {
  const seen = new Set<string>();
  const candidates: { url: URL; platform: Platform }[] = [];

  for (const match of text.match(URL_REGEX) ?? []) {
    const rawUrl = trimUrl(match);
    if (seen.has(rawUrl)) continue;
    seen.add(rawUrl);

    if (candidates.length >= config.batching.maxLinksPerMessage) break;

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      continue;
    }

    const platform = findPlatform(url);
    if (platform) candidates.push({ url, platform });
  }

  // Resolving in parallel: several of these make network calls, and in
  // series a handful of links would add up to a visibly slow reply.
  const resolved = await Promise.all(
    candidates.map(async ({ url, platform }): Promise<ProcessedLink | null> => {
      let result: Resolved | null;
      try {
        result = await platform.resolve(url);
      } catch (error) {
        console.error(`Failed to resolve ${platform.id} link:`, error);
        return null;
      }
      // Compared against what was actually pasted, not against .original:
      // once .original is itself cleaned (see the platform modules), a
      // link that only had tracking params stripped would otherwise have
      // .fixed === .original and get treated as a no-op.
      if (!result || result.fixed === url.toString()) return null;

      if (config.verifyLinksBeforeSend && !(await verifyResolvedLink(platform.id, result))) {
        console.warn(`Rejected unverified ${platform.id} fixer URL: ${result.fixed}`);
        return {
          failed: true,
          platformLabel: platform.label,
          platformEmoji: platform.emoji,
          originalUrl: result.original,
        };
      }

      return {
        platformLabel: platform.label,
        platformEmoji: platform.emoji,
        originalUrl: result.original,
        fixedUrl: result.fixed,
      };
    }),
  );

  // Two raw strings (http vs https, with vs without www) can resolve to
  // the exact same content - dedupe on the cleaned link so it isn't posted
  // twice.
  const seenOriginal = new Set<string>();
  return resolved.filter((link): link is ProcessedLink => {
    if (!link || seenOriginal.has(link.originalUrl)) return false;
    seenOriginal.add(link.originalUrl);
    return true;
  });
}

// Regular groups and supergroups (including topics). Private chats have
// a separate owner-only gate; channels remain excluded, even for the owner.
const GROUP_CHAT_TYPES = ["group", "supergroup"];

export function registerMessageHandler(bot: Bot): void {
  bot.on("message", async (ctx) => {
    // Without a real user there's nobody to credit or to authorize the
    // buttons against, so anonymous admins are left alone rather than
    // attributed to a placeholder id.
    if (!ctx.from || ctx.from.is_bot) return;

    // This gate is independent of RESTRICT_ACCESS and ALLOWED_CHAT_IDS:
    // neither an open bot nor an allowlisted private chat grants DM access.
    if (ctx.chat.type === "private") {
      if (!isOwner(ctx.from.id)) return;
    } else if (!GROUP_CHAT_TYPES.includes(ctx.chat.type)) {
      return;
    }

    // A link posted as the caption of a photo/video/document arrives in
    // .caption, not .text - filtering on "message:text" alone silently
    // ignored every attachment with a link in its caption.
    const text = ctx.message.text ?? ctx.message.caption;
    if (!text) return;

    const sender: Sender = { id: ctx.from.id, name: ctx.from.first_name };
    if (!isAllowed(ctx.chat.id, sender.id)) {
      console.log(`Ignored message from disallowed chat ${ctx.chat.id} (user ${sender.id})`);
      return;
    }

    const links = await resolveLinks(text);
    if (links.length === 0) return;

    // Telegram only renders one link preview per message, so each fixed link
    // gets its own reply. They go out in batches with a pause in between so a
    // link-heavy message doesn't trip Telegram's flood limits.
    const { size, cooldownMs } = config.batching;

    for (let start = 0; start < links.length; start += size) {
      if (start > 0) await sleep(cooldownMs);

      for (const link of links.slice(start, start + size)) {
        if ("failed" in link) {
          try {
            await ctx.reply(
              buildValidationFailureText(sender, link.platformLabel, link.platformEmoji, link.originalUrl),
              {
                parse_mode: "HTML",
                reply_parameters: { message_id: ctx.message.message_id },
                link_preview_options: { is_disabled: true },
              },
            );
          } catch (error) {
            console.error(`Failed to report invalid fixer for ${link.originalUrl}:`, error);
          }
          continue;
        }

        const id = createId();

        try {
          const sent = await ctx.reply(buildMessageText(sender, link), {
            parse_mode: "HTML",
            reply_parameters: { message_id: ctx.message.message_id },
            reply_markup: buildKeyboard(id, link),
            link_preview_options: { url: link.fixedUrl },
          });

          saveMessage(id, {
            chatId: ctx.chat.id,
            botMessageId: sent.message_id,
            senderId: sender.id,
            senderName: sender.name,
            link,
          });
        } catch (error) {
          // One bad link shouldn't cost the sender the rest of their links.
          console.error(`Failed to reply with ${link.fixedUrl}:`, error);
        }
      }
    }
  });
}
