import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

// Tests never load a real token or contact Telegram/third-party services.
process.env.BOT_TOKEN = "123456:test-token";
for (const name of Object.keys(process.env)) {
  if (/_FIX_DOMAINS?$/.test(name)) delete process.env[name];
}
process.env.TRANSLATE_LINKS = "true";
process.env.TRANSLATE_LANGUAGE = "pt";
process.env.RESTRICT_ACCESS = "false";
const { config } = await import("../src/config.js");
const { findPlatform, platforms } = await import("../src/platforms/index.js");
const { hasEmbedMetadata, pickLiveDomain } = await import("../src/platforms/failover.js");
const { resolveFinalUrl } = await import("../src/platforms/types.js");
const defaults = structuredClone(config.domains);
let requests: string[];

beforeEach(() => {
  Object.assign(config.domains, structuredClone(defaults));
  requests = [];
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    requests.push(String(input));
    throw new Error(`Unexpected network request: ${input}`);
  });
});
afterEach(() => mock.restoreAll());

async function resolve(input: string) {
  const url = new URL(input);
  const platform = findPlatform(url);
  assert.ok(platform, `Expected a platform for ${input}`);
  return platform.resolve(url);
}

const cases: [string, string, string, string][] = [
  ["Bilibili BV", "https://www.bilibili.com/video/BV1Xy4y1A7Ys?spm_id_from=333#reply", "https://bilibili.com/video/BV1Xy4y1A7Ys", "bilibiliez.com"],
  ["Bilibili AV", "http://m.bilibili.com/video/av1074402/", "https://bilibili.com/video/av1074402", "bilibiliez.com"],
  ["Bilibili multipart", "https://www.bilibili.com/video/BV1ms411Q7vw/?p=4&t=31.5&share_source=copy", "https://bilibili.com/video/BV1ms411Q7vw?p=4&t=31.5", "bilibiliez.com"],
  ["Bilibili invalid selectors", "https://bilibili.com/video/BV1Xy4y1A7Ys?p=-1&t=oops", "https://bilibili.com/video/BV1Xy4y1A7Ys", "bilibiliez.com"],
  ["Bilibili festival", "https://www.bilibili.com/festival/2023honkaiimpact3gala?bvid=BV1ay4y1d77f&p=2&share=1", "https://bilibili.com/video/BV1ay4y1d77f?p=2", "bilibiliez.com"],
  ["Bilibili dynamic", "https://t.bilibili.com/998134289197432852?share=1", "https://bilibili.com/opus/998134289197432852", "bilibiliez.com"],
  ["Bilibili opus", "https://www.bilibili.com/opus/998134289197432852/", "https://bilibili.com/opus/998134289197432852", "bilibiliez.com"],
  ["Bilibili episode", "https://www.bilibili.com/bangumi/play/ep21495/?from=search", "https://bilibili.com/bangumi/play/ep21495", "bilibiliez.com"],
  ["Bilibili season", "https://www.bilibili.com/bangumi/play/ss26801", "https://bilibili.com/bangumi/play/ss26801", "bilibiliez.com"],
  ["Bilibili audio", "https://www.bilibili.com/audio/au1003142", "https://bilibili.com/audio/au1003142", "bilibiliez.com"],
  ["Imgur image", "https://imgur.com/TUf9TF8?utm_source=share", "https://imgur.com/TUf9TF8", "imgurez.com"],
  ["Imgur image with extension", "https://www.imgur.com/TUf9TF8.png", "https://imgur.com/TUf9TF8", "imgurez.com"],
  ["Imgur descriptive post", "https://imgur.com/mrw-gifv-is-up-running-without-any-bugs-A61SaA1", "https://imgur.com/A61SaA1", "imgurez.com"],
  ["Imgur video", "https://imgur.com/crGpqCV.mp4", "https://imgur.com/crGpqCV", "imgurez.com"],
  ["Imgur GIFV wrapper", "https://i.imgur.com/A61SaA1.gifv", "https://imgur.com/A61SaA1", "imgurez.com"],
  ["Imgur album", "https://imgur.com/a/j6Orj?utm_medium=copy", "https://imgur.com/a/j6Orj", "imgurez.com"],
  ["Imgur album slug", "https://m.imgur.com/a/enen-no-shouboutai-iX265HX/", "https://imgur.com/a/iX265HX", "imgurez.com"],
  ["Imgur gallery slug", "https://imgur.com/gallery/imgur-album-links-xK77p", "https://imgur.com/gallery/xK77p", "imgurez.com"],
  ["Imgur gallery selected image", "https://imgur.com/gallery/xK77p?source=share#TUf9TF8", "https://imgur.com/gallery/xK77p#TUf9TF8", "imgurez.com"],
  ["Imgur album index", "https://imgur.com/a/xK77p#2", "https://imgur.com/a/xK77p#2", "imgurez.com"],
  ["Imgur topic post", "https://imgur.com/t/unmuted/penguins-penguins-6lAn9VQ", "https://imgur.com/gallery/6lAn9VQ", "imgurez.com"],
  ["Imgur legacy topic", "http://imgur.com/topic/Aww/ll5Vk", "https://imgur.com/gallery/ll5Vk", "imgurez.com"],
  ["Imgur subreddit gallery", "https://imgur.com/r/aww/VQcQPhM", "https://imgur.com/gallery/VQcQPhM", "imgurez.com"],
  ["iFunny picture", "https://ifunny.co/picture/camp-aga-dad-camprigh-3pECLibx9?s=cl", "https://ifunny.co/picture/camp-aga-dad-camprigh-3pECLibx9", "ifunnyez.co"],
  ["iFunny video", "https://www.ifunny.co/video/GirTjZTaB/", "https://ifunny.co/video/GirTjZTaB", "ifunnyez.co"],
  ["iFunny Brazil", "https://br.ifunny.co/video/i2V9Zm2YB?s=cl", "https://ifunny.co/video/i2V9Zm2YB", "ifunnyez.co"],
  ["iFunny gif", "https://ifunny.co/gif/example-3pECLibx9", "https://ifunny.co/gif/example-3pECLibx9", "ifunnyez.co"],
  ["iFunny meme", "https://ifunny.co/meme/example-3pECLibx9", "https://ifunny.co/meme/example-3pECLibx9", "ifunnyez.co"],
  ["Pinterest pin", "https://www.pinterest.com/pin/664281013778109217/?utm_source=copy", "https://pinterest.com/pin/664281013778109217/", "pinterestez.com"],
  ["Pinterest regional subdomain", "https://br.pinterest.com/pin/664281013778109217/", "https://pinterest.com/pin/664281013778109217/", "pinterestez.com"],
  ["Pinterest country domain", "https://www.pinterest.ca/pin/441282463481903715/", "https://pinterest.com/pin/441282463481903715/", "pinterestez.com"],
  ["Pinterest co.uk", "https://www.pinterest.co.uk/pin/441282463481903715/", "https://pinterest.com/pin/441282463481903715/", "pinterestez.com"],
  ["Pinterest SEO slug", "https://uk.pinterest.com/pin/katzenbeschftigung--105553185009177415/", "https://pinterest.com/pin/105553185009177415/", "pinterestez.com"],
  ["Weibo desktop", "https://weibo.com/7827771738/N4xlMvjhI?from=page", "https://weibo.com/7827771738/N4xlMvjhI", "weiboez.com"],
  ["Weibo mobile status", "https://m.weibo.cn/status/4189191225395228?source=copy", "https://weibo.com/0/4189191225395228", "weiboez.com"],
  ["Weibo mobile detail", "https://m.weibo.cn/detail/4189191225395228", "https://weibo.com/0/4189191225395228", "weiboez.com"],
  ["Weibo TV", "https://weibo.com/tv/show/1034:4797699866951785?from=old_pc_videoshow", "https://weibo.com/tv/show/1034:4797699866951785", "weiboez.com"],
  ["Weibo video fid", "https://video.weibo.com/show?fid=1034%3A4967272104787984&from=share", "https://weibo.com/tv/show/1034:4967272104787984", "weiboez.com"],
  ["Snapchat Spotlight", "https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYeG9xcGd0ZWd3AZ14BVv0AZ14BQkrAAAAAQ?share_id=1", "https://snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYeG9xcGd0ZWd3AZ14BVv0AZ14BQkrAAAAAQ", "snapchatez.com"],
  ["Snapchat creator Spotlight", "https://www.snapchat.com/@nasa/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYeG9xcGd0ZWd3AZ14BVv0AZ14BQkrAAAAAQ", "https://snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYeG9xcGd0ZWd3AZ14BVv0AZ14BQkrAAAAAQ", "snapchatez.com"],
  ["Snapchat public snap", "https://www.snapchat.com/add/creator/snap-id?share_id=1", "https://snapchat.com/add/creator/snap-id", "snapchatez.com"],
  ["Newgrounds art", "https://www.newgrounds.com/art/view/dragonofaura/cat-front-view?utm_source=copy", "https://newgrounds.com/art/view/dragonofaura/cat-front-view", "newgroundsez.com"],
  ["Newgrounds audio", "https://www.newgrounds.com/audio/listen/1000000", "https://newgrounds.com/audio/listen/1000000", "newgroundsez.com"],
  ["Newgrounds portal", "https://www.newgrounds.com/portal/view/310495", "https://newgrounds.com/portal/view/310495", "newgroundsez.com"],
];

