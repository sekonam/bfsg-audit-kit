import type { Journey } from '../types.ts';

/**
 * Classify a page into one of the five critical shopping journeys.
 *
 * The report is organised by journey rather than by URL because that is how a
 * merchant thinks about the shop and how the BFSG scope is argued: an
 * unlabelled field on the checkout is a different conversation from the same
 * defect on a blog post.
 *
 * Both German and English path vocabulary is recognised: German shops on
 * Shopify frequently keep the English `/products/` and `/collections/` paths.
 */

export interface JourneyHints {
  /** JSON-LD or microdata typed the page as a Product. */
  readonly hasProductSchema?: boolean;
  /** Page contains an add-to-cart control. */
  readonly hasAddToCart?: boolean;
  /** Page contains a grid of product links. */
  readonly productLinkCount?: number;
}

/**
 * Optional file extension. Shopware and Shopify use extensionless paths, but
 * OXID, JTL and many older German shops still serve `/warenkorb.html`, so a
 * segment match must tolerate one.
 */
const EXT = '(?:\\.[a-z]{2,5})?';

const segment = (alternatives: string): RegExp =>
  new RegExp(`(^|/)(${alternatives})${EXT}(/|$|\\?)`, 'i');

const PATTERNS: readonly { journey: Journey; re: RegExp }[] = [
  // Cart first: /checkout/cart is a cart, not a checkout.
  { journey: 'cart', re: segment('warenkorb|cart|basket|korb|checkout/cart') },
  {
    journey: 'checkout',
    re: segment('checkout|kasse|kaufabwicklung|bestellung|bestellabschluss|onepage'),
  },
  {
    journey: 'product',
    re: /(^|\/)(products?|produkte?|artikel|detail|p|item|ware)\/[^/]+/i,
  },
  {
    journey: 'category',
    re: segment('collections?|kategorien?|categor(y|ies)|shop|sortiment|c|catalog(ue)?|produkte'),
  },
];

/** Normalise a URL to its path + search for classification purposes. */
function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function classifyJourney(url: string, hints: JourneyHints = {}): Journey {
  const path = pathOf(url);

  if (path === '/' || path === '' || /^\/(index\.(html?|php))?$/i.test(path)) return 'home';

  for (const { journey, re } of PATTERNS) {
    if (re.test(path)) {
      // A "/products" listing without a slug is a category, not a product page.
      if (journey === 'product' && hints.hasProductSchema === false && !hints.hasAddToCart) {
        continue;
      }
      return journey;
    }
  }

  if (hints.hasProductSchema || hints.hasAddToCart) return 'product';
  if ((hints.productLinkCount ?? 0) >= 6) return 'category';

  return 'other';
}

/** German label for a journey, used as report section headings. */
export function journeyLabel(journey: Journey): string {
  const labels: Record<Journey, string> = {
    home: 'Startseite',
    category: 'Kategorieseite',
    product: 'Produktdetailseite',
    cart: 'Warenkorb',
    checkout: 'Kasse / Bestellabschluss',
    other: 'Weitere Seiten',
  };
  return labels[journey];
}

/**
 * Candidate paths to try when a journey has not been found by link discovery.
 *
 * Used only after the shop's own links have been exhausted, and every candidate
 * still passes robots.txt, the rate limiter and the page cap. Guessing three
 * paths is politer than crawling fifty pages hoping a cart link appears.
 */
export const JOURNEY_CANDIDATE_PATHS: Readonly<Record<Journey, readonly string[]>> = {
  home: ['/'],
  category: ['/collections/all', '/kategorien', '/shop', '/produkte'],
  product: [],
  cart: ['/cart', '/warenkorb', '/checkout/cart'],
  checkout: ['/checkout', '/kasse'],
  other: [],
};
