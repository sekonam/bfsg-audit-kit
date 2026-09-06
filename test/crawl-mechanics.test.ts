import { describe, expect, it } from 'vitest';
import { HostRateLimiter, type Clock } from '../src/core/crawl/rate-limit.ts';
import { fingerprint, platformLabel } from '../src/core/crawl/fingerprint.ts';
import {
  dedupeBySignature,
  domSignature,
  stripNonStructural,
  structureTokens,
} from '../src/core/crawl/signature.ts';
import { classifyJourney, journeyLabel } from '../src/core/crawl/journey.ts';
import {
  extractLinks,
  isCrawlableUrl,
  isSameSite,
  normalizeUrl,
  shopIdFromUrl,
} from '../src/core/crawl/url.ts';

class FakeClock implements Clock {
  time = 0;
  readonly slept: number[] = [];
  now(): number {
    return this.time;
  }
  async sleep(ms: number): Promise<void> {
    this.slept.push(ms);
    this.time += ms;
  }
}

describe('HostRateLimiter', () => {
  it('does not delay the first request to a host', async () => {
    const clock = new FakeClock();
    const limiter = new HostRateLimiter(2000, clock);
    await limiter.acquire('shop.de');
    expect(clock.slept).toEqual([]);
  });

  it('enforces the interval between successive requests to the same host', async () => {
    const clock = new FakeClock();
    const limiter = new HostRateLimiter(2000, clock);
    await limiter.acquire('shop.de');
    await limiter.acquire('shop.de');
    await limiter.acquire('shop.de');
    expect(clock.slept).toEqual([2000, 2000]);
    expect(clock.time).toBe(4000);
  });

  it('does not make one host wait for another', async () => {
    const clock = new FakeClock();
    const limiter = new HostRateLimiter(2000, clock);
    await limiter.acquire('a.de');
    await limiter.acquire('b.de');
    expect(clock.slept).toEqual([]);
  });

  it('does not delay when enough time has already passed', async () => {
    const clock = new FakeClock();
    const limiter = new HostRateLimiter(2000, clock);
    await limiter.acquire('shop.de');
    clock.time = 10_000;
    await limiter.acquire('shop.de');
    expect(clock.slept).toEqual([]);
  });

  it('queues concurrent callers instead of letting them all fire at once', async () => {
    const clock = new FakeClock();
    const limiter = new HostRateLimiter(2000, clock);
    await Promise.all([
      limiter.acquire('shop.de'),
      limiter.acquire('shop.de'),
      limiter.acquire('shop.de'),
    ]);
    // Slots are reserved before awaiting, so three concurrent callers are
    // spaced 2 s apart (t=0, 2000, 4000) rather than all starting at t=0.
    expect(clock.slept).toEqual([2000, 2000]);
    expect(clock.time).toBe(4000);
  });

  it('accepts a site Crawl-delay that is slower, and ignores one that is faster', async () => {
    const limiter = new HostRateLimiter(2000, new FakeClock());
    limiter.setHostInterval('slow.de', 10_000);
    limiter.setHostInterval('fast.de', 100);
    expect(limiter.intervalFor('slow.de')).toBe(10_000);
    expect(limiter.intervalFor('fast.de')).toBe(2000);
  });

  it('rejects a negative interval', () => {
    expect(() => new HostRateLimiter(-1)).toThrow(RangeError);
  });
});

