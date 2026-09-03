import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function domains(overrides: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/_FIX_DOMAINS?$/.test(key)) delete env[key];
  Object.assign(env, { BOT_TOKEN: "123456:test-token" }, overrides);
  return JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", 'import { config } from "./src/config.ts"; console.log(JSON.stringify(config.domains))'], { env, encoding: "utf8" }));
}

test("Defaults preserve the requested Instagram/Reddit lists and FxEmbed", () => {
  const value = domains();
  assert.deepEqual(value.instagram, ["eeinstagram.com", "kkinstagram.com", "n.zzinstagram.com", "toinstagram.com", "fxig.seria.moe"]);
  assert.deepEqual(value.reddit, ["rxddit.com", "vxreddit.com", "redditfix.com"]);
  assert.deepEqual(value.bilibili, ["vxbilibili.com"]);
  assert.equal(value.tiktok, "tfxktok.com");
  assert.equal(value.twitter, "fixupx.com");
  assert.equal(value.bluesky, "fxbsky.app");
});

test("TikTok domain can be overridden", () => {
  assert.equal(domains({ TIKTOK_FIX_DOMAIN: "custom.example" }).tiktok, "custom.example");
});

test(".env.example defines each fixer once and matches code defaults", () => {
  const settings: Record<string, string> = {};
  for (const line of readFileSync(new URL("../.env.example", import.meta.url), "utf8").split(/\r?\n/)) {
    const match = /^(\w+_FIX_DOMAINS?)=(.*)$/.exec(line);
    if (!match) continue;
    assert.ok(!(match[1] in settings), `Duplicate ${match[1]}`);
    settings[match[1]] = match[2];
  }
  assert.deepEqual(domains(settings), domains());
});
