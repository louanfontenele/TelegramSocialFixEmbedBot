import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { pickLiveDomain } from "../src/platforms/failover.js";

afterEach(() => mock.restoreAll());

test("failover selects a working alternative before reporting failure", async () => {
  const requestedHosts: string[] = [];
  let principalRequests = 0;
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const host = new URL(String(input)).hostname;
    requestedHosts.push(host);
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
