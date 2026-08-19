// Best-effort, server-side og:/title scrape of a shared URL — used by the
// `messages` function to attach a small preview card to a text message
// after it's already been sent (see runBackground in index.ts). Pulled out
// into its own module so the pure, security-relevant bits (isPrivateHostname,
// firstUrl) are unit-testable without booting the Deno.serve handler.

const URL_REGEX = /https?:\/\/[^\s<>"']+/i;
export const firstUrl = (text: string): string | null => text.match(URL_REGEX)?.[0] ?? null;

// Blocks the obvious SSRF targets (loopback, RFC1918, link-local/cloud
// metadata, IPv6 equivalents) by literal hostname/IP shape. This does NOT
// defend against DNS rebinding — a public hostname that resolves to a
// private IP at fetch time would sail through this check, since Deno's
// fetch() doesn't expose a pre-connect resolved-IP hook here. Accepted as
// reasonable-effort for a best-effort preview feature, not a hard security
// boundary — nothing sensitive is reachable from this function's network
// position beyond what `fetch` already permits.
const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./, // includes the 169.254.169.254 cloud metadata endpoint
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/i, /^\[?fe80:/i, /^\[?fc00:/i, /^\[?fd00:/i,
];
export const isPrivateHostname = (hostname: string): boolean => PRIVATE_HOSTNAME_PATTERNS.some((re) => re.test(hostname));

const metaTag = (html: string, property: string): string | null => {
  const forward = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'));
  if (forward) return forward[1].trim() || null;
  const backward = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, 'i'));
  return backward?.[1]?.trim() || null;
};

export interface LinkPreview { url: string; title: string | null; description: string | null; image: string | null; domain: string }

export const fetchLinkPreview = async (rawUrl: string): Promise<LinkPreview | null> => {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return null; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isPrivateHostname(parsed.hostname)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(parsed.toString(), {
      redirect: 'manual', // a redirect response body is useless for og: tags, and following it blind is the exact SSRF vector this guards against — bail instead
      signal: controller.signal,
      headers: { 'User-Agent': 'CommodityHubLinkPreview/1.0' },
    });
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') ?? '').includes('text/html')) return null;

    // og:/title tags always live in <head> — read only the first chunk
    // rather than buffering an arbitrarily large response body.
    const reader = res.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let html = '';
    while (html.length < 65_536) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => {});

    const image = metaTag(html, 'og:image');
    return {
      url: parsed.toString(),
      title: metaTag(html, 'og:title') || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null,
      description: metaTag(html, 'og:description'),
      image: image ? (() => { try { return new URL(image, parsed).toString(); } catch { return null; } })() : null,
      domain: parsed.hostname,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};
