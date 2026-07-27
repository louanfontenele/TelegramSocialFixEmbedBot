import { nanoid } from "nanoid";
import { config } from "./config.js";

export interface ResolvedLink {
  platformLabel: string;
  originalUrl: string;
  fixedUrl: string;
}

export interface StoredMessage {
  chatId: number;
  botMessageId: number;
  senderId: number;
  senderName: string;
  links: ResolvedLink[];
  createdAt: number;
}

const entries = new Map<string, StoredMessage>();

export function createId(): string {
  return nanoid(10);
}

export function saveMessage(id: string, data: Omit<StoredMessage, "createdAt">): void {
  entries.set(id, { ...data, createdAt: Date.now() });
}

export function getMessage(id: string): StoredMessage | undefined {
  return entries.get(id);
}

export function updateMessage(id: string, links: ResolvedLink[]): void {
  const existing = entries.get(id);
  if (existing) {
    existing.links = links;
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
