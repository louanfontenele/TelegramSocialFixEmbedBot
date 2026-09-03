import { config } from "./config.js";

export function isOwner(userId: number): boolean {
  return config.access.ownerId !== undefined && userId === config.access.ownerId;
}

/**
 * Gate checked before any URL processing, so disallowed chats don't cost
 * any work beyond this lookup. The owner always passes, regardless of
 * chat, so testing in DMs or other groups keeps working.
 */
export function isAllowed(chatId: number, userId: number): boolean {
  if (!config.access.restrict) return true;
  if (isOwner(userId)) return true;
  return isAllowedChat(chatId);
}

/** Chat-only check, for decisions not tied to a specific user's message. */
export function isAllowedChat(chatId: number): boolean {
  if (!config.access.restrict) return true;
  return config.access.allowedChatIds.includes(chatId);
}
