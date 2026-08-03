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
  media: /property="og:(image|video)"/i,
  title: /property="og:(title|image|video)"/i,
};

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
  const fresh = cached && Date.now() - cached.chosenAt < CACHE_TTL_MS;
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

  // Nothing passed. Still answer with the first candidate: a link whose
  // preview fails is visible and debuggable, whereas staying silent looks
  // like the bot is broken. The warning names the cause.
  console.warn(
    `No ${key} backend served an embed for ${path}. Tried: ${ordered.join(", ")}. ` +
      `Replying with ${ordered[0]} anyway.`,
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
  try {
    // Redirects are followed hop-by-hop and pinned to this exact domain,
    // the same guard resolveFinalUrl applies to platform redirects
    // elsewhere - blind `redirect: "follow"` would let a hijacked or
    // compromised fixer domain (several of these are unmaintained) redirect
    // this probe straight into an internal address or metadata endpoint.
    const final = await resolveFinalUrl(`https://${domain}${path}`, [domain]);
    if (!final) return false;

    const response = await fetch(final, {
      // These services vary their output by crawler, so ask as Telegram does.
      headers: { "User-Agent": `TelegramBot (like TwitterBot) ${BROWSER_USER_AGENT}` },
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

    return EMBED_PATTERNS[requires].test(html);
  } catch {
    return false;
  }
}
