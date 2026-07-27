import { GrammyError, type Bot } from "grammy";
import { config } from "../config.js";
import { findPlatform } from "../platforms/index.js";
import { deleteMessage, getMessage, updateMessage, type ResolvedLink } from "../store.js";
import { buildKeyboard, buildMessageText } from "../ui.js";

const NOT_AUTHORIZED = "Só quem enviou o link ou admins do grupo podem fazer isso.";
const CANNOT_DELETE = "Você precisa da permissão de apagar mensagens para excluir isso.";
const EXPIRED = "Essa ação expirou (a mensagem é antiga demais).";

/** What a clicking user is allowed to do with a given bot message. */
interface Rights {
  refresh: boolean;
  delete: boolean;
}

const NO_RIGHTS: Rights = { refresh: false, delete: false };
const ALL_RIGHTS: Rights = { refresh: true, delete: true };

/**
 * Telegram renders one keyboard for the whole chat, so the buttons are
 * visible to everyone - authorization has to happen on click instead.
 *
 * Refreshing only re-edits the bot's own message, so any admin may do it.
 * Deleting is gated on the group's own can_delete_messages right, so an
 * admin who isn't trusted to remove messages can't remove these either.
 */
async function rightsOf(bot: Bot, chatId: number, userId: number, senderId: number): Promise<Rights> {
  if (userId === senderId) return ALL_RIGHTS;
  if (config.access.ownerId !== undefined && userId === config.access.ownerId) return ALL_RIGHTS;

  try {
    const member = await bot.api.getChatMember(chatId, userId);
    if (member.status === "creator") return ALL_RIGHTS;
    if (member.status !== "administrator") return NO_RIGHTS;
    return { refresh: true, delete: member.can_delete_messages === true };
  } catch {
    return NO_RIGHTS;
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
    // The chat check keeps the rights lookup and the acted-on message in the
    // same chat, so a click can never be evaluated against another group.
    if (!entry || entry.chatId !== ctx.chat?.id) {
      await ctx.answerCallbackQuery({ text: EXPIRED, show_alert: true });
      return;
    }

    const rights = await rightsOf(bot, entry.chatId, ctx.from.id, entry.senderId);
    if (!rights.refresh) {
      await ctx.answerCallbackQuery({ text: NOT_AUTHORIZED, show_alert: true });
      return;
    }

    const link = await refreshLink(entry.link);
    updateMessage(id, link);

    const sender = { id: entry.senderId, name: entry.senderName };
    try {
      await ctx.editMessageText(buildMessageText(sender, link), {
        parse_mode: "HTML",
        reply_markup: buildKeyboard(id, link),
        link_preview_options: { url: link.fixedUrl },
      });
      await ctx.answerCallbackQuery({ text: "Atualizado!" });
    } catch (error) {
      // Telegram rejects an edit that produces identical content, which is
      // the common case when the link resolved the same way as before.
      const unchanged = error instanceof GrammyError && error.description.includes("message is not modified");
      await ctx.answerCallbackQuery({
        text: unchanged ? "O link já está atualizado." : "Não foi possível atualizar agora.",
        show_alert: !unchanged,
      });
      if (!unchanged) throw error;
    }
  });

  bot.callbackQuery(/^delete:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const entry = getMessage(id);
    // The chat check keeps the rights lookup and the acted-on message in the
    // same chat, so a click can never be evaluated against another group.
    if (!entry || entry.chatId !== ctx.chat?.id) {
      await ctx.answerCallbackQuery({ text: EXPIRED, show_alert: true });
      return;
    }

    const rights = await rightsOf(bot, entry.chatId, ctx.from.id, entry.senderId);
    if (!rights.delete) {
      // An admin without can_delete_messages gets the more specific reason.
      await ctx.answerCallbackQuery({
        text: rights.refresh ? CANNOT_DELETE : NOT_AUTHORIZED,
        show_alert: true,
      });
      return;
    }

    try {
      await ctx.deleteMessage();
    } catch {
      // Already gone, or too old for the bot to remove - drop the state either way.
      await ctx.answerCallbackQuery({ text: "Não foi possível excluir essa mensagem." });
      deleteMessage(id);
      return;
    }

    deleteMessage(id);
    await ctx.answerCallbackQuery();
  });
}
