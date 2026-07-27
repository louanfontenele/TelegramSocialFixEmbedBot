import type { Bot } from "grammy";
import { findPlatform } from "../platforms/index.js";
import { createId, saveMessage, type ResolvedLink } from "../store.js";
import { buildKeyboard, buildMessageText } from "../ui.js";

const URL_REGEX = /https?:\/\/\S+/g;

async function resolveLinks(text: string): Promise<ResolvedLink[]> {
  const rawUrls = text.match(URL_REGEX) ?? [];
  const results: ResolvedLink[] = [];

  for (const rawUrl of rawUrls) {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      continue;
    }

    const platform = findPlatform(url);
    if (!platform) continue;

    const fixedUrl = await platform.resolve(url);
    if (!fixedUrl || fixedUrl === rawUrl) continue;

    results.push({ platformLabel: platform.label, originalUrl: rawUrl, fixedUrl });
  }

  return results;
}

export function registerMessageHandler(bot: Bot): void {
  bot.on("message:text", async (ctx) => {
    if (ctx.from?.is_bot) return;

    const links = await resolveLinks(ctx.message.text);
    if (links.length === 0) return;

    const senderName = ctx.from?.first_name ?? "alguém";
    const senderId = ctx.from?.id ?? 0;
    const id = createId();

    const sent = await ctx.reply(buildMessageText(senderName, links), {
      parse_mode: "HTML",
      reply_parameters: { message_id: ctx.message.message_id },
      reply_markup: buildKeyboard(id, links),
      link_preview_options: { url: links[0].fixedUrl },
    });

    saveMessage(id, {
      chatId: ctx.chat.id,
      botMessageId: sent.message_id,
      senderId,
      senderName,
      links,
    });
  });
}
