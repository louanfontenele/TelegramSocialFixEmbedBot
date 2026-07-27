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

async function refreshLink(link: ResolvedLink): Promise<ResolvedLink> {
  try {
    const url = new URL(link.originalUrl);
    const platform = findPlatform(url);
    const fixedUrl = platform ? await platform.resolve(url) : null;
    return fixedUrl ? { ...link, fixedUrl } : link;
  } catch {
    return link;
  }
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

    const link = await refreshLink(entry.link);
    updateMessage(id, link);

    const sender = { id: entry.senderId, name: entry.senderName };
    await ctx.editMessageText(buildMessageText(sender, link), {
      parse_mode: "HTML",
      reply_markup: buildKeyboard(id, link),
      link_preview_options: { url: link.fixedUrl },
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
