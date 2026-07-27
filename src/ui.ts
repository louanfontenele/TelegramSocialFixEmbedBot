import { InlineKeyboard } from "grammy";
import { config, type MessageStyle } from "./config.js";
import type { ResolvedLink } from "./store.js";

export interface Sender {
  id: number;
  name: string;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A tg:// mention stays clickable and works for users who never set a
 * @username, unlike a plain "@handle" string.
 */
function mention(sender: Sender): string {
  return `<a href="tg://user?id=${sender.id}">${escapeHtml(sender.name)}</a>`;
}

const builders: Record<MessageStyle, (sender: Sender, link: ResolvedLink) => string> = {
  compact: (sender, link) =>
    `${link.platformEmoji} <b>${escapeHtml(link.platformLabel)}</b> · enviado por ${mention(sender)}` +
    `\n\n${link.fixedUrl}`,

  structured: (sender, link) =>
    `🔗 <b>Link Corrigido</b>\n<i>👤 Enviado por</i>: ${mention(sender)}` +
    `\n\n${link.platformEmoji} ${link.fixedUrl}`,

  quote: (sender, link) =>
    `<blockquote>🔗 <b>Link Corrigido</b>\n` +
    `${link.platformEmoji} <b>${escapeHtml(link.platformLabel)}</b> · 👤 ${mention(sender)}</blockquote>` +
    `\n\n${link.fixedUrl}`,
};

export function buildMessageText(sender: Sender, link: ResolvedLink): string {
  return builders[config.messageStyle](sender, link);
}

export function buildKeyboard(id: string, link: ResolvedLink): InlineKeyboard {
  return new InlineKeyboard()
    .url(`${link.platformEmoji} Original`, link.originalUrl)
    .row()
    .text("🔄 Atualizar", `refresh:${id}`)
    .text("🗑️ Excluir", `delete:${id}`);
}
