import { BROWSER_USER_AGENT, resolveFinalUrl } from "./types.js";

const PROBE_TIMEOUT_MS = 5_000;
// Only the <head> og: tags are ever needed, so a probe response is read up
// to this many bytes and no further - caps memory/time if a backend (or
// whatever it redirects to) streams back something huge.
const MAX_PROBE_BYTES = 64 * 1024;
const MAX_MEDIA_CANDIDATES = 4;
// Telegram documents these limits when it fetches media from an HTTP URL.
// Its webpage-preview fetcher is not exposed, so these are conservative
// upper bounds for deciding whether a remote preview is safe to publish.
const MAX_REMOTE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REMOTE_VIDEO_BYTES = 20 * 1024 * 1024;

/**
 * What counts as a working embed. Instagram always carries media, so a page
 * without it is an error page; Reddit text posts legitimately have none, and
 * a title is the strongest signal available there.
 */
export type EmbedKind = "media" | "title";

const IMAGE_METADATA_PATTERN = /^(?:og|twitter):image(?::(?:url|secure_url|src))?$/i;
const VIDEO_METADATA_PATTERN = /^og:video(?::(?:url|secure_url))?$/i;

const EMBED_PATTERNS: Record<EmbedKind, RegExp> = {
  media: /^(?:og|twitter):(image|video)(?::(?:url|secure_url|src))?$/i,
  title: /^og:(title|image|video)(?::(?:url|secure_url))?$/i,
};

interface EmbedMetadata {
  name: string;
  content: string;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractEmbedMetadata(html: string): EmbedMetadata[] {
  const metadata: EmbedMetadata[] = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes: Record<string, string> = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
      attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
    }
    const name = attributes.property ?? attributes.name ?? "";
    const content = decodeHtmlAttribute(attributes.content?.trim() ?? "");
    if (name && content) metadata.push({ name, content });
  }
  return metadata;
}

/** Accepts `property` and `name`, either attribute order and structured OG
 * URL properties. Empty tags and width/height/type metadata do not prove
 * that a usable preview exists. */
export function hasEmbedMetadata(html: string, requires: EmbedKind): boolean {
  return extractEmbedMetadata(html).some(({ name }) => EMBED_PATTERNS[requires].test(name));
}

type MediaResourceKind = "image" | "video";

/** A declared media URL is useful only if it resolves to non-empty bytes of
 * the advertised kind. Some fixers incorrectly put an MP4 URL in og:image;
 * Telegram then renders a title-only shell despite the metadata tag. */