describe('fingerprint', () => {
  it('detects Shopify from CDN and theme markers', () => {
    const result = fingerprint({
      url: 'https://shop.de/',
      html: '<script src="https://cdn.shopify.com/s/x.js"></script><div class="shopify-section">',
    });
    expect(result.platform).toBe('shopify');
    expect(result.evidence.length).toBeGreaterThanOrEqual(2);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detects Shopify from response headers alone', () => {
    const result = fingerprint({
      url: 'https://shop.de/',
      html: '<html></html>',
      headers: { 'X-ShopId': '12345', 'Powered-By': 'Shopify' },
    });
    expect(result.platform).toBe('shopify');
  });

  it('detects Shopware 6 from the storefront bundle path and meta generator', () => {
    const result = fingerprint({
      url: 'https://shop.de/',
      html: '<meta name="generator" content="Shopware"><link href="/bundles/storefront/assets/a.css">',
    });
    expect(result.platform).toBe('shopware');
  });

  it('detects Shopware 5 from the frontend theme path', () => {
    const result = fingerprint({
      url: 'https://shop.de/',
      html: '<link href="/themes/Frontend/Responsive/x.css"><script>window.router = {}</script>',
    });
    expect(result.platform).toBe('shopware');
  });

  it('detects WooCommerce, Magento, JTL, OXID and plentymarkets', () => {
    const cases: [string, string][] = [
      ['woocommerce', '<link href="/wp-content/plugins/woocommerce/style.css">'],
      ['magento', '<script src="/static/version1699/frontend/Magento_Theme/x.js">'],
      ['jtl', '<link href="/templates/NOVA/x.css"><meta name="x" content="jtl-shop">'],
      ['oxid', '<link href="/out/azure/src/css/styles.css"><p>OXID eShop</p>'],
      ['plentymarkets', '<div class="ceres">plentymarkets</div>'],
    ];
    for (const [expected, html] of cases) {
      expect(fingerprint({ url: 'https://shop.de/', html }).platform, expected).toBe(expected);
    }
  });

  it('prefers Hydrogen over plain Shopify when its own markers fire', () => {
    const result = fingerprint({
      url: 'https://shop.de/',
      html: '<script>window.hydrogen = 1; var s = "shopify"</script><img src="https://cdn.shopify.com/a.png">',
      headers: { 'oxygen-buyer-ip': '1.2.3.4' },
    });
    expect(result.platform).toBe('shopify-hydrogen');
    expect(result.evidence.join(' ')).toContain('cdn.shopify.com');
  });

  it('returns unknown for a custom shop rather than guessing', () => {
    const result = fingerprint({ url: 'https://shop.de/', html: '<html><body><h1>Shop</h1>' });
    expect(result.platform).toBe('unknown');
    expect(result.confidence).toBe(0);
    expect(platformLabel('unknown')).toMatch(/Individualsystem/);
  });

  it('gives every platform a German label', () => {
    for (const p of [
      'shopify',
      'shopware',
      'woocommerce',
      'magento',
      'jtl',
      'oxid',
      'plentymarkets',
      'shopify-hydrogen',
      'unknown',
    ] as const) {
      expect(platformLabel(p).length).toBeGreaterThan(3);
    }
  });
});

