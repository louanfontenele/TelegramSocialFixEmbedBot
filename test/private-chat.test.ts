import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { Bot, GrammyError } from "grammy";
import type { Message, Update, UserFromGetMe } from "grammy/types";

process.env.BOT_TOKEN = "123456:test-token";
process.env.OWNER_USER_ID = "42";
process.env.RESTRICT_ACCESS = "false";
process.env.ALLOWED_CHAT_IDS = "";
process.env.TWITTER_FIX_DOMAIN = "fixupx.com";
process.env.TRANSLATE_LINKS = "true";
process.env.TRANSLATE_LANGUAGE = "pt";
const { config } = await import("../src/config.js");
const { registerMessageHandler } = await import("../src/handlers/message.js");
const { registerCallbackHandlers } = await import("../src/handlers/callbacks.js");
const { deleteMessage, getMessage } = await import("../src/store.js");
const { telegramTextLength } = await import("../src/ui.js");

const ownerId = 42;
const otherId = 99;
const originalUrl = "https://x.com/example/status/12345";
const fixedUrl = "https://fixupx.com/example/status/12345/pt";
const secondOriginalUrl = "https://x.com/example/status/67890";
const secondFixedUrl = "https://fixupx.com/example/status/67890/pt";
const thirdOriginalUrl = "https://x.com/example/status/24680";
const thirdFixedUrl = "https://fixupx.com/example/status/24680/pt";
const botInfo: UserFromGetMe = {
  id: 123456, is_bot: true, first_name: "Test", username: "test_bot",
  can_join_groups: true, can_read_all_group_messages: true, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false,
};
const savedIds: string[] = [];
let networkRequests: string[];

beforeEach(() => {
  config.access.ownerId = ownerId;
  config.access.restrict = false;
  config.access.allowedChatIds = [];
  config.buttons.refresh = true;
  config.buttons.delete = true;
  config.verifyLinksBeforeSend = false;
  config.messageStyle = "compact";
  networkRequests = [];
  mock.method(globalThis, "fetch", async (input: unknown) => {
    networkRequests.push(String(input));
    throw new Error("Tests must not send network requests");
  });
});
afterEach(() => {
  for (const id of savedIds.splice(0)) deleteMessage(id);
  mock.restoreAll();
});

function incoming(userId: number, type: "private" | "group" | "supergroup" | "channel" = "private", caption = false): Message {
  return {
    message_id: 10, date: 0,
    chat: type === "private" ? { id: userId, type, first_name: "Tester" } : { id: -100, type, title: "Tests" },
    from: { id: userId, is_bot: false, first_name: "Tester" },
    ...(caption
      ? { caption: originalUrl, photo: [{ file_id: "photo", file_unique_id: "unique", width: 10, height: 10 }] }
      : { text: originalUrl }),
  };
}

