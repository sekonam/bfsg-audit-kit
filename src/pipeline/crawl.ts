import type { CrawlResult, Journey, SampledPage } from '../core/types.ts';
import { CRITICAL_JOURNEYS } from '../core/types.ts';
import type { CrawlPolicy } from '../core/crawl/policy.ts';
import {
  ALLOW_ALL,
  crawlDelayFor,
  isAllowed,
  robotsFromResponse,
  type RobotsRules,
} from '../core/crawl/robots.ts';
import { HostRateLimiter } from '../core/crawl/rate-limit.ts';
import { fingerprint } from '../core/crawl/fingerprint.ts';
import { domSignature } from '../core/crawl/signature.ts';
import { classifyJourney, JOURNEY_CANDIDATE_PATHS } from '../core/crawl/journey.ts';
import { extractLinks, normalizeUrl } from '../core/crawl/url.ts';
import { isSameSite } from '../core/crawl/url.ts';
import { NavigationBlockedError } from '../adapters/browser.ts';
import type { FetchedPage, NavigationGuard, PageFetcher } from '../adapters/browser.ts';

/**
 * The crawl.
 *
 * Budget discipline is the whole design. Twenty pages is not many, so the
 * queue is ordered by what the report needs — the five critical journeys
 * first, other templates afterwards — and any page whose DOM signature has
 * already been sampled is dropped rather than scanned twice.
 *
 * Every fetch passes three gates in order: robots.txt, the page budget, the
 * per-host rate limiter. There is no path through this module that skips them.
 */

export interface CrawlDeps {
  readonly fetcher: PageFetcher;
  /**
   * Optional hook to install a navigation guard on the fetcher. The crawler
   * supplies one so that a redirect onto a disallowed path — or onto another
   * host entirely — is aborted before the request is sent, rather than being
   * fetched and then noticed.
   */
  readonly setNavigationGuard?: (guard: NavigationGuard) => void;
  /** Plain GET used for robots.txt only. */
  readonly fetchText: (
    url: string,
    userAgent: string,
    timeoutMs: number,
  ) => Promise<{ status: number; body: string }>;
  readonly limiter?: HostRateLimiter;
  readonly log?: (message: string) => void;
}

export interface CrawlOutcome extends CrawlResult {
  /** Fetched page contents, keyed by URL, for the scanner to reuse. */
  readonly fetched: ReadonlyMap<string, FetchedPage>;
}

function journeyRank(journey: Journey): number {
  const index = CRITICAL_JOURNEYS.indexOf(journey);
  return index === -1 ? CRITICAL_JOURNEYS.length : index;
}

