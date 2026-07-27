import { InlineKeyboard } from "grammy";
import type { ResolvedLink } from "./store.js";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildMessageText(senderName: string, links: ResolvedLink[]): string {
  const header = `👤 <b>${escapeHtml(senderName)}</b> enviou:`;

  const body =
    links.length === 1
      ? `${links[0].platformEmoji} ${links[0].fixedUrl}`
      : links
          .map((link) => `${link.platformEmoji} <b>${escapeHtml(link.platformLabel)}</b>\n${link.fixedUrl}`)
          .join("\n\n");

  return `${header}\n\n${body}`;
}

export function buildKeyboard(id: string, links: ResolvedLink[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const link of links) {
    const label = links.length === 1 ? "Original" : `Original (${link.platformLabel})`;
    keyboard.url(`${link.platformEmoji} ${label}`, link.originalUrl).row();
  }

  keyboard.text("🔄 Atualizar", `refresh:${id}`).text("🗑️ Excluir", `delete:${id}`);
  return keyboard;
}