for (const [name, input, original, domain] of cases) {
  test(`manual conversion: ${name}`, async () => {
    const fixed = new URL(original);
    fixed.hostname = domain;
    assert.deepEqual(await resolve(input), { original, fixed: fixed.toString() });
    assert.deepEqual(requests, [], "Full URLs must not depend on upstream access or an API");
    assert.equal(findPlatform(fixed), undefined, "Already fixed links must not loop");
  });
}

const ignored = [
  "https://bilibili.com/", "https://space.bilibili.com/3985676", "https://bilibili.com/video/BVbad",
  "https://bilibili.com/video/BV1Xy4y1A7Ys/extra", "https://bilibili.com/festival/foo?bvid=bad",
  "https://live.bilibili.com/123", "https://imgur.com/", "https://imgur.com/about",
  "https://imgur.com/account", "https://imgur.com/privacy", "https://imgur.com/gallery/",
  "https://imgur.com/t/cats", "https://imgur.com/user/person", "https://imgur.com/a/abc/extra",
  "https://i.imgur.com/TUf9TF8.png", "https://i.imgur.com/TUf9TF8.jpg", "https://i.imgur.com/crGpqCV.mp4",
  "https://i.imgur.com/A61SaA1.gif", "https://ifunny.co/", "https://ifunny.co/user/person",
  "https://ifunny.co/tags/cat", "https://ifunny.co/video/", "https://pinterest.com/",
  "https://pinterest.com/creator/board/", "https://pinterest.com/pin/not-a-pin/",
  "https://pinterest.com/pin/123/extra", "https://pinterest.evil/pin/123/",
  "https://weibo.com/u/7827771738", "https://weibo.com/7827771738", "https://m.weibo.cn/",
  "https://video.weibo.com/show?fid=broken", "https://snapchat.com/add/nasa", "https://snapchat.com/@nasa",
  "https://snapchat.com/spotlight", "https://snapchat.com/lens/abc", "https://newgrounds.com/",
  "https://newgrounds.com/bbs/topic/123", "https://newgrounds.com/audio/listen/abc",
  "https://newgrounds.com/portal/view/310495/extra", "https://artist.newgrounds.com/",
  "https://imgur.com.evil/TUf9TF8", "https://evilpinterest.com/pin/123",
  "https://ifunny.co@evil.test/picture/abc", "https://user:pass@imgur.com/TUf9TF8",
  "https://pinterest.com:444/pin/123/", "ftp://imgur.com/TUf9TF8",
];
test("Rejects profiles, boards, malformed paths, direct media and lookalike hosts", () => {
  for (const url of ignored) assert.equal(findPlatform(new URL(url)), undefined, url);
});

