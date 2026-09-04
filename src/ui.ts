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

// A raw "&" in a query string (e.g. Facebook's ?story_fbid=X&id=Y) is valid
// in a URL but not in HTML text - Telegram's parse_mode=HTML expects it
// escaped like any other text.
const builders: Record<Exclude<MessageStyle, "replace">, (sender: Sender, link: ResolvedLink) => string> = {
  compact: (sender, link) =>
    `${link.platformEmoji} <b>${escapeHtml(link.platformLabel)}</b> · enviado por ${mention(sender)}` +
    `\n\n${escapeHtml(link.fixedUrl)}`,

  structured: (sender, link) =>
    `🔗 <b>Link Corrigido</b>\n<i>👤 Enviado por</i>: ${mention(sender)}` +
    `\n\n${link.platformEmoji} ${escapeHtml(link.fixedUrl)}`,

  quote: (sender, link) =>
    `<blockquote>🔗 <b>Link Corrigido</b>\n` +
    `${link.platformEmoji} <b>${escapeHtml(link.platformLabel)}</b> · 👤 ${mention(sender)}</blockquote>` +
    `\n\n${escapeHtml(link.fixedUrl)}`,
};

/** Telegram measures message/entity offsets in UTF-16 code units. JavaScript's
 * string length uses the same unit, including variation selectors in emoji. */
export function telegramTextLength(text: string): number {
  return text.length;
}

function replacementPlainText(sender: Sender, link: ResolvedLink, quotedText: string): string {
  const quote = quotedText
    ? `👤 ${sender.name}\n${quotedText}`
    : `👤 ${sender.name} enviou um link.`;
  return `${quote}\n\n${link.platformEmoji} ${link.fixedUrl}`;
}

export function buildReplacementMessageText(sender: Sender, link: ResolvedLink, quotedText: string): string {
  const quote = quotedText
    ? `👤 ${mention(sender)}\n${escapeHtml(quotedText)}`
    : `👤 ${mention(sender)} enviou um link.`;
  return `<blockquote>${quote}</blockquote>\n\n${link.platformEmoji} ${escapeHtml(link.fixedUrl)}`;
}

export function replacementMessageLength(sender: Sender, link: ResolvedLink, quotedText: string): number {
  return telegramTextLength(replacementPlainText(sender, link, quotedText));
}

export function buildMessageText(sender: Sender, link: ResolvedLink, quotedText?: string): string {
  if (config.messageStyle === "replace") {
    return quotedText === undefined
      ? builders.compact(sender, link)
      : buildReplacementMessageText(sender, link, quotedText);
  }
  return builders[config.messageStyle](sender, link);
}

export function buildValidationFailureText(
  sender: Sender,
  platformLabel: string,
  platformEmoji: string,
  originalUrl: string,
): string {
  return (
    `⚠️ <b>Nenhum serviço disponível conseguiu gerar uma prévia válida</b>\n` +
    `${platformEmoji} ${escapeHtml(platformLabel)} · enviado por ${mention(sender)}\n\n` +
    `<a href="${escapeHtml(originalUrl)}">Abrir link original</a>`
  );
}

export function buildKeyboard(id: string, link: ResolvedLink): InlineKeyboard {
  // The original link is always offered; the action buttons are opt-out.
  // The label spells out what the button does - "Original" alone left people
  // guessing what it pointed at.
  const keyboard = new InlineKeyboard().url(
    `${link.platformEmoji} Link Original (${link.platformLabel})`,
    link.originalUrl,
  );

  if (config.buttons.refresh || config.buttons.delete) {
    keyboard.row();
    if (config.buttons.refresh) keyboard.text("🔄 Atualizar", `refresh:${id}`);
    if (config.buttons.delete) keyboard.text("🗑️ Excluir", `delete:${id}`);
  }

  return keyboard;
}
