import type { Bot } from "grammy";
import { isAllowedChat } from "../access.js";
import { config } from "../config.js";

const JOINED_STATUSES = ["member", "administrator", "restricted"];

/**
 * When access is restricted, the bot refuses to stay in groups that aren't
 * allowlisted: it announces why and leaves as soon as it's added. The owner
 * can still add it anywhere by allowlisting the chat first.
 */
export function registerMembershipHandler(bot: Bot): void {
  bot.on("my_chat_member", async (ctx) => {
    if (!config.access.restrict || !config.access.autoLeave) return;

    const { chat, new_chat_member: membership } = ctx.myChatMember;
    if (chat.type === "private") return;
    if (!JOINED_STATUSES.includes(membership.status)) return;
    if (isAllowedChat(chat.id)) return;

    // The owner is allowed to park the bot in a new group long enough to run
    // /id there and copy the chat id into ALLOWED_CHAT_IDS.
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