function routeFetch(routes: Record<string, string | number>) {
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    const result = routes[url];
    assert.notEqual(result, undefined, `Unexpected URL: ${url}`);
    return typeof result === "string"
      ? new Response(null, { status: 302, headers: { location: result } })
      : new Response("", { status: result });
  });
}

test("Bilibili b23.tv expands to a multipart post, with query selectors intact", async () => {
  routeFetch({
    "https://b23.tv/AbCd": "https://www.bilibili.com/video/BV1Xy4y1A7Ys?p=2&share=1",
    "https://www.bilibili.com/video/BV1Xy4y1A7Ys?p=2&share=1": 200,
  });
  assert.deepEqual(await resolve("https://b23.tv/AbCd"), {
    original: "https://bilibili.com/video/BV1Xy4y1A7Ys?p=2",
    fixed: "https://bilibiliez.com/video/BV1Xy4y1A7Ys?p=2",
  });
});

test("Pinterest pin.it follows its API shortener hop to a regional pin", async () => {
  routeFetch({
    "https://pin.it/AbCd": "https://api.pinterest.com/url_shortener/AbCd/redirect/",
    "https://api.pinterest.com/url_shortener/AbCd/redirect/": "https://br.pinterest.com/pin/664281013778109217/?source=share",
    "https://br.pinterest.com/pin/664281013778109217/?source=share": 200,
  });
  assert.equal((await resolve("https://pin.it/AbCd"))?.fixed, "https://pinterestez.com/pin/664281013778109217/");
});

