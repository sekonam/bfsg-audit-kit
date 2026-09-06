/**
 * Template de-duplication by structural DOM signature.
 *
 * Two product detail pages differ in text and images but share a skeleton.
 * Scanning twenty product pages that are the same template wastes the page
 * budget and inflates every occurrence count in the report, so pages are
 * reduced to a structure-only fingerprint and only one page per signature is
 * kept.
 *
 * The signature is computed from the rendered HTML string rather than in the
 * page, so it is a pure function and can be tested without a browser.
 */

/** Elements whose subtree carries no layout structure worth sampling. */
const SKIP_CONTENT = new Set(['script', 'style', 'noscript', 'template', 'svg']);

/** Class tokens containing digits or hashes are per-instance noise, not structure. */
function isStructuralClass(token: string): boolean {
  if (token.length === 0 || token.length > 40) return false;
  if (/\d/.test(token)) return false;
  return /^[a-zA-Z][a-zA-Z_-]*$/.test(token);
}

export const MAX_STRUCTURE_TOKENS = 400;

/**
 * How much HTML the structural heuristics look at.
 *
 * The lazy `[\s\S]*?` scans below degrade quadratically on unclosed tags in a
 * hostile page: 960 KB of markup measured at 17 seconds, and this runs for five
 * tag names on every fetched page. The signature only needs the first few
 * hundred elements, so the tail is not worth the exposure.
 */
export const MAX_HTML_BYTES = 512 * 1024;

/**
 * Remove elements whose contents are noise (scripts, styles, inline SVG paths).
 *
 * Index-based rather than regex-based, and deliberately so: the obvious
 * `<script\b[^>]*>[\s\S]*?</script>` is quadratic when a hostile page serves
 * thousands of unclosed `<script>` tags — measured at 17 seconds for a page
 * this crawler would happily fetch, five times over (once per skipped tag).
 * This scan is linear and cannot be made to backtrack.
 */
export function stripNonStructural(html: string): string {
  const source = html.slice(0, MAX_HTML_BYTES);
  const lower = source.toLowerCase();
  let out = '';
  let i = 0;

  while (i < source.length) {
    const lt = lower.indexOf('<', i);
    if (lt === -1) {
      out += source.slice(i);
      break;
    }
    out += source.slice(i, lt);

    if (lower.startsWith('<!--', lt)) {
      const end = lower.indexOf('-->', lt + 4);
      i = end === -1 ? source.length : end + 3;
      continue;
    }

    let handled = false;
    for (const tag of SKIP_CONTENT) {
      if (!lower.startsWith(`<${tag}`, lt)) continue;
      const next = lower.charAt(lt + tag.length + 1);
      // `<svgfoo>` is not `<svg>`.
      if (next !== '' && !/[\s/>]/.test(next)) continue;

      const openEnd = lower.indexOf('>', lt);
      if (openEnd === -1) {
        i = source.length;
      } else if (source.charAt(openEnd - 1) === '/') {
        i = openEnd + 1; // self-closing: nothing to skip over
      } else {
        const close = lower.indexOf(`</${tag}`, openEnd);
        if (close === -1) {
          i = source.length;
        } else {
          const closeEnd = lower.indexOf('>', close);
          i = closeEnd === -1 ? source.length : closeEnd + 1;
        }
      }
      handled = true;
      break;
    }
    if (handled) continue;

    out += '<';
    i = lt + 1;
  }

  return out;
}

/**
 * Reduce HTML to a sequence of `tag` / `tag.class` tokens describing structure.
 * Text, attributes, ids and numeric class variants are discarded.
 */
export function structureTokens(html: string, limit = MAX_STRUCTURE_TOKENS): string[] {
  const tokens: string[] = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  const source = stripNonStructural(html);
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(source)) !== null) {
    const tag = match[1]!.toLowerCase();
    const attrs = match[2] ?? '';
    if (SKIP_CONTENT.has(tag)) continue;

    const classMatch = /\sclass\s*=\s*["']([^"']*)["']/i.exec(attrs);
    const classes = (classMatch?.[1] ?? '')
      .split(/\s+/)
      .filter(isStructuralClass)
      .sort()
      .slice(0, 2);
    tokens.push(classes.length > 0 ? `${tag}.${classes.join('.')}` : tag);

    if (tokens.length >= limit) break;
  }

  return tokens;
}

/** FNV-1a, 32-bit. Deterministic, dependency-free, adequate for de-duplication. */
export function hashTokens(tokens: readonly string[]): string {
  let hash = 0x811c9dc5;
  const text = tokens.join('>');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Structural signature of a rendered page. */
export function domSignature(html: string): string {
  return hashTokens(structureTokens(html));
}

export interface SignedPage {
  readonly url: string;
  readonly signature: string;
}

/**
 * Keep the first page seen for each signature, preserving order.
 * Returns the kept pages and the URLs dropped as duplicate templates.
 */
export function dedupeBySignature<T extends SignedPage>(
  pages: readonly T[],
): { kept: T[]; duplicates: { url: string; sameAs: string }[] } {
  const seen = new Map<string, string>();
  const kept: T[] = [];
  const duplicates: { url: string; sameAs: string }[] = [];
  for (const page of pages) {
    const first = seen.get(page.signature);
    if (first === undefined) {
      seen.set(page.signature, page.url);
      kept.push(page);
    } else {
      duplicates.push({ url: page.url, sameAs: first });
    }
  }
  return { kept, duplicates };
}
