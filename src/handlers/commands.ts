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
}