test("Snapchat /t/ expands only to public content", async () => {
  routeFetch({
    "https://snapchat.com/t/AbCd": "https://www.snapchat.com/@nasa/spotlight/ABC_123",
    "https://www.snapchat.com/@nasa/spotlight/ABC_123": 200,
  });
  assert.equal((await resolve("https://snapchat.com/t/AbCd"))?.fixed, "https://snapchatez.com/spotlight/ABC_123");
});

test("Snapchat legacy t.snapchat.com shortlinks expand to public content", async () => {
  routeFetch({
    "https://t.snapchat.com/AbCd": "https://www.snapchat.com/spotlight/ABC_123",
    "https://www.snapchat.com/spotlight/ABC_123": 200,
  });
  assert.equal((await resolve("https://t.snapchat.com/AbCd"))?.fixed, "https://snapchatez.com/spotlight/ABC_123");
});

test("Expired shortlinks that land on a home page or board are ignored", async () => {
  routeFetch({
    "https://b23.tv/dead": "https://bilibili.com/", "https://bilibili.com/": 200,
    "https://pin.it/dead": "https://pinterest.com/user/board/", "https://pinterest.com/user/board/": 200,
    "https://snapchat.com/t/dead": "https://snapchat.com/add/nasa", "https://snapchat.com/add/nasa": 200,
  });
  for (const url of ["https://b23.tv/dead", "https://pin.it/dead", "https://snapchat.com/t/dead"]) {
    assert.equal(await resolve(url), null, url);
  }
});

test("Shortlinks fail safely on network errors", async () => {
  for (const url of ["https://b23.tv/dead", "https://pin.it/dead", "https://snapchat.com/t/dead"]) {
    assert.equal(await resolve(url), null);
  }
});

test("Redirects cannot leave their platform, use credentials, ports or private addresses", async () => {
  const blocked = ["http://127.0.0.1/", "http://169.254.169.254/latest/", "http://[::1]/", "https://evil.test/pin/123", "https://pinterest.com.evil/pin/123", "https://pinterest.com:8443/pin/123", "https://user:pass@pinterest.com/pin/123", "file:///secret"];
  for (const location of blocked) {
    requests = [];
    routeFetch({ "https://pin.it/unsafe": location });
    assert.equal(await resolve("https://pin.it/unsafe"), null, location);
    assert.deepEqual(requests, ["https://pin.it/unsafe"], "Rejected destinations must never be fetched");
  }
});

test("Redirect loops stop at the hop limit", async () => {
  routeFetch({ "https://b23.tv/loop": "/loop" });
  assert.equal(await resolve("https://b23.tv/loop"), null);
  assert.equal(requests.length, 6);
});

test("All new manual providers honor configured domains", async () => {
  for (const id of ["bilibili", "imgur", "ifunny", "pinterest", "weibo", "snapchat", "newgrounds"] as const) {
    config.domains[id] = `${id}.example.com`;
    const entry = cases.find(([, input]) => findPlatform(new URL(input))?.id === id)!;
    const result = await resolve(entry[1]);
    assert.equal(new URL(result!.fixed).hostname, `${id}.example.com`);
    assert.equal(result!.original, entry[2]);
  }
});

test("Twitter and Bluesky still use FxEmbed, including translation", async () => {
  assert.equal((await resolve("https://x.com/nasa/status/12345"))?.fixed, "https://fixupx.com/nasa/status/12345/pt");
  assert.equal((await resolve("https://bsky.app/profile/nasa.gov/post/abc123"))?.fixed, "https://fxbsky.app/profile/nasa.gov/post/abc123/pt");
});

test("TikTok manual override supports videos and photo slideshows without fetching TikTok", async () => {
  config.domains.tiktok = ["tiktokez.com"];
  for (const kind of ["video", "photo"]) {
    assert.deepEqual(await resolve(`https://www.tiktok.com/@creator/${kind}/12345?_t=tracking`), {
      original: `https://tiktok.com/@creator/${kind}/12345`, fixed: `https://tiktokez.com/@creator/${kind}/12345`,
    });
  }
  assert.deepEqual(requests, []);
});

