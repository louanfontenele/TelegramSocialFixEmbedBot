import type { Bot } from "grammy";
import { config } from "../config.js";

/**
 * Owner-only helper for filling in ALLOWED_CHAT_IDS: run it in any chat to
 * get that chat's id. Restricted to the owner so the bot stays silent for
 * everyone else, including in chats it isn't allowlisted for.
 */
export function registerCommands(bot: Bot): void {
  bot.command("id", async (ctx) => {
    if (config.access.ownerId === undefined || ctx.from?.id !== config.access.ownerId) return;

    await ctx.reply(
      `🆔 <b>Chat id</b>: <code>${ctx.chat.id}</code>\n` +
        `👤 <b>Seu id</b>: <code>${ctx.from.id}</code>\n` +
        `💬 <b>Tipo</b>: <code>${ctx.chat.type}</code>`,
      { parse_mode: "HTML" },
    );
  });

  // bot.command() only wires up the handler - it doesn't tell Telegram the
  // command exists, which is a separate API call. Without this, /id works
  // when typed but never shows up in the "/" menu.
  bot.api
    .setMyCommands([{ command: "id", description: "Mostra o ID deste chat (uso restrito ao dono do bot)" }])
    .catch((error) => console.error("Failed to register bot commands:", error));
}
