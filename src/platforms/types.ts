export interface Resolved {
  /** The canonical link to the original content: mobile/legacy prefixes
   *  stripped and shortlinks expanded, but otherwise untouched. This is
   *  what the "original link" button points at. */
  original: string;
  /** The embeddable link, rewritten to a fixer domain. */
  fixed: string;
}

export interface Platform {
  id: string;
  label: string;
  emoji: string;
  matches(url: URL): boolean;
  /** Returns null if nothing useful could be done with the link. */
  resolve(url: URL): Promise<Resolved | null>;
}

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 10_000;

/** Hostnames and IP ranges that must never be requested (SSRF guard). */
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, // link-local, incl. cloud metadata at 169.254.169.254
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i, // IPv6 unique-local
  /^\[?fe80:/i, // IPv6 link-local
  /^\[?::ffff:/i, // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) - bypasses the IPv4 patterns above
];

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * Hostname without the interchangeable front-end prefixes the platforms use
 * for mobile, legacy and locale variants, so `m.facebook.com` and
 * `www.facebook.com` are recognized - and displayed - the same way. `URL`
 * already lowercases the host.
 */
export function bareHost(url: URL): string {
  return url.hostname.replace(/^(www|m|mobile|web|music|mbasic|old|new|np|amp|[a-z]{2}-[a-z]{2})\./, "");
}

/** `url` with its mobile/legacy prefix stripped; path, query and hash untouched. */
export function canonicalize(url: URL): URL {
  const canonical = new URL(url.toString());
  canonical.hostname = bareHost(url);
  return canonical;
}

/** True when `hostname` is exactly `domain` or a subdomain of it. */
export function isHostWithin(hostname: string, domains: string[]): boolean {
  const host = hostname.toLowerCase();
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * Follows redirects one hop at a time, refusing to request anything outside
 * `allowedDomains` or pointing at a private/loopback address.
 *
 * Redirects are handled manually rather than with `redirect: "follow"`
 * because platforms like Facebook expose open redirects (`/l.php?u=...`):
 * left unchecked, a posted link could make the bot issue requests against
 * its own network or a cloud metadata endpoint.
 */
export async function resolveFinalUrl(
  start: string,
  allowedDomains: string[],
  allowedUrl?: (url: URL) => boolean,
): Promise<URL | null> {
  let current: URL;
  try {
    current = new URL(start);
  } catch {
    return null;
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "https:" && current.protocol !== "http:") return null;
    if (current.username || current.password || current.port) return null;
    if (isBlockedHost(current.hostname)) return null;
    if (!isHostWithin(current.hostname, allowedDomains)) return null;
    if (allowedUrl && !allowedUrl(current)) return null;

    let response: Response;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": BROWSER_USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return null;
    }

    // Only the Location header matters; never buffer the page itself.
    await response.body?.cancel().catch(() => {});

    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) {
      return current;
    }

    try {
      current = new URL(location, current);
    } catch {
      return null;
    }
  }

  return null;
}