test("TikTok live stays native", async () => {
  assert.deepEqual(await resolve("https://www.tiktok.com/@creator/live/?_t=tracking"), {
    original: "https://tiktok.com/@creator/live/", fixed: "https://tiktok.com/@creator/live/",
  });
  assert.deepEqual(requests, []);
});

test("TikTok shortlinks expand before manual conversion", async () => {
  config.domains.tiktok = ["tiktokez.com"];
  routeFetch({
    "https://vt.tiktok.com/code/": "https://www.tiktok.com/@creator/photo/12345?_t=1",
    "https://www.tiktok.com/@creator/photo/12345?_t=1": 200,
  });
  assert.equal((await resolve("https://vt.tiktok.com/code/"))?.fixed, "https://tiktokez.com/@creator/photo/12345");
});

test("TikTok does not rewrite malformed post paths", async () => {
  routeFetch({ "https://www.tiktok.com/@creator/video/12345evil": 200 });
  assert.equal(await resolve("https://www.tiktok.com/@creator/video/12345evil"), null);
});

test("TikTok failover accepts the documented public EmbedEZ redirect for the same post", async () => {
  config.domains.tiktok = ["down.example", "tiktokez.com"];
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url.toString());
    if (url.hostname === "down.example") return new Response("", { status: 503 });
    if (url.hostname === "tiktokez.com") return new Response(null, { status: 302, headers: { location: "https://embedez.com/download?q=https://tiktok.com/@creator/video/12345" } });
    assert.equal(url.hostname, "embedez.com");
    assert.equal(url.pathname, "/download");
    return new Response('<head><meta property="og:video:url" content="https://media.example/video.mp4"></head>');
  });
  assert.equal((await resolve("https://tiktok.com/@creator/video/12345"))?.fixed, "https://tiktokez.com/@creator/video/12345");
  assert.ok(requests.some((url) => url.startsWith("https://embedez.com/download?")));
});

test("EmbedEZ redirect exception rejects unrelated posts, private q URLs and API paths", async () => {
  mock.method(console, "warn", () => {});
  for (const location of [
    "https://embedez.com/api/v1/providers/combined", "https://embedez.com/download?q=http://127.0.0.1/",
    "https://embedez.com/download?q=https://reddit.com/comments/other", "https://evil.embedez.com/download?q=https://reddit.com/comments/abc",
    "https://embedez.com/download?q=https://reddit.com.evil/comments/abc",
    "https://embedez.com/download?q=https://user:pass@reddit.com/comments/abc",
  ]) {
    requests = [];
    routeFetch({ "https://redditez.com/comments/abc": location });
    await pickLiveDomain(`unsafe-${location}`, ["redditez.com"], "/comments/abc", "title");
    assert.deepEqual(requests, ["https://redditez.com/comments/abc"]);
  }
});

test("A redirect to a generic page without metadata is not treated as a working embed", async () => {
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname === "redditez.com") return new Response(null, { status: 307, headers: { location: "https://embedez.com/download?q=http://reddit.com/comments/abc" } });
    if (url.hostname === "embedez.com") return new Response("<html><body>Download a link</body></html>");
    return new Response('<meta property="og:title" content="The actual post">');
  });
  assert.equal(await pickLiveDomain("generic-page", ["redditez.com", "working.example"], "/comments/abc", "title"), "working.example");
});

test("Probe recognizes actual EmbedEZ video metadata and rejects empty/dimension-only tags", () => {
  for (const html of [
    '<meta property="og:video:url" content="https://media.example/video.mp4"/>',
    "<meta content='https://media.example/picture.jpg' property='og:image:secure_url'>",
    '<META CONTENT="https://media.example/picture.jpg" PROPERTY="og:image">',
    '<meta name="og:video" content="https://media.example/video.mp4">',
  ]) assert.equal(hasEmbedMetadata(html, "media"), true, html);
  for (const html of [
    '<meta property="og:image" content="">', '<meta property="og:video" content="   ">',
    '<meta property="og:video:width" content="1080">', '<meta property="og:video:type" content="video/mp4">',
    '<meta property="og:title" content="Download videos">', '<meta property="og:image">',
  ]) assert.equal(hasEmbedMetadata(html, "media"), false, html);
  assert.equal(hasEmbedMetadata('<meta property="og:title" content="Text-only Reddit post">', "title"), true);
});