describe('DOM signature', () => {
  const productTemplate = (name: string, price: string) => `
    <html><body class="page product">
      <header class="site-header"><nav class="main-nav"><ul><li><a href="/">Start</a></li></ul></nav></header>
      <main class="product-detail">
        <h1 class="product-title">${name}</h1>
        <span class="price">${price}</span>
        <button class="add-to-cart">In den Warenkorb</button>
      </main>
      <script>var analytics = {id: "${name}"};</script>
    </body></html>`;

  it('gives two instances of the same template the same signature', () => {
    expect(domSignature(productTemplate('Schuh', '19,99'))).toBe(
      domSignature(productTemplate('Hose', '129,00')),
    );
  });

  it('gives a different template a different signature', () => {
    const category =
      '<html><body class="page category"><main class="grid"><ul></ul></main></body></html>';
    expect(domSignature(productTemplate('Schuh', '19'))).not.toBe(domSignature(category));
  });

  it('ignores scripts, styles and comments', () => {
    const withNoise =
      '<div class="a"><script>var x = "<div class=\'b\'>"</script><!-- <p> --></div>';
    expect(structureTokens(withNoise)).toEqual(['div.a']);
    expect(stripNonStructural('<style>.a{}</style><p>')).toBe('<p>');
  });

  it('ignores per-instance class names containing digits', () => {
    const a = '<div class="card product-1"><span class="t">x</span></div>';
    const b = '<div class="card product-9999"><span class="t">y</span></div>';
    expect(domSignature(a)).toBe(domSignature(b));
    expect(structureTokens(a)).toEqual(['div.card', 'span.t']);
  });

  it('is stable and bounded in length', () => {
    const huge = '<div class="a">'.repeat(5000);
    expect(structureTokens(huge)).toHaveLength(400);
    expect(domSignature(huge)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('deduplicates pages, reporting which template each duplicate matched', () => {
    const { kept, duplicates } = dedupeBySignature([
      { url: '/p/1', signature: 'aaa' },
      { url: '/p/2', signature: 'aaa' },
      { url: '/c/1', signature: 'bbb' },
      { url: '/p/3', signature: 'aaa' },
    ]);
    expect(kept.map((p) => p.url)).toEqual(['/p/1', '/c/1']);
    expect(duplicates).toEqual([
      { url: '/p/2', sameAs: '/p/1' },
      { url: '/p/3', sameAs: '/p/1' },
    ]);
  });
});

describe('classifyJourney', () => {
  it('recognises the home page', () => {
    expect(classifyJourney('https://shop.de/')).toBe('home');
    expect(classifyJourney('https://shop.de')).toBe('home');
    expect(classifyJourney('https://shop.de/index.php')).toBe('home');
  });

  it('recognises German and English cart paths', () => {
    for (const path of ['/warenkorb', '/cart', '/checkout/cart', '/basket']) {
      expect(classifyJourney(`https://shop.de${path}`), path).toBe('cart');
    }
  });

  it('recognises German and English checkout paths', () => {
    for (const path of ['/checkout', '/kasse', '/bestellung', '/checkout/onepage']) {
      expect(classifyJourney(`https://shop.de${path}`), path).toBe('checkout');
    }
  });

  it('puts /checkout/cart in the cart, not the checkout', () => {
    expect(classifyJourney('https://shop.de/checkout/cart')).toBe('cart');
  });

  it('recognises product detail pages', () => {
    for (const path of [
      '/products/roter-schuh',
      '/produkte/schuh',
      '/artikel/1234-schuh',
      '/detail/abc',
    ]) {
      expect(classifyJourney(`https://shop.de${path}`), path).toBe('product');
    }
  });

  it('recognises category pages', () => {
    for (const path of ['/collections/schuhe', '/kategorie/schuhe', '/shop', '/sortiment']) {
      expect(classifyJourney(`https://shop.de${path}`), path).toBe('category');
    }
  });

  it('uses page hints when the path is uninformative', () => {
    expect(classifyJourney('https://shop.de/x/y', { hasProductSchema: true })).toBe('product');
    expect(classifyJourney('https://shop.de/x/y', { hasAddToCart: true })).toBe('product');
    expect(classifyJourney('https://shop.de/x/y', { productLinkCount: 12 })).toBe('category');
    expect(classifyJourney('https://shop.de/ueber-uns')).toBe('other');
  });

  it('gives every journey a German label', () => {
    expect(journeyLabel('checkout')).toBe('Kasse / Bestellabschluss');
    expect(journeyLabel('product')).toBe('Produktdetailseite');
    expect(journeyLabel('other')).toBe('Weitere Seiten');
  });
});

describe('URL handling', () => {
  it('strips fragments and tracking parameters and sorts the rest', () => {
    expect(normalizeUrl('https://Shop.DE/a/?utm_source=x&b=2&a=1#frag')).toBe(
      'https://shop.de/a?a=1&b=2',
    );
  });

  it('keeps a root slash but drops a trailing one', () => {
    expect(normalizeUrl('https://shop.de/')).toBe('https://shop.de/');
    expect(normalizeUrl('https://shop.de/a/')).toBe('https://shop.de/a');
  });

  it('rejects non-http schemes and malformed input', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
    expect(normalizeUrl('mailto:x@y.de')).toBeNull();
  });

  it('treats www and non-www as the same site, other hosts as different', () => {
    expect(isSameSite('https://shop.de/a', 'https://www.shop.de/b')).toBe(true);
    expect(isSameSite('https://shop.de/a', 'https://andere.de/b')).toBe(false);
    expect(isSameSite('bad', 'https://shop.de')).toBe(false);
  });

  it('skips assets and personalised pages', () => {
    expect(isCrawlableUrl('https://shop.de/x.css')).toBe(false);
    expect(isCrawlableUrl('https://shop.de/bild.JPG')).toBe(false);
    expect(isCrawlableUrl('https://shop.de/konto')).toBe(false);
    expect(isCrawlableUrl('https://shop.de/suche?q=x')).toBe(false);
    expect(isCrawlableUrl('https://shop.de/produkte/schuh')).toBe(true);
  });

  it('extracts same-site page links only', () => {
    const html = `
      <a href="/produkte/schuh">Schuh</a>
      <a href="https://www.shop.de/warenkorb">Warenkorb</a>
      <a href="https://facebook.com/shop">FB</a>
      <a href="#inhalt">Skip</a>
      <a href="mailto:x@shop.de">Mail</a>
      <a href="/logo.svg">Logo</a>
      <a href="/produkte/schuh?utm_source=nl">Schuh nochmal</a>`;
    expect(extractLinks(html, 'https://shop.de/').sort()).toEqual([
      'https://shop.de/produkte/schuh',
      'https://www.shop.de/warenkorb',
    ]);
  });

  it('derives a filesystem-safe shop id', () => {
    expect(shopIdFromUrl('https://www.mein-shop.de/x')).toBe('mein-shop.de');
    expect(shopIdFromUrl('nonsense')).toBe('nonsense');
  });
});
