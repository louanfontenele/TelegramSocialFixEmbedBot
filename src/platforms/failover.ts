import { BROWSER_USER_AGENT } from "./types.js";

const PROBE_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

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
export async function pickLiveDomain(key: string, candidates: string[], path: string): Promise<string | null> {
  if (candidates.length === 0) return null;

  const cached = lastKnownGood.get(key);
  const fresh = cached && Date.now() - cached.chosenAt < CACHE_TTL_MS;
  const ordered = fresh
    ? [cached.domain, ...candidates.filter((domain) => domain !== cached.domain)]
    : candidates;

  for (const domain of ordered) {
    if (await servesEmbed(domain, path)) {
      lastKnownGood.set(key, { domain, chosenAt: Date.now() });
      return domain;
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

async function servesEmbed(domain: string, path: string): Promise<boolean> {
  try {
    const response = await fetch(`https://${domain}${path}`, {
      // These services vary their output by crawler, so ask as Telegram does.
      headers: { "User-Agent": `TelegramBot (like TwitterBot) ${BROWSER_USER_AGENT}` },
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return false;
    }

    return /property="og:(image|video)"/i.test(await response.text());
  } catch {
    return false;
  }
}
