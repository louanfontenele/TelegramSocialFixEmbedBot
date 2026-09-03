import type { Bot } from "grammy";
import { isAllowedChat } from "../access.js";
import { config } from "../config.js";

const JOINED_STATUSES = ["member", "administrator", "restricted"];

/**
 * Group membership policy (owner DMs are handled separately). The bot
 * refuses channels unconditionally -
 * regardless of RESTRICT_ACCESS or who added it, including the owner - and,
 * when access is restricted, also refuses groups that aren't allowlisted
 * (with an exception letting the owner park it in a new group long enough
 * to run /id and copy the chat id into ALLOWED_CHAT_IDS).
 */
export function registerMembershipHandler(bot: Bot): void {
  bot.on("my_chat_member", async (ctx) => {
    const { chat, new_chat_member: membership } = ctx.myChatMember;
    if (chat.type === "private") return;
    if (!JOINED_STATUSES.includes(membership.status)) return;

    if (chat.type === "channel") {
      console.log(`Leaving channel ${chat.id}: this bot never operates in channels.`);
      try {
        await ctx.reply("🚫 Este bot só funciona em grupos, não em canais. Saindo...");
      } catch {
        // Posting requires a right the bot may not have here; leave anyway.
      }
      await ctx.leaveChat();
      return;
    }

    if (!config.access.restrict || !config.access.autoLeave) return;
    if (isAllowedChat(chat.id)) return;

    const addedBy = ctx.from?.id;
    if (config.access.ownerId !== undefined && addedBy === config.access.ownerId) {
      console.log(`Staying in unauthorized chat ${chat.id}: added by the owner.`);
      return;
    }

    console.log(`Leaving unauthorized chat ${chat.id} (added by user ${addedBy})`);

    try {
      await ctx.reply("🚫 Este bot está restrito a grupos autorizados. Saindo...");
    } catch {
      // Sending may fail if the bot can't post in the group; leave anyway.
    }

    await ctx.leaveChat();
  });
}
