export interface Platform {
  id: string;
  label: string;
  emoji: string;
  matches(url: URL): boolean;
  /** Returns the fixed URL, or null if nothing useful could be done with it. */
  resolve(url: URL): Promise<string | null>;
}

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Follows redirects and returns the final URL, or null on failure. */
export async function resolveFinalUrl(url: string): Promise<URL | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    return new URL(response.url);
  } catch {
    return null;
  }
}