async function servesUsableMediaResource(
  rawUrl: string,
  pageUrl: URL,
  crawlerUserAgent: string,
  kind: MediaResourceKind,
): Promise<boolean> {
  let mediaUrl: URL;
  try {
    mediaUrl = new URL(rawUrl, pageUrl);
  } catch {
    return false;
  }

  if (mediaUrl.protocol !== "https:" && mediaUrl.protocol !== "http:") return false;
  const final = await resolveFinalUrl(mediaUrl.toString(), [mediaUrl.hostname], crawlerUserAgent);
  if (!final) return false;

  let response: Response;
  try {
    response = await fetch(final, {
      headers: { "User-Agent": crawlerUserAgent },
      redirect: "manual",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return false;
  }

  if (!response.ok || !response.body || !response.headers.get("content-type")?.toLowerCase().startsWith(`${kind}/`)) {
    await response.body?.cancel().catch(() => {});
    return false;
  }
  if (response.headers.get("content-length") === "0") {
    await response.body.cancel().catch(() => {});
    return false;
  }
  const contentLength = Number(response.headers.get("content-length"));
  const maxBytes = kind === "image" ? MAX_REMOTE_IMAGE_BYTES : MAX_REMOTE_VIDEO_BYTES;
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body.cancel().catch(() => {});
    return false;
  }

  const reader = response.body.getReader();
  try {
    const firstChunk = await reader.read();
    return !firstChunk.done && firstChunk.value.length > 0;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/**
 * Telegram fetches the embed itself, so the bot has to hand it a domain that
 * is actually serving one: a dead backend yields a bare link with no preview.
 * Public embed fixers get blocked and replaced often (InstaFix's
 * ddinstagram.com went dark once the project was archived), which is why
 * callers pass a list rather than a single domain.
 *
 * Candidates are probed against the real path being shared, so the result
 * reflects whether *this* post embeds rather than whether the service is
 * generally up. The first configured domain is always tested alone. Only
 * if it fails are all remaining domains raced concurrently.
 */
export async function pickLiveDomain(
  key: string,
  candidates: string[],
  path: string,
  requires: EmbedKind = "media",
): Promise<string | null> {
  if (candidates.length === 0) return null;

  const [preferred, ...rest] = candidates;

  // Fast path: the preferred backend alone. This is the steady state, and
  // it keeps a normal link to a single request.
  if (await servesEmbed(preferred, path, requires)) {
    return preferred;
  }

  // It failed, so race the rest instead of walking them one by one - trying
  // five dead backends in series took long enough to stall the reply.
  if (rest.length > 0) {
    const winner = await firstSuccess(rest, path, requires);
    if (winner) return winner;
  }

  // Nothing passed. Preserve the first candidate so the common verifier can
  // reject it and report the failure with the canonical original link. This
  // also keeps direct calls deterministic instead of silently switching to
  // a URL that was already proven invalid.
  console.warn(
    `No ${key} backend served an embed for ${path}. Tried: ${candidates.join(", ")}. ` +
      `Returning ${candidates[0]} for final verification.`,
  );
  return candidates[0];
}

/**
 * Resolves as soon as one fallback serves an embed, and to null if none do.
 * All fallback probes run concurrently, so a slow earlier fallback cannot
 * delay a healthy later one.
 */
async function firstSuccess(domains: string[], path: string, requires: EmbedKind): Promise<string | null> {
  try {
    return await Promise.any(
      domains.map(async (domain) => {
        if (await servesEmbed(domain, path, requires)) return domain;
        throw new Error(`${domain} did not serve an embed`);
      }),
    );
  } catch (error) {
    if (error instanceof AggregateError) return null;
    throw error;
  }
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

    const metadata = extractEmbedMetadata(html);
    if (requires === "title") {
      return metadata.some(({ name }) => EMBED_PATTERNS.title.test(name));
    }

    // Direct video is the complete media for a Reel or clip. A separate image
    // is optional because some working Instagram fixers intentionally repeat
    // the MP4 URL in og:image and Telegram still renders smaller videos.
    const videoUrls = metadata
      .filter(({ name }) => VIDEO_METADATA_PATTERN.test(name))
      .slice(0, MAX_MEDIA_CANDIDATES)
      .map(({ content }) => content);
    const declaredVideoType = metadata.find(({ name }) => /^og:video:type$/i.test(name))?.content;
    const directVideoDeclared = metadata.some(
      ({ name, content }) => /^og:video:type$/i.test(name) && /^video\//i.test(content),
    ) || (declaredVideoType === undefined && videoUrls.some((url) => /\.(mp4|webm)(?:[?#]|$)/i.test(url)));
    if (directVideoDeclared) {
      if (videoUrls.length === 0) return false;
      const videoChecks = await Promise.all(
        videoUrls.map((videoUrl) => servesUsableMediaResource(videoUrl, final, crawlerUserAgent, "video")),
      );
      return videoChecks.some(Boolean);
    }

    const imageUrls = metadata
      .filter(({ name }) => IMAGE_METADATA_PATTERN.test(name))
      .slice(0, MAX_MEDIA_CANDIDATES)
      .map(({ content }) => content);
    if (imageUrls.length === 0) return false;
    const imageChecks = await Promise.all(
      imageUrls.map((imageUrl) => servesUsableMediaResource(imageUrl, final, crawlerUserAgent, "image")),
    );
    return imageChecks.some(Boolean);
  } catch {
    return false;
  }
}
