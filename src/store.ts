import { randomUUID } from "node:crypto";
import { config } from "./config.js";

export interface ResolvedLink {
  platformLabel: string;
  platformEmoji: string;
  originalUrl: string;
  fixedUrl: string;
}

export interface StoredMessage {
  chatId: number;
  botMessageId: number;
  senderId: number;
  senderName: string;
  link: ResolvedLink;
  /** Text preserved in the blockquote when replace mode deleted the source. */
  quotedText?: string;
  /** One-based position among the validated links from the same source. */
  linkIndex?: number;
  linkCount?: number;
  createdAt: number;
}

/**
 * Hard ceiling on retained entries. The hourly sweep below handles the
 * normal case; this bounds memory in the window between sweeps, when a
 * burst of traffic could otherwise grow the map without limit.
 */
const MAX_ENTRIES = 10_000;

const entries = new Map<string, StoredMessage>();
const botMessageIds = new Map<string, string>();
const replyNotificationExpirations = new Map<string, number>();

function botMessageKey(chatId: number, messageId: number): string {
  return `${chatId}:${messageId}`;
}

function replyNotificationKey(chatId: number, botMessageId: number, replierId: number): string {
  return `${chatId}:${botMessageId}:${replierId}`;
}

export function createId(): string {
  return randomUUID();
}

export function saveMessage(id: string, data: Omit<StoredMessage, "createdAt">): void {
  // Map preserves insertion order, so the first key is the oldest entry.
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    const entry = entries.get(oldest.value);
    if (entry) botMessageIds.delete(botMessageKey(entry.chatId, entry.botMessageId));
    entries.delete(oldest.value);
  }

  entries.set(id, { ...data, createdAt: Date.now() });
  botMessageIds.set(botMessageKey(data.chatId, data.botMessageId), id);
}

export function getMessage(id: string): StoredMessage | undefined {
  return entries.get(id);
}

export function updateMessage(id: string, link: ResolvedLink): void {
  const existing = entries.get(id);
  if (existing) {
    existing.link = link;
  }
}

export function getMessageByBotMessage(chatId: number, botMessageId: number): StoredMessage | undefined {
  const id = botMessageIds.get(botMessageKey(chatId, botMessageId));
  return id ? entries.get(id) : undefined;
}

/** Claims the notification slot for one person replying to one embed. */
export function claimReplyNotification(
  chatId: number,
  botMessageId: number,
  replierId: number,
  now = Date.now(),
): boolean {
  const key = replyNotificationKey(chatId, botMessageId, replierId);
  const expiration = replyNotificationExpirations.get(key) ?? 0;
  if (expiration > now) return false;

  while (replyNotificationExpirations.size >= MAX_ENTRIES) {
    const oldest = replyNotificationExpirations.keys().next();
    if (oldest.done) break;
    replyNotificationExpirations.delete(oldest.value);
  }
  replyNotificationExpirations.delete(key);
  replyNotificationExpirations.set(key, now + config.replyNotificationCooldownMs);
  return true;
}

export function releaseReplyNotification(chatId: number, botMessageId: number, replierId: number): void {
  replyNotificationExpirations.delete(replyNotificationKey(chatId, botMessageId, replierId));
}

export function deleteMessage(id: string): void {
  const entry = entries.get(id);
  if (entry && botMessageIds.get(botMessageKey(entry.chatId, entry.botMessageId)) === id) {
    botMessageIds.delete(botMessageKey(entry.chatId, entry.botMessageId));
  }
  entries.delete(id);
}

// Periodically evict entries older than the configured TTL so long-running
// processes don't accumulate memory for messages nobody will interact with again.
setInterval(() => {
  const now = Date.now();
  const cutoff = now - config.stateTtlMs;
  for (const [id, entry] of entries) {
    if (entry.createdAt < cutoff) {
      if (botMessageIds.get(botMessageKey(entry.chatId, entry.botMessageId)) === id) {
        botMessageIds.delete(botMessageKey(entry.chatId, entry.botMessageId));
      }
      entries.delete(id);
    }
  }
  for (const [key, expiration] of replyNotificationExpirations) {
    if (expiration <= now) replyNotificationExpirations.delete(key);
  }
}, 60 * 60 * 1000).unref();
