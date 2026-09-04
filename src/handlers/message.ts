import type { Bot } from "grammy";
import type { Message } from "grammy/types";
import { setTimeout as sleep } from "node:timers/promises";
import { isAllowed, isOwner } from "../access.js";
import { config } from "../config.js";
import { findPlatform } from "../platforms/index.js";
import type { Platform, Resolved } from "../platforms/types.js";
import { verifyResolvedLink } from "../platforms/verify.js";
import {
  claimReplyNotification,
  createId,
  getMessageByBotMessage,
  releaseReplyNotification,
  saveMessage,
  type ResolvedLink,
} from "../store.js";
import {
  buildKeyboard,
  buildMessageText,
  buildReplyNotificationText,
  buildReplacementMessageText,
  buildValidationFailureText,
  replacementMessageLength,
  type Sender,
} from "../ui.js";

const URL_REGEX = /https?:\/\/\S+/g;
const TELEGRAM_MESSAGE_LIMIT = 4096;

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
  sourceRanges: SourceRange[];
}

interface SourceRange {
  start: number;
  end: number;
}

type ProcessedLink = (ResolvedLink & { sourceRanges: SourceRange[] }) | FailedLink;

async function resolveLinks(text: string): Promise<ProcessedLink[]> {
  const candidates = new Map<string, { url: URL; platform: Platform; sourceRanges: SourceRange[] }>();

  for (const match of text.matchAll(URL_REGEX)) {
    const rawMatch = match[0];
    const rawUrl = trimUrl(rawMatch);
    const sourceRange = { start: match.index, end: match.index + rawUrl.length };
    const existing = candidates.get(rawUrl);
    if (existing) {
      existing.sourceRanges.push(sourceRange);
      continue;
    }

    if (candidates.size >= config.batching.maxLinksPerMessage) break;

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      continue;
    }

    const platform = findPlatform(url);
    if (platform) candidates.set(rawUrl, { url, platform, sourceRanges: [sourceRange] });
  }

  // Resolving in parallel: several of these make network calls, and in
  // series a handful of links would add up to a visibly slow reply.
  const resolved = await Promise.all(
    [...candidates.values()].map(async ({ url, platform, sourceRanges }): Promise<ProcessedLink | null> => {
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
          sourceRanges,
        };
      }

      return {
        platformLabel: platform.label,
        platformEmoji: platform.emoji,
        originalUrl: result.original,
        fixedUrl: result.fixed,
        sourceRanges,
      };
    }),
  );

  // Two raw strings (http vs https, with vs without www) can resolve to
  // the exact same content - dedupe on the cleaned link so it isn't posted
  // twice.
  const unique = new Map<string, ProcessedLink>();
  for (const link of resolved) {
    if (!link) continue;
    const existing = unique.get(link.originalUrl);
    if (existing) {
      if ("failed" in existing && !("failed" in link)) {
        link.sourceRanges.push(...existing.sourceRanges);
        unique.set(link.originalUrl, link);
      } else {
        existing.sourceRanges.push(...link.sourceRanges);
      }
    } else {
      unique.set(link.originalUrl, link);
    }
  }
  return [...unique.values()];
}

