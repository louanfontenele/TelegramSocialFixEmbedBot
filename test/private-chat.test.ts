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

const ownerId = 42;
const otherId = 99;
const originalUrl = "https://x.com/example/status/12345";
const fixedUrl = "https://fixupx.com/example/status/12345/pt";
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
    assert.ok(["deleteMessage", "answerCallbackQuery"].includes(method), `Unexpected API method ${method}`);
    return { ok: true, result: true } as any;
  });
  registerMessageHandler(bot);
  registerCallbackHandlers(bot);
  return {
    calls,
    unchanged() { unchangedEdit = true; },
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
  assert.match(h.calls[0].payload.text, /Não foi possível validar/);
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