function harness() {
  const bot = new Bot("123456:test-token", { botInfo });
  const calls: { method: string; payload: any }[] = [];
  let sent: Message | undefined;
  let unchangedEdit = false;
  let rejectedDelete = false;
  let botCanDelete = true;
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload });
    if (method === "sendMessage") {
      const p = payload as { chat_id: number; text: string; reply_markup: any };
      sent = { message_id: 100, date: 0, chat: { id: p.chat_id, type: "private", first_name: "Tester" }, from: botInfo, text: p.text };
      const button = p.reply_markup?.inline_keyboard
        ?.flat()
        .find((b: any) => b.callback_data?.startsWith("refresh:"));
      if (button) savedIds.push(button.callback_data.slice("refresh:".length));
      return { ok: true, result: sent } as any;
    }
    if (method === "editMessageText") {
      if (unchangedEdit) throw new GrammyError("edit failed", {
        ok: false, error_code: 400, description: "Bad Request: message is not modified",
      }, method, payload);
      return { ok: true, result: sent } as any;
    }
    if (method === "getChatMember") {
      return {
        ok: true,
        result: {
          status: "administrator", user: botInfo, can_be_edited: false,
          is_anonymous: false, can_manage_chat: true, can_delete_messages: botCanDelete,
          can_manage_video_chats: false, can_restrict_members: false,
          can_promote_members: false, can_change_info: false,
          can_invite_users: true, can_post_stories: false,
          can_edit_stories: false, can_delete_stories: false,
        },
      } as any;
    }
    if (method === "deleteMessage" && rejectedDelete) {
      throw new GrammyError("delete failed", {
        ok: false, error_code: 400, description: "Bad Request: message can't be deleted",
      }, method, payload);
    }
    assert.ok(["deleteMessage", "answerCallbackQuery"].includes(method), `Unexpected API method ${method}`);
    return { ok: true, result: true } as any;
  });
  registerMessageHandler(bot);
  registerCallbackHandlers(bot);
  return {
    calls,
    sentMessage() { return sent; },
    unchanged() { unchangedEdit = true; },
    rejectDelete() { rejectedDelete = true; },
    denyBotDeletePermission() { botCanDelete = false; },
    async message(message: Message) {
      await bot.handleUpdate({ update_id: 1, message } as Update);
    },
    async click(action: "refresh" | "delete", userId = ownerId) {
      assert.ok(sent);
      const id = savedIds.at(-1)!;
      await bot.handleUpdate({
        update_id: 2,
        callback_query: {
          id: "callback", chat_instance: "instance", data: `${action}:${id}`,
          from: { id: userId, is_bot: false, first_name: "Tester" }, message: sent,
        },
      });
    },
  };
}

for (const restrict of [false, true]) {
  for (const caption of [false, true]) {
    test(`Owner DM ${caption ? "caption" : "text"} works with RESTRICT_ACCESS=${restrict}`, async () => {
      config.access.restrict = restrict;
      const h = harness();
      await h.message(incoming(ownerId, "private", caption));
      assert.deepEqual(h.calls.map((call) => call.method), ["sendMessage"]);
      const { payload } = h.calls[0];
      assert.equal(payload.chat_id, ownerId);
      assert.equal(payload.link_preview_options.url, fixedUrl);
      assert.equal(payload.reply_parameters.message_id, 10);
      const buttons = payload.reply_markup.inline_keyboard.flat();
      assert.ok(buttons.some((b: any) => b.url === originalUrl));
      assert.ok(buttons.some((b: any) => b.callback_data?.startsWith("refresh:")));
      assert.ok(buttons.some((b: any) => b.callback_data?.startsWith("delete:")));
      const stored = getMessage(savedIds.at(-1)!);
      assert.equal(stored?.senderId, ownerId);
      assert.equal(stored?.chatId, ownerId);
      assert.deepEqual(networkRequests, []);
    });
  }

  test(`Other users cannot use DMs even when allowlisted, RESTRICT_ACCESS=${restrict}`, async () => {
    config.access.restrict = restrict;
    config.access.allowedChatIds = [otherId];
    const h = harness();
    // A network-dependent link makes premature resolution observable.
    await h.message({ ...incoming(otherId), text: "https://pin.it/AbCd" });
    await h.message(incoming(otherId, "private", true));
    assert.deepEqual(h.calls, []);
    assert.deepEqual(networkRequests, []);
  });
}

test("Unset OWNER_USER_ID leaves DMs closed to everyone", async () => {
  config.access.ownerId = undefined;
  config.access.allowedChatIds = [ownerId, otherId];
  const h = harness();
  await h.message(incoming(ownerId));
  await h.message(incoming(otherId));
  assert.deepEqual(h.calls, []);
  assert.deepEqual(networkRequests, []);
});

