import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.BOT_TOKEN = "123456:test-token";
process.env.BILIBILI_FIX_DOMAINS = "vxbilibili.com";

const originalFetch = globalThis.fetch;
const seenUserAgents: string[] = [];

before(() => {
  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    seenUserAgents.push(headers.get("user-agent") ?? "");
    if (String(input).includes("example.com/cover.jpg")) {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    }
    return new Response('<meta property="og:image" content="https://example.com/cover.jpg">', {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("Bilibili videos use a Telegram-compatible fixer and discard share tracking", async () => {
  const { bilibili } = await import("../src/platforms/bilibili.js");
  const result = await bilibili.resolve(
    new URL("https://www.bilibili.com/video/BV1Xy4y1A7Ys?p=2&spm_id_from=333.337"),
  );

  assert.deepEqual(result, {
    original: "https://bilibili.com/video/BV1Xy4y1A7Ys?p=2",
    fixed: "https://vxbilibili.com/video/BV1Xy4y1A7Ys?p=2",
  });
  assert.equal(seenUserAgents.length, 4);
  assert.ok(seenUserAgents.every((value) => value.startsWith("TelegramBot")));
});
