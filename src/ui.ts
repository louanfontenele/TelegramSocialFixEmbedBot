import { InlineKeyboard } from "grammy";
import type { ResolvedLink } from "./store.js";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildMessageText(senderName: string, links: ResolvedLink[]): string {
  const header = `🔗 Enviado por <b>${escapeHtml(senderName)}</b>`;
  const body = links.map((link) => link.fixedUrl).join("\n");
  return `${header}\n${body}`;
}

export function buildKeyboard(id: string, links: ResolvedLink[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const link of links) {
    keyboard.url(`🔗 Original (${link.platformLabel})`, link.originalUrl).row();
  }

  keyboard.text("🔄 Atualizar", `refresh:${id}`).text("🗑️ Excluir", `delete:${id}`);
  return keyboard;
}