/** Removes only URLs for which a verified replacement will be published. */
export function removeReplacedUrls(text: string, links: ProcessedLink[]): string {
  const ranges = links
    .filter((link): link is ResolvedLink & { sourceRanges: SourceRange[] } => !("failed" in link))
    .flatMap((link) => link.sourceRanges)
    .sort((a, b) => b.start - a.start);

  let cleaned = text;
  for (const range of ranges) cleaned = cleaned.slice(0, range.start) + cleaned.slice(range.end);

  return cleaned
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function canDeleteOriginal(bot: Bot, chatId: number, chatType: string): Promise<boolean> {
  if (chatType === "private") return true;
  try {
    const member = await bot.api.getChatMember(chatId, bot.botInfo.id);
    return member.status === "creator" ||
      (member.status === "administrator" && member.can_delete_messages === true);
  } catch {
    return false;
  }
}

function hasOriginalLinkButton(message: Message): boolean {
  return message.reply_markup?.inline_keyboard.some((row) =>
    row.some((button) => "url" in button && button.text.includes("Link Original")),
  ) === true;
}

/** Recovers the original author from the text mention embedded in a bot
 * replacement. This survives process restarts after the in-memory state is
 * gone, while the Original-link button prevents unrelated bot messages from
 * being interpreted as replacements. */
function senderMentionedByBotMessage(message: Message): Sender | undefined {
  if (!hasOriginalLinkButton(message)) return undefined;

  const text = "text" in message ? message.text : "caption" in message ? message.caption : undefined;
  const entities = "entities" in message
    ? message.entities
    : "caption_entities" in message
      ? message.caption_entities
      : undefined;
  if (!text || !entities) return undefined;

  for (const entity of entities) {
    const name = text.slice(entity.offset, entity.offset + entity.length);
    if (entity.type === "text_mention") {
      return { id: entity.user.id, name };
    }
    if (entity.type === "text_link") {
      const match = /^tg:\/\/user\?id=(\d+)$/.exec(entity.url);
      const id = match ? Number(match[1]) : Number.NaN;
      if (Number.isSafeInteger(id) && id > 0) return { id, name };
    }
  }
  return undefined;
}

interface ReplyRoute {
  originalSender: Sender;
  embedMessageId: number;
}

function originalSenderForReply(bot: Bot, chatId: number, message: Message): ReplyRoute | undefined {
  const replied = message.reply_to_message;
  if (!replied || replied.from?.id !== bot.botInfo.id) return undefined;

  const stored = getMessageByBotMessage(chatId, replied.message_id);
  const originalSender = stored
    ? { id: stored.senderId, name: stored.senderName }
    : senderMentionedByBotMessage(replied);
  return originalSender ? { originalSender, embedMessageId: replied.message_id } : undefined;
}

async function notifyOriginalSender(
  bot: Bot,
  chatId: number,
  replyToMessageId: number,
  route: ReplyRoute | undefined,
  replier: Sender,
): Promise<void> {
  if (!route || route.originalSender.id === replier.id) return;
  if (!claimReplyNotification(chatId, route.embedMessageId, replier.id)) return;
  try {
    await bot.api.sendMessage(chatId, buildReplyNotificationText(route.originalSender, replier.name), {
      parse_mode: "HTML",
      reply_parameters: { message_id: replyToMessageId },
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    releaseReplyNotification(chatId, route.embedMessageId, replier.id);
    console.error("Failed to notify the original sender about a reply:", error);
  }
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

    const sender: Sender = { id: ctx.from.id, name: ctx.from.first_name };
    if (!isAllowed(ctx.chat.id, sender.id)) {
      console.log(`Ignored message from disallowed chat ${ctx.chat.id} (user ${sender.id})`);
      return;
    }

    const replyRoute = originalSenderForReply(bot, ctx.chat.id, ctx.message);

    // A link posted as the caption of a photo/video/document arrives in
    // .caption, not .text - filtering on "message:text" alone silently
    // ignored every attachment with a link in its caption.
    const text = ctx.message.text ?? ctx.message.caption;
    if (!text) {
      await notifyOriginalSender(bot, ctx.chat.id, ctx.message.message_id, replyRoute, sender);
      return;
    }

    const links = await resolveLinks(text);
    if (links.length === 0) {
      await notifyOriginalSender(bot, ctx.chat.id, ctx.message.message_id, replyRoute, sender);
      return;
    }

    const validLinks = links.filter(
      (link): link is ResolvedLink & { sourceRanges: SourceRange[] } => !("failed" in link),
    );
    const quotedText = removeReplacedUrls(text, links);
    const linkCount = validLinks.length;
    const replacementFits = linkCount > 0 && validLinks.every((link, index) =>
      replacementMessageLength(sender, link, quotedText, { index: index + 1, total: linkCount }) <=
        TELEGRAM_MESSAGE_LIMIT,
    );
    const replaceOriginal = config.messageStyle === "replace" &&
      ctx.message.text !== undefined &&
      validLinks.length === links.length &&
      replacementFits &&
      await canDeleteOriginal(bot, ctx.chat.id, ctx.chat.type);

    // Telegram only renders one link preview per message, so each fixed link
    // gets its own reply. They go out in batches with a pause in between so a
    // link-heavy message doesn't trip Telegram's flood limits.
    const { size, cooldownMs } = config.batching;
    let allSent = true;
    let replacementsSent = 0;
    const pendingState: Array<{
      id: string;
      botMessageId: number;
      link: ResolvedLink;
      quotedText?: string;
      linkIndex?: number;
      linkCount?: number;
    }> = [];

    for (let start = 0; start < links.length; start += size) {
      if (start > 0) await sleep(cooldownMs);

      for (const link of links.slice(start, start + size)) {
        if ("failed" in link) {
          try {
            await ctx.reply(
              buildValidationFailureText(sender, link.platformLabel, link.platformEmoji, link.originalUrl),
              {
                parse_mode: "HTML",
                ...(replaceOriginal ? {} : { reply_parameters: { message_id: ctx.message.message_id } }),
                link_preview_options: { is_disabled: true },
              },
            );
          } catch (error) {
            allSent = false;
            console.error(`Failed to report invalid fixer for ${link.originalUrl}:`, error);
          }
          continue;
        }

        const id = createId();
        const linkIndex = validLinks.indexOf(link) + 1;
        const position = { index: linkIndex, total: linkCount };

        try {
          const sent = await ctx.reply(
            replaceOriginal
              ? buildReplacementMessageText(sender, link, quotedText, position)
              : buildMessageText(sender, link),
            {
            parse_mode: "HTML",
            ...(replaceOriginal ? {} : { reply_parameters: { message_id: ctx.message.message_id } }),
            reply_markup: buildKeyboard(id, link),
            link_preview_options: { url: link.fixedUrl },
            },
          );

          if (replaceOriginal) replacementsSent++;
          pendingState.push({
            id,
            botMessageId: sent.message_id,
            link,
            ...(replaceOriginal ? { quotedText, linkIndex, linkCount } : {}),
          });
        } catch (error) {
          allSent = false;
          // One bad link shouldn't cost the sender the rest of their links.
          console.error(`Failed to reply with ${link.fixedUrl}:`, error);
        }
      }
    }

    let originalDeleted = false;
    if (replaceOriginal && allSent && replacementsSent === linkCount) {
      try {
        await bot.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
        originalDeleted = true;
      } catch (error) {
        console.error("Failed to delete the original message after replacing it:", error);
      }
    }

    // If deletion lost a permission race, turn every replacement back into a
    // normal reply body so the still-visible source is not duplicated in full.
    if (replaceOriginal && !originalDeleted) {
      for (const quoted of pendingState.filter((entry) => entry.quotedText !== undefined)) {
        try {
          await bot.api.editMessageText(ctx.chat.id, quoted.botMessageId, buildMessageText(sender, quoted.link), {
            parse_mode: "HTML",
            reply_markup: buildKeyboard(quoted.id, quoted.link),
            link_preview_options: { url: quoted.link.fixedUrl },
          });
          delete quoted.quotedText;
          delete quoted.linkIndex;
          delete quoted.linkCount;
        } catch (error) {
          console.error("Failed to remove replacement quote after keeping the original message:", error);
        }
      }
    }

    for (const entry of pendingState) {
      saveMessage(entry.id, {
        chatId: ctx.chat.id,
        botMessageId: entry.botMessageId,
        senderId: sender.id,
        senderName: sender.name,
        link: entry.link,
        ...(entry.quotedText !== undefined ? { quotedText: entry.quotedText } : {}),
        ...(entry.linkIndex !== undefined ? { linkIndex: entry.linkIndex } : {}),
        ...(entry.linkCount !== undefined ? { linkCount: entry.linkCount } : {}),
      });
    }

    const notificationTarget = originalDeleted
      ? pendingState[0]?.botMessageId
      : ctx.message.message_id;
    if (notificationTarget !== undefined) {
      await notifyOriginalSender(bot, ctx.chat.id, notificationTarget, replyRoute, sender);
    }
  });
}