test("Failover honors configured priority, remembers its winner and drops removed domains", async () => {
  const requestedHosts: string[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const host = new URL(String(input)).hostname;
    requestedHosts.push(host);
    return host === "down.example" ? new Response("", { status: 503 }) : new Response('<meta property="og:image" content="https://example.com/pic.jpg">');
  });
  assert.equal(await pickLiveDomain("priority", ["down.example", "first.example", "second.example"], "/post"), "first.example");
  requestedHosts.length = 0;
  assert.equal(await pickLiveDomain("priority", ["down.example", "first.example", "second.example"], "/post"), "first.example");
  assert.deepEqual([...new Set(requestedHosts)], ["first.example"]);
  requestedHosts.length = 0;
  assert.equal(await pickLiveDomain("priority", ["second.example"], "/post"), "second.example");
  assert.deepEqual([...new Set(requestedHosts)], ["second.example"]);
});

test("Reddit short IDs normalize to a route shared by Reddit and RedditEZ", async () => {
  config.domains.reddit = ["redditez.com"];
  mock.method(globalThis, "fetch", async () => new Response('<meta property="og:title" content="Text post">'));
  assert.deepEqual(await resolve("https://redd.it/abc123?utm_source=copy"), {
    original: "https://reddit.com/comments/abc123", fixed: "https://redditez.com/comments/abc123",
  });
});

test("Reddit share tokens expand to a post before a backend is selected", async () => {
  config.domains.reddit = ["redditez.com"];
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    if (String(input) === "https://www.reddit.com/r/test/s/ShareCode") {
      return new Response(null, { status: 302, headers: { location: "https://www.reddit.com/r/test/comments/abc123/title/?share=1" } });
    }
    return new Response('<meta property="og:title" content="Text post">');
  });
  assert.equal((await resolve("https://www.reddit.com/r/test/s/ShareCode"))?.fixed, "https://redditez.com/r/test/comments/abc123/title/");
});

test("Unresolved Reddit share tokens do not become invalid RedditEZ links", async () => {
  routeFetch({ "https://www.reddit.com/r/test/s/ShareCode": 200 });
  assert.equal(await resolve("https://www.reddit.com/r/test/s/ShareCode"), null);
});

test("Registry contains each of the 19 platforms once", () => {
  assert.equal(platforms.length, 19);
  assert.equal(new Set(platforms.map((p) => p.id)).size, 19);
});

test("Core redirect helper still refuses off-platform redirects", async () => {
  routeFetch({ "https://t.co/test": "https://evil.test/status/123" });
  assert.equal(await resolveFinalUrl("https://t.co/test", ["t.co", "x.com", "twitter.com"]), null);
  assert.deepEqual(requests, ["https://t.co/test"]);
});

test("Group messages emit one reply per new platform and deduplicate canonical links", async () => {
  const { Bot } = await import("grammy");
  const { registerMessageHandler } = await import("../src/handlers/message.js");
  const bot = new Bot("123456:test-token", { botInfo: { id: 123456, is_bot: true, first_name: "Test", username: "test_bot", can_join_groups: true, can_read_all_group_messages: true, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false } });
  const sent: Record<string, any>[] = [];
  bot.api.config.use(async (_previous, method, payload) => {
    assert.equal(method, "sendMessage");
    sent.push(payload);
    return { ok: true, result: { message_id: sent.length, date: 0, chat: { id: -100, type: "supergroup", title: "Tests" }, text: "reply" } } as any;
  });
  registerMessageHandler(bot);
  const input = ["bilibili", "imgur", "ifunny", "pinterest", "weibo", "snapchat", "newgrounds"]
    .map((id) => cases.find(([, url]) => findPlatform(new URL(url))?.id === id)!);
  await bot.handleUpdate({
    update_id: 1,
    message: { message_id: 1, date: 0, chat: { id: -100, type: "supergroup", title: "Tests" }, from: { id: 42, is_bot: false, first_name: "Tester" },
      caption: input.map(([, url]) => url).join("\n") + "\nhttps://imgur.com/TUf9TF8", },
  });
  assert.equal(sent.length, 7);
  for (const [index, payload] of sent.entries()) {
    assert.ok(payload.text.includes('tg://user?id=42'));
    assert.equal(payload.reply_parameters.message_id, 1);
    assert.equal(new URL(payload.link_preview_options.url).hostname, input[index][3]);
    assert.ok(payload.reply_markup.inline_keyboard.flat().some((button: any) => button.url === input[index][2]));
  }
  assert.deepEqual(requests, []);
});