test("Owner can refresh and delete a private reply without a group-admin lookup", async () => {
  const h = harness();
  await h.message(incoming(ownerId));
  const id = savedIds.at(-1)!;
  h.calls.length = 0;
  await h.click("refresh");
  assert.deepEqual(h.calls.map((call) => call.method), ["editMessageText", "answerCallbackQuery"]);
  assert.equal(h.calls[0].payload.link_preview_options.url, fixedUrl);
  assert.equal(h.calls[1].payload.text, "Link reprocessado.");
  h.calls.length = 0;
  await h.click("delete");
  assert.deepEqual(h.calls.map((call) => call.method), ["deleteMessage", "answerCallbackQuery"]);
  assert.equal(h.calls[0].payload.chat_id, ownerId);
  assert.equal(h.calls[0].payload.message_id, 100);
  assert.equal(getMessage(id), undefined);
  assert.deepEqual(networkRequests, []);
});

test("An identical refresh does not claim Telegram's cache was updated", async () => {
  const h = harness();
  await h.message(incoming(ownerId));
  h.unchanged();
  h.calls.length = 0;
  await h.click("refresh");
  assert.deepEqual(h.calls.map((call) => call.method), ["editMessageText", "answerCallbackQuery"]);
  assert.equal(h.calls[1].payload.text, "O link não mudou. O Telegram pode manter a prévia em cache.");
  assert.equal(h.calls[1].payload.show_alert, false);
});

test("Changing or clearing the owner revokes old private buttons", async () => {
  const h = harness();
  await h.message(incoming(ownerId));
  h.calls.length = 0;
  for (const nextOwner of [otherId, undefined]) {
    config.access.ownerId = nextOwner;
    await h.click("refresh");
    await h.click("delete");
  }
  assert.deepEqual(h.calls, []);
  assert.deepEqual(networkRequests, []);
  assert.ok(getMessage(savedIds.at(-1)!));
});

test("Non-owner callbacks cannot use the private reply", async () => {
  const h = harness();
  await h.message(incoming(ownerId));
  h.calls.length = 0;
  await h.click("refresh", otherId);
  await h.click("delete", otherId);
  assert.deepEqual(h.calls, []);
  assert.deepEqual(networkRequests, []);
});

test("Owner DMs do not open channel or bot-authored message processing", async () => {
  const h = harness();
  await h.message(incoming(ownerId, "channel"));
  await h.message({ ...incoming(ownerId), from: { id: ownerId, is_bot: true, first_name: "Bot" } });
  assert.deepEqual(h.calls, []);
  assert.deepEqual(networkRequests, []);
});

test("Existing group access still allows ordinary users when open or allowlisted", async () => {
  const h = harness();
  await h.message(incoming(otherId, "group"));
  config.access.restrict = true;
  config.access.allowedChatIds = [-100];
  await h.message(incoming(otherId, "supergroup"));
  assert.deepEqual(h.calls.map((call) => call.method), ["sendMessage", "sendMessage"]);
});

test("Verified fixer metadata is required before a corrected link is sent", async () => {
  config.verifyLinksBeforeSend = true;
  mock.restoreAll();
  mock.method(globalThis, "fetch", async (input: unknown) => {
    networkRequests.push(String(input));
    return new Response('<meta property="og:title" content="The expected post">');
  });

  const h = harness();
  await h.message(incoming(ownerId));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].payload.link_preview_options.url, fixedUrl);
  assert.equal(networkRequests.length, 2);
});

test("An invalid fixer produces a warning without publishing the corrected URL", async () => {
  config.verifyLinksBeforeSend = true;
  mock.restoreAll();
  mock.method(globalThis, "fetch", async (input: unknown) => {
    networkRequests.push(String(input));
    return new Response("Service unavailable", { status: 503 });
  });
  mock.method(console, "warn", () => {});

  const h = harness();
  await h.message(incoming(ownerId));
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].payload.text, /Nenhum serviço disponível/);
  assert.ok(!h.calls[0].payload.text.includes(fixedUrl));
  assert.equal(h.calls[0].payload.link_preview_options.is_disabled, true);
  assert.equal(h.calls[0].payload.reply_markup, undefined);
  assert.equal(networkRequests.length, 2);
});

