import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { pickLiveDomain } from "../src/platforms/failover.js";

afterEach(() => mock.restoreAll());

test("failover selects a working alternative before reporting failure", async () => {
  const requestedHosts: string[] = [];
  let principalRequests = 0;
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const requestUrl = new URL(String(input));
    const host = requestUrl.hostname;
    requestedHosts.push(host);
    if (host === "media.example") {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        headers: { "content-type": "image/jpeg" },
      });
    }
    if (host === "unavailable.example") {
      principalRequests += 1;
      return new Response("Service unavailable", { status: 503 });
    }
    assert.equal(principalRequests, 2, "fallbacks must start only after the principal fails");
    if (host === "slow.example") await delay(30);
    return new Response('<meta property="og:image" content="https://media.example/post.jpg">');
  });

  const selected = await pickLiveDomain(
    "tested-fallback",
    ["unavailable.example", "slow.example", "working.example"],
    "/post/123",
  );

  assert.equal(selected, "working.example");
  assert.ok(requestedHosts.includes("unavailable.example"));
  assert.ok(requestedHosts.includes("slow.example"));
  assert.ok(requestedHosts.includes("working.example"));
});

test("failover rejects an og:image URL that actually serves video", async () => {
  const requestedHosts: string[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const requestUrl = new URL(String(input));
    requestedHosts.push(requestUrl.hostname);

    if (requestUrl.pathname.endsWith(".mp4")) {
      return new Response(new Uint8Array([0, 0, 0, 24]), {
        headers: { "content-type": "video/mp4" },
      });
    }
    if (requestUrl.hostname === "broken.example") {
      return new Response('<meta property="og:image" content="https://broken.example/media.mp4">');
    }
    if (requestUrl.pathname.endsWith(".jpg")) {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        headers: { "content-type": "image/jpeg" },
      });
    }
    return new Response('<meta property="og:image" content="https://healthy.example/cover.jpg">');
  });

  const selected = await pickLiveDomain(
    "media-type-check",
    ["broken.example", "healthy.example"],
    "/post/123",
  );

  assert.equal(selected, "healthy.example");
  assert.ok(requestedHosts.includes("broken.example"));
  assert.ok(requestedHosts.includes("healthy.example"));
});

test("failover rejects a video embed whose cover works but video is empty", async () => {
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const requestUrl = new URL(String(input));
    if (requestUrl.pathname.endsWith(".jpg")) {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        headers: { "content-type": "image/jpeg" },
      });
    }
    if (requestUrl.pathname.endsWith(".mp4")) {
      const working = requestUrl.hostname === "complete.example";
      return new Response(working ? new Uint8Array([0, 0, 0, 24]) : new Uint8Array(), {
        headers: { "content-type": "video/mp4" },
      });
    }
    return new Response(
      `<meta property="og:image" content="https://${requestUrl.hostname}/cover.jpg">` +
      `<meta property="og:video" content="https://${requestUrl.hostname}/clip.mp4">` +
      '<meta property="og:video:type" content="video/mp4">',
    );
  });

  const selected = await pickLiveDomain(
    "complete-video-check",
    ["empty-video.example", "complete.example"],
    "/post/123",
  );

  assert.equal(selected, "complete.example");
});

test("failover rejects a direct video larger than Telegram's remote-media limit", async () => {
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const requestUrl = new URL(String(input));
    if (requestUrl.pathname.endsWith(".mp4")) {
      const oversized = requestUrl.hostname === "oversized.example";
      return new Response(new Uint8Array([0, 0, 0, 24]), {
        headers: {
          "content-type": "video/mp4",
          "content-length": String(oversized ? 20 * 1024 * 1024 + 1 : 1024),
        },
      });
    }
    return new Response(
      `<meta property="og:image" content="https://${requestUrl.hostname}/clip.mp4">` +
      `<meta property="og:video" content="https://${requestUrl.hostname}/clip.mp4">` +
      '<meta property="og:video:type" content="video/mp4">',
    );
  });

  const selected = await pickLiveDomain(
    "video-size-check",
    ["oversized.example", "within-limit.example"],
    "/reel/123",
  );

  assert.equal(selected, "within-limit.example");
});