export async function crawlShop(
  startUrl: string,
  policy: CrawlPolicy,
  deps: CrawlDeps,
): Promise<CrawlOutcome> {
  const startedAt = new Date().toISOString();
  const normalizedStart = normalizeUrl(startUrl);
  if (!normalizedStart) throw new Error(`Ungültige Start-URL: ${startUrl}`);
  const origin = new URL(normalizedStart).origin;
  const host = new URL(normalizedStart).host;
  const log = deps.log ?? (() => {});

  const limiter = deps.limiter ?? new HostRateLimiter(policy.minRequestIntervalMs);

  // --- Gate 1: robots.txt, cached PER HOST -------------------------------
  // Per host, not per crawl: `isSameSite` treats shop.de and www.shop.de as one
  // site, and a redirect can move to either. Checking www.shop.de against
  // shop.de/robots.txt would apply the wrong rules and miss its Crawl-delay.
  const robotsByHost = new Map<string, RobotsRules>();

  const robotsFor = async (targetHost: string): Promise<RobotsRules> => {
    if (!policy.respectRobots) return ALLOW_ALL;
    const cached = robotsByHost.get(targetHost);
    if (cached) return cached;

    await limiter.acquire(targetHost);
    const scheme = new URL(normalizedStart).protocol;
    const response = await deps.fetchText(
      `${scheme}//${targetHost}/robots.txt`,
      policy.userAgent,
      policy.timeoutMs,
    );
    const rules = robotsFromResponse(response.status, response.body);
    robotsByHost.set(targetHost, rules);

    const declaredDelay = crawlDelayFor(rules, policy.userAgent);
    // 0 is a valid value that means "no delay" — honouring it would be a
    // no-op, so do not claim in the log that it was honoured.
    if (declaredDelay !== undefined && declaredDelay > 0) {
      limiter.setHostInterval(targetHost, declaredDelay);
      log(`robots.txt (${targetHost}): Crawl-delay ${declaredDelay} ms wird beachtet`);
    }
    return rules;
  };

  if (!policy.respectRobots) {
    log('WARNUNG: robots.txt wird auf ausdrückliche Anweisung ignoriert.');
  }

  const skipped: { url: string; reason: string }[] = [];
  const pages: SampledPage[] = [];
  const fetched = new Map<string, FetchedPage>();
  const seenSignatures = new Map<string, string>();
  const visited = new Set<string>();
  const queued = new Set<string>([normalizedStart]);
  const queue: string[] = [normalizedStart];

  /** Enqueue links once each — a header nav repeated on 20 pages otherwise
   *  pushes the same URLs 20 times and makes every re-sort more expensive. */
  const enqueue = (urls: readonly string[]): void => {
    for (const url of urls) {
      if (visited.has(url) || queued.has(url)) continue;
      queued.add(url);
      queue.push(url);
    }
  };
  let platformEvidence: readonly string[] = [];
  let platform: CrawlResult['platform'] = 'unknown';
  let budget = policy.maxPagesPerShop;

  const pathOf = (url: string): string => {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  };

  /**
   * The single authority on "may we load this document?". Used both before a
   * fetch and, via the navigation guard, on every redirect hop.
   */
  const mayVisit = async (candidate: string): Promise<boolean> => {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    // A redirect must not carry the crawl off the shop being audited.
    if (!isSameSite(candidate, normalizedStart)) return false;
    if (!policy.respectRobots) return true;
    const rules = await robotsFor(parsed.host);
    return isAllowed(rules, policy.userAgent, pathOf(candidate));
  };

  deps.setNavigationGuard?.((candidate) => mayVisit(candidate));

  const tryFetch = async (url: string): Promise<FetchedPage | undefined> => {
    if (visited.has(url)) return undefined;
    visited.add(url);

    if (!(await mayVisit(url))) {
      skipped.push({ url, reason: 'durch robots.txt ausgeschlossen' });
      return undefined;
    }
    // --- Gate 2: page budget. This is the only place it is enforced, so that
    // an exhausted budget is always recorded rather than silently ending a loop.
    if (budget <= 0) {
      if (skipped.filter((s) => s.reason === 'Seitenbudget erschöpft').length < 10) {
        skipped.push({ url, reason: 'Seitenbudget erschöpft' });
      }
      return undefined;
    }

    // --- Gate 3: rate limit ---------------------------------------------
    await limiter.acquire(host);
    budget -= 1;
    try {
      const page = await deps.fetcher.fetchPage(url);
      log(`${page.status} ${url}`);
      return page;
    } catch (error) {
      if (error instanceof NavigationBlockedError) {
        skipped.push({
          url,
          reason: `Weiterleitung auf ${error.blockedUrl} — durch robots.txt ausgeschlossen oder fremder Host`,
        });
        return undefined;
      }
      skipped.push({
        url,
        reason: `Abruf fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
      });
      return undefined;
    }
  };

  /** Returns true when the page became a sample; false when it was discarded. */
  const record = (page: FetchedPage): boolean => {
    // Everything downstream keys on the URL that was actually rendered.
    const url = page.finalUrl || page.url;
    if (page.status >= 400 || page.status === 0) {
      skipped.push({ url, reason: `HTTP ${page.status}` });
      return false;
    }
    const signature = domSignature(page.html);
    const duplicateOf = seenSignatures.get(signature);
    if (duplicateOf) {
      skipped.push({ url, reason: `identisches Template wie ${duplicateOf}` });
      return false;
    }
    seenSignatures.set(signature, url);
    const journey = classifyJourney(url, {
      hasProductSchema: page.hasProductSchema,
      hasAddToCart: page.hasAddToCart,
      productLinkCount: page.productLinkCount,
    });
    pages.push({ url, journey, title: page.title, signature, httpStatus: page.status });
    fetched.set(url, page);
    return true;
  };

  // --- Home page: also the fingerprinting sample -------------------------
  const home = await tryFetch(normalizedStart);
  if (home && home.status > 0 && home.status < 400) {
    const homeUrl = home.finalUrl || home.url;
    const result = fingerprint({ url: homeUrl, html: home.html, headers: home.headers });
    platform = result.platform;
    platformEvidence = result.evidence;
    record(home);
    // Links are resolved against the URL that was rendered, not the one asked
    // for: a redirected home page has a different base.
    enqueue(extractLinks(home.html, homeUrl));
  } else if (home) {
    record(home);
  }

  // --- Breadth-first, prioritised by what the report still needs ---------
  while (queue.length > 0 && budget > 0) {
    const missing = new Set(CRITICAL_JOURNEYS.filter((j) => !pages.some((p) => p.journey === j)));
    queue.sort((a, b) => {
      const ja = classifyJourney(a);
      const jb = classifyJourney(b);
      const wa = missing.has(ja) ? 0 : 1;
      const wb = missing.has(jb) ? 0 : 1;
      return wa - wb || journeyRank(ja) - journeyRank(jb) || a.length - b.length;
    });
    const next = queue.shift();
    if (!next) break;
    const page = await tryFetch(next);
    if (!page) continue;
    record(page);
    if (page.status > 0 && page.status < 400 && pages.length < policy.maxPagesPerShop) {
      enqueue(extractLinks(page.html, page.finalUrl || page.url));
    }
  }

  // --- Last resort: the two journeys a shop rarely links from the header --
  for (const journey of CRITICAL_JOURNEYS) {
    if (budget <= 0) break;
    if (pages.some((p) => p.journey === journey)) continue;
    for (const candidate of JOURNEY_CANDIDATE_PATHS[journey]) {
      if (budget <= 0) break;
      const url = normalizeUrl(candidate, origin);
      if (!url || visited.has(url)) continue;
      const page = await tryFetch(url);
      // Only stop probing when the page actually became a sample. A soft-404
      // that renders the home template is discarded by `record`, and breaking
      // on it would leave /warenkorb and /kasse untried — exactly the shops
      // this fallback exists for.
      if (page && page.status > 0 && page.status < 400 && record(page)) break;
    }
  }

  return {
    origin,
    platform,
    platformEvidence,
    pages,
    skipped,
    robotsRespected: policy.respectRobots,
    startedAt,
    finishedAt: new Date().toISOString(),
    fetched,
  };
}

/** Critical journeys the crawl failed to reach — reported, never hidden. */
export function missingJourneys(result: CrawlResult): Journey[] {
  return CRITICAL_JOURNEYS.filter((j) => !result.pages.some((p) => p.journey === j));
}