test("Restricted groups remain closed to unlisted users, with the owner exception", async () => {
  config.access.restrict = true;
  mock.method(console, "log", () => {});
  const h = harness();
  await h.message(incoming(otherId, "supergroup"));
  assert.deepEqual(h.calls, []);
  await h.message(incoming(ownerId, "supergroup"));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].method, "sendMessage");
});

test("Replace style preserves surrounding text, publishes the embed, then deletes the source", async () => {
  config.messageStyle = "replace";
  const h = harness();
  await h.message({
    ...incoming(ownerId),
    text: `Ah @ravock assiste esse vídeo.\n\n${originalUrl}\n\nEu achei muito dahora!`,
  });

  assert.deepEqual(h.calls.map((call) => call.method), ["sendMessage", "deleteMessage"]);
  const sent = h.calls[0].payload;
  assert.match(sent.text, /^<blockquote>👤 <a href="tg:\/\/user\?id=42">Tester<\/a>:\n/);
  assert.match(sent.text, /Ah @ravock assiste esse vídeo\.\n\nEu achei muito dahora!/);
  assert.ok(!sent.text.includes(originalUrl));
  assert.ok(sent.text.includes(fixedUrl));
  assert.equal(sent.reply_parameters, undefined);
  assert.equal(h.calls[1].payload.message_id, 10);
});

test("Replace style describes a link-only source without a quote", async () => {
  config.messageStyle = "replace";
  const h = harness();
  await h.message(incoming(ownerId));

  assert.deepEqual(h.calls.map((call) => call.method), ["sendMessage", "deleteMessage"]);
  assert.match(
    h.calls[0].payload.text,
    /^👤 <a href="tg:\/\/user\?id=42">Tester<\/a> enviou um link\./,
  );
  assert.ok(!h.calls[0].payload.text.includes("<blockquote>"));
  assert.ok(h.calls[0].payload.text.includes(fixedUrl));
});

test("Replace style numbers only validated links and repeats a link-only attribution", async () => {
  config.messageStyle = "replace";
  const h = harness();
  await h.message({ ...incoming(ownerId), text: `${originalUrl}\n${secondOriginalUrl}` });

  assert.deepEqual(h.calls.map((call) => call.method), ["sendMessage", "sendMessage", "deleteMessage"]);
  const first = h.calls[0].payload.text;
  const second = h.calls[1].payload.text;
  for (const message of [first, second]) {
    assert.match(message, /^👤 <a href="tg:\/\/user\?id=42">Tester<\/a> enviou vários links\./);
    assert.ok(!message.includes("<blockquote>"));
  }
  assert.ok(first.includes("[1/2]"));
  assert.ok(first.includes(fixedUrl));
  assert.ok(second.includes("[2/2]"));
  assert.ok(second.includes(secondFixedUrl));
});

test("Replace style repeats preserved text and numbering for every valid embed", async () => {
  config.messageStyle = "replace";
  const h = harness();
  const preserved = "Vejam estes dois vídeos!";
  await h.message({
    ...incoming(ownerId),
    text: `${preserved}\n\n${originalUrl}\n${secondOriginalUrl}`,
  });

  const messages = h.calls.filter((call) => call.method === "sendMessage");
  assert.equal(messages.length, 2);
  for (const [index, message] of messages.entries()) {
    assert.ok(message.payload.text.includes("<blockquote>"));
    assert.ok(message.payload.text.includes(preserved));
    assert.ok(message.payload.text.includes(`[${index + 1}/2]`));
    assert.ok(!message.payload.text.includes(originalUrl));
    assert.ok(!message.payload.text.includes(secondOriginalUrl));
  }

  h.calls.length = 0;
  await h.click("refresh");
  assert.equal(h.calls[0].method, "editMessageText");
  assert.ok(h.calls[0].payload.text.includes(preserved));
  assert.ok(h.calls[0].payload.text.includes("[2/2]"));
});

