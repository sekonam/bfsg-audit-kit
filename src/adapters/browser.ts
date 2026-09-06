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
  /** The URL that was requested. */
  readonly url: string;
  /**
   * The URL actually rendered, after redirects. Everything downstream — the
   * DOM signature, the journey, the link base and the report — uses this,
   * because a report that names a URL nobody scanned is worse than useless.
   */
  readonly finalUrl: string;
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

/**
 * Decides whether a document navigation may proceed.
 *
 * This exists because `page.goto` follows redirects, and a robots.txt check
 * performed before the fetch only ever sees the URL we asked for. A shop that
 * redirects `/produkte` to `/intern/geheim` would otherwise get its forbidden
 * page fetched, scanned and printed in the report. The guard runs as a route
 * handler, so a disallowed target is aborted BEFORE the request leaves the
 * browser — it also covers redirects onto another host entirely.
 */
export type NavigationGuard = (url: string) => boolean | Promise<boolean>;

/** Redirect hops followed before giving up. */
export const MAX_REDIRECTS = 5;

export class NavigationBlockedError extends Error {
  override readonly name = 'NavigationBlockedError';
  readonly blockedUrl: string;

  constructor(blockedUrl: string) {
    super(`Navigation zu ${blockedUrl} ist nicht erlaubt (robots.txt oder fremder Host).`);
    this.blockedUrl = blockedUrl;
  }
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
  #guard: NavigationGuard | undefined;
  #blocked: string | undefined;
  #resolvedUrl: string | undefined;
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
    const browser = await chromium.launch({ headless: true, args });
    session.#browser = browser;
    try {
      session.#context = await browser.newContext({
        userAgent: policy.userAgent,
        // A desktop viewport is the baseline; the 320 px reflow check is part of
        // the manual pass, not of the automated scan.
        viewport: { width: 1280, height: 900 },
        locale: 'de-DE',
        // Never carry state between shops.
        storageState: undefined,
      });
      session.#context.setDefaultTimeout(policy.timeoutMs);
      await session.#installNavigationGuard();
    } catch (error) {
      // Without this the Chromium process survives a failure in newContext and
      // the Node process never exits: scanShop's finally block is never reached
      // because launch never returned.
      await browser.close().catch(() => {});
      throw error;
    }
    return session;
  }

  /**
   * Set the guard consulted for every document navigation. Installed once at
   * launch and delegated through a mutable field, so the crawler can supply a
   * guard that needs the session itself (per-host robots.txt lookups).
   */
  setNavigationGuard(guard: NavigationGuard | undefined): void {
    this.#guard = guard;
  }

  /**
   * Resolve redirects ourselves, checking the guard before EVERY hop.
   *
   * Playwright's route handler is not invoked again for a redirect target —
   * verified against Playwright 1.54: a 302 from an allowed URL to a
   * robots-disallowed one reached the server untouched. So the handler fetches
   * with `maxRedirects: 0` and walks the chain itself. A hop the guard rejects
   * is never requested at all, rather than requested and then discarded.
   */
  async #installNavigationGuard(): Promise<void> {
    await this.context.route('**/*', async (route) => {
      const request = route.request();
      const guard = this.#guard;
      if (!guard || !request.isNavigationRequest() || request.resourceType() !== 'document') {
        await route.continue();
        return;
      }

      let target = request.url();
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        if (!(await guard(target))) {
          this.#blocked = target;
          await route.abort('blockedbyclient');
          return;
        }
        let response;
        try {
          response = await route.fetch({ url: target, maxRedirects: 0 });
        } catch {
          await route.abort('failed');
          return;
        }
        const status = response.status();
        const location = response.headers()['location'];
        if (status >= 300 && status < 400 && location) {
          target = new URL(location, target).href;
          continue;
        }
        this.#resolvedUrl = target;
        await route.fulfill({ response });
        return;
      }

      // Too many hops: treat as a failure rather than following forever.
      this.#blocked = target;
      await route.abort('blockedbyclient');
    });
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
    this.#blocked = undefined;
    this.#resolvedUrl = undefined;
    try {
      const response = await page
        .goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: this.#policy.timeoutMs,
        })
        .catch((error: unknown) => {
          // Distinguish "we refused to go there" from a genuine network failure,
          // so the report can say which one happened.
          if (this.#blocked) throw new NavigationBlockedError(this.#blocked);
          throw error;
        });
      // A quarter of the navigation budget, capped at 5 s: long enough for a
      // shop's deferred scripts, short enough that a page which never settles
      // does not stall the crawl.
      const idleTimeout = Math.min(5_000, Math.max(1_000, Math.round(this.#policy.timeoutMs / 4)));
      await page.waitForLoadState('networkidle', { timeout: idleTimeout }).catch(() => {
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

      // With the redirect chain resolved in the route handler, the browser's
      // own page.url() stays on the requested URL, so the resolved target is
      // taken from the handler.
      const base = {
        url,
        finalUrl: this.#resolvedUrl ?? page.url(),
        status,
        html,
        title,
        headers: {},
        ...hints,
      };
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
