import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { pickLiveDomain } from "../src/platforms/failover.js";

afterEach(() => mock.restoreAll());

test("failover selects a working alternative before reporting failure", async () => {
  const requestedHosts: string[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const host = new URL(String(input)).hostname;
    requestedHosts.push(host);
    if (host === "unavailable.example") {
      return new Response("Service unavailable", { status: 503 });
    }
    return new Response('<meta property="og:image" content="https://media.example/post.jpg">');
  });

  const selected = await pickLiveDomain(
    "tested-fallback",
    ["unavailable.example", "working.example"],
    "/post/123",
  );

  assert.equal(selected, "working.example");
  assert.ok(requestedHosts.includes("unavailable.example"));
  assert.ok(requestedHosts.includes("working.example"));
});