test("Any failed embed keeps a multi-link source message visible", async () => {
  config.messageStyle = "replace";
  config.verifyLinksBeforeSend = true;
  mock.restoreAll();
  mock.method(globalThis, "fetch", async (input: unknown) => {
    networkRequests.push(String(input));
    return String(input).includes("67890")
      ? new Response("Service unavailable", { status: 503 })
      : new Response('<meta property="og:title" content="Valid preview">');
  });
  mock.method(console, "warn", () => {});

  const h = harness();
  await h.message({
    ...incoming(ownerId),
    text: `${originalUrl}\n${secondOriginalUrl}\n${thirdOriginalUrl}`,
  });

  assert.deepEqual(
    h.calls.map((call) => call.method),
    ["sendMessage", "sendMessage", "sendMessage"],
  );
  assert.ok(!h.calls[0].payload.text.includes("[1/2]"));
  assert.ok(h.calls[0].payload.text.includes(fixedUrl));
  assert.equal(h.calls[0].payload.reply_parameters.message_id, 10);
  assert.match(h.calls[1].payload.text, /Nenhum serviço disponível/);
  assert.ok(!h.calls[2].payload.text.includes("[2/2]"));
  assert.ok(h.calls[2].payload.text.includes(thirdFixedUrl));
  assert.equal(h.calls[2].payload.reply_parameters.message_id, 10);
});

test("Replace style keeps the source when the complete replacement exceeds 4096 UTF-16 units", async () => {
  config.messageStyle = "replace";
  const h = harness();
  const prefix = "a".repeat(4096 - originalUrl.length - 1);
  await h.message({ ...incoming(ownerId), text: `${prefix}\n${originalUrl}` });

  assert.deepEqual(h.calls.map((call) => call.method), ["sendMessage"]);
  assert.equal(h.calls[0].payload.reply_parameters.message_id, 10);
  assert.ok(!h.calls[0].payload.text.includes(prefix));
});

test("Replace style never deletes an attachment just to replace its caption", async () => {
  config.messageStyle = "replace";
  const h = harness();
  await h.message(incoming(ownerId, "private", true));

  assert.deepEqual(h.calls.map((call) => call.method), ["sendMessage"]);
  assert.equal(h.calls[0].payload.reply_parameters.message_id, 10);
});

test("A failed source deletion rolls the replacement back to an ordinary link reply", async () => {
  config.messageStyle = "replace";
  mock.method(console, "error", () => {});
  const h = harness();
  h.rejectDelete();
  await h.message({ ...incoming(ownerId), text: `Veja isto:\n${originalUrl}` });

  assert.deepEqual(h.calls.map((call) => call.method), ["sendMessage", "deleteMessage", "editMessageText"]);
  assert.ok(h.calls[0].payload.text.includes("<blockquote>"));
  assert.ok(!h.calls[2].payload.text.includes("<blockquote>"));
  assert.ok(h.calls[2].payload.text.includes(fixedUrl));
});

test("Replace style checks group deletion rights before publishing a replacement", async () => {
  config.messageStyle = "replace";
  const allowed = harness();
  await allowed.message({ ...incoming(otherId, "supergroup"), text: `Veja:\n${originalUrl}` });
  assert.deepEqual(allowed.calls.map((call) => call.method), ["getChatMember", "sendMessage", "deleteMessage"]);

  const denied = harness();
  denied.denyBotDeletePermission();
  await denied.message({ ...incoming(otherId, "supergroup"), text: `Veja:\n${originalUrl}` });
  assert.deepEqual(denied.calls.map((call) => call.method), ["getChatMember", "sendMessage"]);
  assert.equal(denied.calls[1].payload.reply_parameters.message_id, 10);
});

test("Telegram length uses UTF-16 units for emoji sequences", () => {
  assert.equal(telegramTextLength("❤️"), 2);
  assert.equal(telegramTextLength("😀"), 2);
  assert.equal(telegramTextLength("a"), 1);
});

