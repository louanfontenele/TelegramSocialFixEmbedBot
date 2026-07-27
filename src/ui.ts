import { InlineKeyboard } from "grammy";
import type { ResolvedLink } from "./store.js";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildMessageText(senderName: string, link: ResolvedLink): string {
  const header = `👤 <b>${escapeHtml(senderName)}</b> enviou:`;
  return `${header}\n\n${link.platformEmoji} ${link.fixedUrl}`;
}

export function buildKeyboard(id: string, link: ResolvedLink): InlineKeyboard {
  return new InlineKeyboard()
    .url(`${link.platformEmoji} Original`, link.originalUrl)
    .row()
    .text("🔄 Atualizar", `refresh:${id}`)
    .text("🗑️ Excluir", `delete:${id}`);
}
