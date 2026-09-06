import type { Platform } from '../types.ts';

/**
 * Shop-system fingerprinting from public markup and response headers.
 *
 * The platform decides which report template, which effort baseline and which
 * codemod family applies, so it is worth getting right — but it is only ever
 * derived from what the page already sends to every visitor. No probing of
 * admin paths, no version endpoints, no requests a normal browser would not make.
 */

export interface FingerprintInput {
  readonly url: string;
  readonly html: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface FingerprintResult {
  readonly platform: Platform;
  readonly evidence: readonly string[];
  /** 0–1: matched signals over the strongest platform's signal count. */
  readonly confidence: number;
}

interface Signal {
  readonly platform: Platform;
  readonly label: string;
  readonly weight: number;
  readonly test: (input: { html: string; url: string; headers: Record<string, string> }) => boolean;
}

/** Platform markers appear in the head; scanning a whole megabyte is pure risk. */
export const MAX_FINGERPRINT_BYTES = 512 * 1024;

const has = (needle: string) => (input: { html: string }) => input.html.includes(needle);
const headerHas = (name: string) => (input: { headers: Record<string, string> }) =>
  name.toLowerCase() in input.headers;

const SIGNALS: readonly Signal[] = [
  // --- Shopify ---------------------------------------------------------
  { platform: 'shopify', label: 'cdn.shopify.com', weight: 3, test: has('cdn.shopify.com') },
  { platform: 'shopify', label: 'Shopify.theme JS-Objekt', weight: 3, test: has('Shopify.theme') },
  { platform: 'shopify', label: 'myshopify.com-Domain', weight: 2, test: has('myshopify.com') },
  { platform: 'shopify', label: 'shopify-section-Markup', weight: 2, test: has('shopify-section') },
  { platform: 'shopify', label: '/cdn/shop/-Assetpfad', weight: 2, test: has('/cdn/shop/') },
  { platform: 'shopify', label: 'X-ShopId-Header', weight: 3, test: headerHas('x-shopid') },
  {
    platform: 'shopify',
    label: 'powered-by: Shopify',
    weight: 3,
    test: (i) => (i.headers['powered-by'] ?? '').toLowerCase().includes('shopify'),
  },
  // --- Shopify Hydrogen (headless) -------------------------------------
  {
    platform: 'shopify-hydrogen',
    label: 'Hydrogen-Storefront',
    weight: 4,
    test: (i) => i.html.includes('hydrogen') && i.html.includes('shopify'),
  },
  {
    platform: 'shopify-hydrogen',
    label: 'oxygen-Header',
    weight: 3,
    test: headerHas('oxygen-buyer-ip'),
  },
  // --- Shopware --------------------------------------------------------
  {
    platform: 'shopware',
    label: 'meta generator: Shopware',
    weight: 4,
    test: (i) => /<meta[^>]{0,200}?name=["']generator["'][^>]{0,200}?shopware/i.test(i.html),
  },
  {
    platform: 'shopware',
    label: '/bundles/storefront/-Assetpfad (Shopware 6)',
    weight: 3,
    test: has('/bundles/storefront/'),
  },
  {
    platform: 'shopware',
    label: 'sw-Klassenpräfix',
    weight: 1,
    test: (i) => /class=["'][^"']*\bsw-[a-z-]+/i.test(i.html),
  },
  {
    platform: 'shopware',
    label: '/themes/Frontend/-Pfad (Shopware 5)',
    weight: 3,
    test: has('/themes/Frontend/'),
  },
  {
    platform: 'shopware',
    label: 'window.router (Shopware Storefront)',
    weight: 2,
    test: has('window.router'),
  },
  { platform: 'shopware', label: 'sw-language-Cookie', weight: 2, test: has('sw-language-id') },
  // --- WooCommerce -----------------------------------------------------
  {
    platform: 'woocommerce',
    label: 'wp-content/plugins/woocommerce',
    weight: 4,
    test: has('wp-content/plugins/woocommerce'),
  },
  {
    platform: 'woocommerce',
    label: 'woocommerce-Body-Klasse',
    weight: 2,
    test: (i) => /class=["'][^"']*woocommerce/i.test(i.html),
  },
  { platform: 'woocommerce', label: 'wc-ajax-Endpunkt', weight: 2, test: has('wc-ajax') },
  // --- Magento ---------------------------------------------------------
  {
    platform: 'magento',
    label: '/static/version-Assetpfad',
    weight: 3,
    test: has('/static/version'),
  },
  { platform: 'magento', label: 'Magento_-Modulnamen', weight: 3, test: has('Magento_') },
  { platform: 'magento', label: 'mage/-RequireJS', weight: 2, test: has('mage/') },
  // --- JTL -------------------------------------------------------------
  { platform: 'jtl', label: 'JTL-Shop-Kennung', weight: 4, test: (i) => /jtl-shop/i.test(i.html) },
  { platform: 'jtl', label: 'NOVA-Template', weight: 2, test: has('/templates/NOVA/') },
  // --- OXID ------------------------------------------------------------
  { platform: 'oxid', label: 'OXID-Kennung', weight: 3, test: (i) => /oxid ?eshop/i.test(i.html) },
  {
    platform: 'oxid',
    label: '/out/azure/- oder /out/flow/-Theme',
    weight: 3,
    test: (i) => /\/out\/(azure|flow)\//.test(i.html),
  },
  // --- plentymarkets ---------------------------------------------------
  {
    platform: 'plentymarkets',
    label: 'plentymarkets-Kennung',
    weight: 4,
    test: (i) => /plentymarkets/i.test(i.html),
  },
  { platform: 'plentymarkets', label: 'Ceres-Template', weight: 2, test: has('ceres') },
];

/**
 * Identify the shop system. Returns `unknown` with an empty evidence list when
 * nothing matches — which is a normal and reportable outcome (custom shops
 * exist, and they are the most interesting prospects).
 */
export function fingerprint(input: FingerprintInput): FingerprintResult {
  const normalisedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.headers ?? {})) {
    normalisedHeaders[key.toLowerCase()] = value;
  }
  // Bounded: the unbounded `[^>]+` runs below are quadratic on hostile markup
  // (measured 418 KB -> 44 s), and platform markers live in the head anyway.
  const ctx = {
    html: input.html.slice(0, MAX_FINGERPRINT_BYTES),
    url: input.url,
    headers: normalisedHeaders,
  };

  const scores = new Map<Platform, { score: number; evidence: string[] }>();
  for (const signal of SIGNALS) {
    if (!signal.test(ctx)) continue;
    const entry = scores.get(signal.platform) ?? { score: 0, evidence: [] };
    entry.score += signal.weight;
    entry.evidence.push(signal.label);
    scores.set(signal.platform, entry);
  }

  // Hydrogen is a Shopify storefront: fold its evidence in, and only prefer it
  // when its own dedicated signals fired.
  const hydrogen = scores.get('shopify-hydrogen');
  const shopify = scores.get('shopify');
  if (hydrogen && shopify) {
    scores.set('shopify-hydrogen', {
      score: hydrogen.score + shopify.score,
      evidence: [...hydrogen.evidence, ...shopify.evidence],
    });
    scores.delete('shopify');
  }

  let best: { platform: Platform; score: number; evidence: string[] } | undefined;
  for (const [platform, entry] of scores) {
    if (!best || entry.score > best.score) best = { platform, ...entry };
  }

  if (!best || best.score < 2) {
    return { platform: 'unknown', evidence: best?.evidence ?? [], confidence: 0 };
  }

  const maxPossible = SIGNALS.filter((s) => s.platform === best.platform).reduce(
    (n, s) => n + s.weight,
    0,
  );
  return {
    platform: best.platform,
    evidence: best.evidence,
    confidence: Math.min(1, Math.round((best.score / maxPossible) * 100) / 100),
  };
}

/** German label for a platform, used in reports. */
export function platformLabel(platform: Platform): string {
  const labels: Record<Platform, string> = {
    shopify: 'Shopify',
    'shopify-hydrogen': 'Shopify Hydrogen (Headless)',
    shopware: 'Shopware',
    woocommerce: 'WooCommerce',
    magento: 'Magento / Adobe Commerce',
    jtl: 'JTL-Shop',
    oxid: 'OXID eShop',
    plentymarkets: 'plentymarkets',
    unknown: 'Nicht eindeutig erkannt (Individualsystem oder unbekannt)',
  };
  return labels[platform];
}
