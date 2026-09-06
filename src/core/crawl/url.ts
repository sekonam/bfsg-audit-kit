/**
 * URL handling for the crawler: normalisation, same-site checks and link
 * extraction. Kept pure so the crawl budget logic is testable without network.
 */

/** Query parameters that never change the rendered template. */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^gclid$/i,
  /^fbclid$/i,
  /^msclkid$/i,
  /^mc_(cid|eid)$/i,
  /^_ga$/i,
  /^ref$/i,
  /^srsltid$/i,
];

/** File extensions that are not HTML pages. */
const NON_PAGE_EXT =
  /\.(jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|pdf|zip|gz|mp4|webm|mp3|woff2?|ttf|eot)$/i;

/**
 * Canonicalise a URL for de-duplication: drop the fragment and tracking
 * parameters, sort the remaining parameters, lower-case the host, and remove a
 * trailing slash from non-root paths.
 */
export function normalizeUrl(input: string, base?: string): string | null {
  let url: URL;
  try {
    url = base ? new URL(input, base) : new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  url.hash = '';
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.some((re) => re.test(key)))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [key, value] of params) url.searchParams.append(key, value);

  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}

/** Same registrable site, allowing a www/non-www difference. */
export function isSameSite(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const strip = (h: string) => h.replace(/^www\./i, '').toLowerCase();
    return strip(ua.hostname) === strip(ub.hostname);
  } catch {
    return false;
  }
}

/** True for URLs that are worth fetching as HTML pages. */
export function isCrawlableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (NON_PAGE_EXT.test(parsed.pathname)) return false;
    // Account, login, wishlist and search pages are personalised or infinite;
    // they add crawl cost without adding a template.
    if (
      /(^|\/)(login|anmelden|register|registrieren|konto|account|wunschliste|wishlist|suche|search|logout|abmelden)(\/|$)/i.test(
        parsed.pathname,
      )
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Extract hrefs from rendered HTML, normalised and restricted to the same site. */
export function extractLinks(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  const re = /<a\b[^>]*\shref\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1]!.trim();
    if (raw.startsWith('#') || /^(mailto|tel|javascript):/i.test(raw)) continue;
    const normalized = normalizeUrl(raw, baseUrl);
    if (!normalized) continue;
    if (!isSameSite(normalized, baseUrl)) continue;
    if (!isCrawlableUrl(normalized)) continue;
    found.add(normalized);
  }
  return [...found];
}

/**
 * Filesystem-safe identifier for a shop, used as the per-shop output directory.
 *
 * `new URL('http://../x')` parses with hostname '..', which would put the whole
 * output one directory above the data directory. Dot-only ids are refused.
 */
export function shopIdFromUrl(url: string): string {
  let id: string;
  try {
    id = new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    id = url;
  }
  id = id
    .replace(/[^a-z0-9.-]/gi, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+/, '');
  return id === '' ? 'unbekannter-shop' : id;
}