test("Replying to a replacement notifies the original sender", async () => {
  config.messageStyle = "replace";
  const h = harness();
  await h.message(incoming(ownerId, "supergroup"));
  const replacement = h.sentMessage();
  assert.ok(replacement);

  h.calls.length = 0;
  await h.message({
    message_id: 11,
    date: 0,
    chat: { id: -100, type: "supergroup", title: "Tests" },
    from: { id: otherId, is_bot: false, first_name: "Rafael" },
    text: "É legal mesmo!",
    reply_to_message: replacement,
  });

  assert.deepEqual(h.calls.map((call) => call.method), ["sendMessage"]);
  assert.match(h.calls[0].payload.text, /^🔔 <a href="tg:\/\/user\?id=42">Tester<\/a>, Rafael respondeu/);
  assert.equal(h.calls[0].payload.reply_parameters.message_id, 11);
  assert.equal(h.calls[0].payload.link_preview_options.is_disabled, true);

  await h.message({
    message_id: 12,
    date: 0,
    chat: { id: -100, type: "supergroup", title: "Tests" },
    from: { id: otherId, is_bot: false, first_name: "Rafael" },
    text: "Outra resposta seguida.",
    reply_to_message: replacement,
  });
  assert.equal(h.calls.length, 1, "the same replier must be rate-limited per embed");

  await h.message({
    message_id: 13,
    date: 0,
    chat: { id: -100, type: "supergroup", title: "Tests" },
    from: { id: 100, is_bot: false, first_name: "Maria" },
    text: "Resposta de outra pessoa.",
    reply_to_message: replacement,
  });
  assert.equal(h.calls.length, 2, "a different replier gets an independent notification slot");
  assert.match(h.calls[1].payload.text, /Maria respondeu à sua mensagem/);
});

test("The original sender replying to their own replacement is not notified", async () => {
  config.messageStyle = "replace";
  const h = harness();
  await h.message(incoming(ownerId, "supergroup"));
  const replacement = h.sentMessage();
  assert.ok(replacement);

  h.calls.length = 0;
  await h.message({
    message_id: 11,
    date: 0,
    chat: { id: -100, type: "supergroup", title: "Tests" },
    from: { id: ownerId, is_bot: false, first_name: "Tester" },
    text: "Complementando...",
    reply_to_message: replacement,
  });
  assert.deepEqual(h.calls, []);
});

test("Reply routing recovers the author from the bot message after state expires", async () => {
  const h = harness();
  const replacementText = "👤 Louan enviou um link.\n\n🐦 https://fixupx.com/example/status/12345/pt";
  const oldReplacement: Message = {
    message_id: 777,
    date: 0,
    chat: { id: -100, type: "supergroup", title: "Tests" },
    from: botInfo,
    text: replacementText,
    entities: [{ type: "text_link", offset: 3, length: 5, url: "tg://user?id=42" }],
    reply_markup: {
      inline_keyboard: [[{ text: "🐦 Link Original (X / Twitter)", url: originalUrl }]],
    },
  };

  await h.message({
    message_id: 11,
    date: 0,
    chat: { id: -100, type: "supergroup", title: "Tests" },
    from: { id: otherId, is_bot: false, first_name: "Rafael" },
    text: "Ainda concordo.",
    reply_to_message: oldReplacement,
  });

  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].payload.text, /tg:\/\/user\?id=42/);
  assert.match(h.calls[0].payload.text, /Rafael respondeu à sua mensagem/);
});

test("Replies to unrelated bot messages do not trigger author notifications", async () => {
  const h = harness();
  await h.message({
    message_id: 11,
    date: 0,
    chat: { id: -100, type: "supergroup", title: "Tests" },
    from: { id: otherId, is_bot: false, first_name: "Rafael" },
    text: "Resposta normal.",
    reply_to_message: {
      message_id: 778,
      date: 0,
      chat: { id: -100, type: "supergroup", title: "Tests" },
      from: botInfo,
      text: "Mensagem comum do bot",
    },
  });
  assert.deepEqual(h.calls, []);
});
