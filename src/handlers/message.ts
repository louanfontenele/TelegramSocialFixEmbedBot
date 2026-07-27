import type { Bot } from "grammy";
import { isAllowed } from "../access.js";
import { config } from "../config.js";
import { findPlatform } from "../platforms/index.js";
import { createId, saveMessage, type ResolvedLink } from "../store.js";
import { buildKeyboard, buildMessageText, type Sender } from "../ui.js";

const URL_REGEX = /https?:\/\/\S+/g;

// URLs at the end of a sentence often pick up trailing punctuation, and
// a URL inside parentheses picks up the closing one.
function trimUrl(raw: string): string {
  return raw.replace(/[.,;:!?)\]}'"]+$/, "");
}

async function resolveLinks(text: string): Promise<ResolvedLink[]> {
  const rawUrls = text.match(URL_REGEX) ?? [];
  const results: ResolvedLink[] = [];
  const seen = new Set<string>();

  for (const match of rawUrls) {
    const rawUrl = trimUrl(match);
    if (seen.has(rawUrl)) continue;
    seen.add(rawUrl);

    if (results.length >= config.batching.maxLinksPerMessage) break;

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      continue;
    }

    const platform = findPlatform(url);
    if (!platform) continue;

    let fixedUrl: string | null;
    try {
      fixedUrl = await platform.resolve(url);
    } catch (error) {
      console.error(`Failed to resolve ${platform.id} link:`, error);
      continue;
    }
    if (!fixedUrl || fixedUrl === rawUrl) continue;

    results.push({
      platformLabel: platform.label,
      platformEmoji: platform.emoji,
      // The normalized form, not the raw match: it goes into a button URL,
      // and Telegram rejects the whole message if that URL is malformed.
      originalUrl: url.toString(),
      fixedUrl,
    });
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function registerMessageHandler(bot: Bot): void {
  bot.on("message:text", async (ctx) => {
    // Without a real user there's nobody to credit or to authorize the
    // buttons against, so anonymous admins and channel-posted messages
    // are left alone rather than attributed to a placeholder id.
    if (!ctx.from || ctx.from.is_bot) return;

    const sender: Sender = { id: ctx.from.id, name: ctx.from.first_name };
    if (!isAllowed(ctx.chat.id, sender.id)) {
      console.log(`Ignored message from disallowed chat ${ctx.chat.id} (user ${sender.id})`);
      return;
    }

    const links = await resolveLinks(ctx.message.text);
    if (links.length === 0) return;

    // Telegram only renders one link preview per message, so each fixed link
    // gets its own reply. They go out in batches with a pause in between so a
    // link-heavy message doesn't trip Telegram's flood limits.
    const { size, cooldownMs } = config.batching;

    for (let start = 0; start < links.length; start += size) {
      if (start > 0) await sleep(cooldownMs);

      for (const link of links.slice(start, start + size)) {
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
