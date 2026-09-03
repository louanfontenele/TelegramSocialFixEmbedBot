import type { Resolved } from "./types.js";

/** Manual domain swap: Telegram fetches the public link, not a paid API.
 * Callers supply a normalized HTTPS content URL with only meaningful params. */
export function rewriteManualLink(original: URL, domain: string): Resolved {
  const fixed = new URL(original);
  fixed.hostname = domain;
  return { original: original.toString(), fixed: fixed.toString() };
}
