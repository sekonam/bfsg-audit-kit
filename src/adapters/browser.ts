import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { CrawlPolicy } from '../core/crawl/policy.ts';
import { runAxe, type AxeRunResult } from './axe.ts';

/**
 * Playwright session used for crawling and scanning.
 *
 * Read-only by construction: the session never submits a form, never clicks,
 * never accepts cookies on the user's behalf and never stores state between
 * shops. It loads a public URL, waits for the network to settle, and reads.
 */

export interface FetchedPage {
  readonly url: string;
  readonly status: number;
  readonly html: string;
  readonly title: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly hasAddToCart: boolean;
  readonly hasProductSchema: boolean;
  readonly productLinkCount: number;
  /**
   * axe results captured during the same visit. Running the scan inline is
   * what keeps the crawl to ONE request per page: navigating a second time to
   * scan would double every shop's request count for no benefit.
   */
  readonly axe?: AxeRunResult;
  /** Element screenshots keyed by CSS selector, as paths relative to `screenshotDir`. */
  readonly screenshots?: Readonly<Record<string, string>>;
}

export interface PageFetcher {
  fetchPage(url: string): Promise<FetchedPage>;
}

export interface SessionOptions {
  /** Expose CDP on this port so Lighthouse can attach to the same browser. */
  readonly devtoolsPort?: number | undefined;
  /** Run axe during each page visit. */
  readonly runAxe?: boolean;
  /** Directory for element screenshots. Screenshots are skipped when unset. */
  readonly screenshotDir?: string | undefined;
  /** Maximum element screenshots per page. */
  readonly maxScreenshotsPerPage?: number;
}

/** Signals used by journey classification, read from the live DOM. */
const PAGE_HINTS_SCRIPT = `() => {
  const text = (el) => (el.textContent || '').toLowerCase();
  const buttons = Array.from(document.querySelectorAll('button, input[type=submit], a'));
  const hasAddToCart = buttons.some((b) => {
    const label = (text(b) + ' ' + (b.getAttribute('name') || '') + ' ' +
      (b.getAttribute('data-action') || '') + ' ' + (b.className || '')).toLowerCase();
    return /in den warenkorb|add to cart|zum warenkorb hinzu|add-to-cart|addtocart|buy-now/.test(label);
  });
  let hasProductSchema = false;
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    if (/"@type"\\s*:\\s*"Product"/i.test(s.textContent || '')) hasProductSchema = true;
  }
  if (document.querySelector('[itemtype$="schema.org/Product"]')) hasProductSchema = true;
  const productLinkCount = document.querySelectorAll(
    'a[href*="/products/"], a[href*="/produkt"], a[href*="/artikel"], a[href*="/detail/"]',
  ).length;
  return { hasAddToCart, hasProductSchema, productLinkCount };
}`;

export class PlaywrightSession implements PageFetcher {
  #browser: Browser | undefined;
  #context: BrowserContext | undefined;
  #screenshotCounter = 0;
  readonly #policy: CrawlPolicy;
  readonly #options: SessionOptions;

  private constructor(policy: CrawlPolicy, options: SessionOptions) {
    this.#policy = policy;
    this.#options = options;
  }

  /**
   * Launch a browser. When `devtoolsPort` is given, Chromium exposes CDP on it
   * so Lighthouse can attach to the very same browser instance.
   */
  static async launch(
    policy: CrawlPolicy,
    options: SessionOptions = {},
  ): Promise<PlaywrightSession> {
    const session = new PlaywrightSession(policy, options);
    const { devtoolsPort } = options;
    const args = devtoolsPort ? [`--remote-debugging-port=${devtoolsPort}`] : [];
    session.#browser = await chromium.launch({ headless: true, args });
    session.#context = await session.#browser.newContext({
      userAgent: policy.userAgent,
      // A desktop viewport is the baseline; the 320 px reflow check is part of
      // the manual pass, not of the automated scan.
      viewport: { width: 1280, height: 900 },
      locale: 'de-DE',
      // Never carry state between shops.
      storageState: undefined,
    });
    session.#context.setDefaultTimeout(policy.timeoutMs);
    return session;
  }

  get devtoolsPort(): number | undefined {
    return this.#options.devtoolsPort;
  }

  get context(): BrowserContext {
    if (!this.#context) throw new Error('Session is not open');
    return this.#context;
  }

  /** Open a page, read it, and hand it to `fn`. The page is always closed. */
  async withPage<T>(url: string, fn: (page: Page, status: number) => Promise<T>): Promise<T> {
    const page = await this.context.newPage();
    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.#policy.timeoutMs,
      });
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {
        /* a shop that never goes idle is normal; carry on with what loaded */
      });
      return await fn(page, response?.status() ?? 0);
    } finally {
      await page.close();
    }
  }

  async fetchPage(url: string): Promise<FetchedPage> {
    return this.withPage(url, async (page, status) => {
      const [html, title, hints] = await Promise.all([
        page.content(),
        page.title(),
        page.evaluate(PAGE_HINTS_SCRIPT) as Promise<{
          hasAddToCart: boolean;
          hasProductSchema: boolean;
          productLinkCount: number;
        }>,
      ]);

      const base = { url, status, html, title, headers: {}, ...hints };
      if (!this.#options.runAxe || status >= 400) return base;

      const axe = await runAxe(page);
      const screenshots = await this.#captureScreenshots(page, axe);
      return { ...base, axe, ...(screenshots ? { screenshots } : {}) };
    });
  }

  /**
   * One screenshot per violated rule, of the first offending element. Bounded
   * per page: a report with 200 screenshots is unreadable and slow to produce.
   */
  async #captureScreenshots(
    page: Page,
    axe: AxeRunResult,
  ): Promise<Record<string, string> | undefined> {
    const dir = this.#options.screenshotDir;
    if (!dir) return undefined;
    const max = this.#options.maxScreenshotsPerPage ?? 6;
    const shots: Record<string, string> = {};
    let taken = 0;

    for (const violation of axe.violations) {
      if (taken >= max) break;
      const node = violation.nodes[0];
      const selector = node?.target[0];
      if (!selector) continue;
      const name = `${violation.id}-${(this.#screenshotCounter += 1)}.png`;
      const filePath = join(dir, name);
      try {
        const locator = page.locator(selector).first();
        if (!(await locator.isVisible())) continue;
        await mkdir(dirname(filePath), { recursive: true });
        await locator.screenshot({ path: filePath, timeout: 5_000 });
        shots[node.target.join(' ')] = name;
        taken += 1;
      } catch {
        // A screenshot is a nicety; never fail a scan over one.
      }
    }
    return Object.keys(shots).length > 0 ? shots : undefined;
  }

  async close(): Promise<void> {
    await this.#context?.close();
    await this.#browser?.close();
    this.#context = undefined;
    this.#browser = undefined;
  }
}

/**
 * Plain HTTP GET used only for robots.txt. Deliberately not a browser
 * navigation: robots.txt is a text file and rendering it would be silly.
 */
export async function fetchText(
  url: string,
  userAgent: string,
  timeoutMs: number,
): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'text/plain' },
      signal: controller.signal,
      redirect: 'follow',
    });
    return { status: response.status, body: await response.text() };
  } catch {
    // Network failure is reported as status 0, which robotsFromResponse treats
    // as "deny all" — the conservative reading.
    return { status: 0, body: '' };
  } finally {
    clearTimeout(timer);
  }
}
