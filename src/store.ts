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
  createdAt: number;
}

/**
 * Hard ceiling on retained entries. The hourly sweep below handles the
 * normal case; this bounds memory in the window between sweeps, when a
 * burst of traffic could otherwise grow the map without limit.
 */
const MAX_ENTRIES = 10_000;

const entries = new Map<string, StoredMessage>();

export function createId(): string {
  return randomUUID();
}

export function saveMessage(id: string, data: Omit<StoredMessage, "createdAt">): void {
  // Map preserves insertion order, so the first key is the oldest entry.
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    entries.delete(oldest.value);
  }

  entries.set(id, { ...data, createdAt: Date.now() });
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

export function deleteMessage(id: string): void {
  entries.delete(id);
}

// Periodically evict entries older than the configured TTL so long-running
// processes don't accumulate memory for messages nobody will interact with again.
setInterval(() => {
  const cutoff = Date.now() - config.stateTtlMs;
  for (const [id, entry] of entries) {
    if (entry.createdAt < cutoff) {
      entries.delete(id);
    }
  }
}, 60 * 60 * 1000).unref();
