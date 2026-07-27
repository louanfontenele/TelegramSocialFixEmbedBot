import type { Bot } from "grammy";
import { findPlatform } from "../platforms/index.js";
import { deleteMessage, getMessage, updateMessage, type ResolvedLink } from "../store.js";
import { buildKeyboard, buildMessageText } from "../ui.js";

const NOT_AUTHORIZED = "Só quem enviou o link ou admins do grupo podem fazer isso.";
const EXPIRED = "Essa ação expirou (a mensagem é antiga demais).";

async function isAuthorized(bot: Bot, chatId: number, userId: number, senderId: number): Promise<boolean> {
  if (userId === senderId) return true;

  try {
    const member = await bot.api.getChatMember(chatId, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch {
    return false;
  }
}

async function refreshLinks(links: ResolvedLink[]): Promise<ResolvedLink[]> {
  const refreshed: ResolvedLink[] = [];

  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link.originalUrl);
    } catch {
      refreshed.push(link);
      continue;
    }

    const platform = findPlatform(url);
    const fixedUrl = platform ? await platform.resolve(url) : null;
    refreshed.push(fixedUrl ? { ...link, fixedUrl } : link);
  }

  return refreshed;
}

export function registerCallbackHandlers(bot: Bot): void {
  bot.callbackQuery(/^refresh:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const entry = getMessage(id);
    if (!entry) {
      await ctx.answerCallbackQuery({ text: EXPIRED, show_alert: true });
      return;
    }

    if (!(await isAuthorized(bot, entry.chatId, ctx.from.id, entry.senderId))) {
      await ctx.answerCallbackQuery({ text: NOT_AUTHORIZED, show_alert: true });
      return;
    }

    const links = await refreshLinks(entry.links);
    updateMessage(id, links);

    await ctx.editMessageText(buildMessageText(entry.senderName, links), {
      parse_mode: "HTML",
      reply_markup: buildKeyboard(id, links),
      link_preview_options: { url: links[0]?.fixedUrl },
    });
    await ctx.answerCallbackQuery({ text: "Atualizado!" });
  });

  bot.callbackQuery(/^delete:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const entry = getMessage(id);
    if (!entry) {
      await ctx.answerCallbackQuery({ text: EXPIRED, show_alert: true });
      return;
    }

    if (!(await isAuthorized(bot, entry.chatId, ctx.from.id, entry.senderId))) {
      await ctx.answerCallbackQuery({ text: NOT_AUTHORIZED, show_alert: true });
      return;
    }

    await ctx.deleteMessage();
    deleteMessage(id);
    await ctx.answerCallbackQuery();
  });
}
