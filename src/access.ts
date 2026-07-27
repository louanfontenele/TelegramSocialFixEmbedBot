import { config } from "./config.js";

/**
 * Gate checked before any URL processing, so disallowed chats don't cost
 * any work beyond this lookup. The owner always passes, regardless of
 * chat, so testing in DMs or other groups keeps working.
 */
export function isAllowed(chatId: number, userId: number): boolean {
  if (!config.access.restrict) return true;
  if (config.access.ownerId !== undefined && userId === config.access.ownerId) return true;
  return config.access.allowedChatIds.includes(chatId);
}
