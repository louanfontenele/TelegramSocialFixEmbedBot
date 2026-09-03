import { BROWSER_USER_AGENT, resolveFinalUrl } from "./types.js";

const PROBE_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
// Only the <head> og: tags are ever needed, so a probe response is read up
// to this many bytes and no further - caps memory/time if a backend (or
// whatever it redirects to) streams back something huge.
const MAX_PROBE_BYTES = 64 * 1024;

/**
 * What counts as a working embed. Instagram always carries media, so a page
 * without it is an error page; Reddit text posts legitimately have none, and
 * a title is the strongest signal available there.
 */
export type EmbedKind = "media" | "title";

const EMBED_PATTERNS: Record<EmbedKind, RegExp> = {
  media: /^og:(image|video)(?::(?:url|secure_url))?$/i,
  title: /^og:(title|image|video)(?::(?:url|secure_url))?$/i,
};

/** Accepts `property` and `name`, either attribute order and structured OG
 * URL properties. Empty tags and width/height/type metadata do not prove
 * that a usable preview exists. */
export function hasEmbedMetadata(html: string, requires: EmbedKind): boolean {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes: Record<string, string> = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
      attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
    }
    const name = attributes.property ?? attributes.name ?? "";
    if (EMBED_PATTERNS[requires].test(name) && attributes.content?.trim()) return true;
  }
  return false;
}

interface Cached {
  domain: string;
  chosenAt: number;
}

const lastKnownGood = new Map<string, Cached>();

/**
 * Telegram fetches the embed itself, so the bot has to hand it a domain that
 * is actually serving one: a dead backend yields a bare link with no preview.
 * Public embed fixers get blocked and replaced often (InstaFix's
 * ddinstagram.com went dark once the project was archived), which is why
 * callers pass a list rather than a single domain.
 *
 * Candidates are probed against the real path being shared, so the result
 * reflects whether *this* post embeds rather than whether the service is
 * generally up. The winner is remembered and tried first next time, keeping
 * the common case to a single request.
 */
export async function pickLiveDomain(
  key: string,
  candidates: string[],
  path: string,
  requires: EmbedKind = "media",
): Promise<string | null> {
  if (candidates.length === 0) return null;

  const cached = lastKnownGood.get(key);
  const fresh = cached && candidates.includes(cached.domain) && Date.now() - cached.chosenAt < CACHE_TTL_MS;
  const ordered = fresh
    ? [cached.domain, ...candidates.filter((domain) => domain !== cached.domain)]
    : candidates;

  const [preferred, ...rest] = ordered;

  // Fast path: the preferred backend alone. This is the steady state, and
  // it keeps a normal link to a single request.
  if (await servesEmbed(preferred, path, requires)) {
    lastKnownGood.set(key, { domain: preferred, chosenAt: Date.now() });
    return preferred;
  }

  // It failed, so race the rest instead of walking them one by one - trying
  // five dead backends in series took long enough to stall the reply.
  if (rest.length > 0) {
    const winner = await firstSuccess(rest, path, requires);
    if (winner) {
      lastKnownGood.set(key, { domain: winner, chosenAt: Date.now() });
      return winner;
    }
  }

  // Nothing passed. Preserve the first candidate so the common verifier can
  // reject it and report the failure with the canonical original link. This
  // also keeps direct calls deterministic instead of silently switching to
  // a URL that was already proven invalid.
  console.warn(
    `No ${key} backend served an embed for ${path}. Tried: ${ordered.join(", ")}. ` +
      `Returning ${ordered[0]} for final verification.`,
  );
  return ordered[0];
}

/**
 * Resolves to the first domain that serves an embed, preferring earlier
 * entries when several succeed, and to null if none do. Probes run
 * concurrently, so the wait is one timeout (all of them settle in
 * parallel) rather than one timeout per candidate in series.
 */
async function firstSuccess(domains: string[], path: string, requires: EmbedKind): Promise<string | null> {
  const results = await Promise.all(domains.map((domain) => servesEmbed(domain, path, requires)));
  const index = results.indexOf(true);
  return index === -1 ? null : domains[index];
}

async function servesEmbed(domain: string, path: string, requires: EmbedKind): Promise<boolean> {
  return probeEmbedUrl(`https://${domain}${path}`, requires);
}

/** Checks the exact URL with Telegram's crawler identity. Browser-facing
 * redirects are intentionally irrelevant here: Telegram must receive the
 * metadata itself for the preview to work. */
export async function probeEmbedUrl(url: string, requires: EmbedKind = "title"): Promise<boolean> {
  try {
    const crawlerUserAgent = `TelegramBot (like TwitterBot) ${BROWSER_USER_AGENT}`;
    const initial = new URL(url);
    // Redirects are followed hop-by-hop and pinned to this exact domain,
    // the same guard resolveFinalUrl applies to platform redirects
    // elsewhere - blind `redirect: "follow"` would let a hijacked or
    // compromised fixer domain (several of these are unmaintained) redirect
    // this probe straight into an internal address or metadata endpoint.
    // Use Telegram's crawler identity from the first request. Correct fixer
    // services commonly redirect browsers to the original post while serving
    // Open Graph metadata only to crawlers.
    const final = await resolveFinalUrl(initial.toString(), [initial.hostname], crawlerUserAgent);
    if (!final) return false;

    const response = await fetch(final, {
      // These services vary their output by crawler, so ask as Telegram does.
      headers: { "User-Agent": crawlerUserAgent },
      redirect: "manual",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      return false;
    }

    // Only the <head> og: tags matter, so the body is read in capped
    // chunks rather than buffered whole via response.text().
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let bytesRead = 0;
    try {
      while (bytesRead < MAX_PROBE_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.length;
        html += decoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel().catch(() => {});
    }

    return hasEmbedMetadata(html, requires);
  } catch {
    return false;
  }
}
