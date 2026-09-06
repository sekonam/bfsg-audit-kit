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
import type { FetchedPage, PageFetcher } from '../adapters/browser.ts';

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

  // --- Gate 1: robots.txt ------------------------------------------------
  let robots: RobotsRules = ALLOW_ALL;
  if (policy.respectRobots) {
    await limiter.acquire(host);
    const response = await deps.fetchText(
      `${origin}/robots.txt`,
      policy.userAgent,
      policy.timeoutMs,
    );
    robots = robotsFromResponse(response.status, response.body);
    const declaredDelay = crawlDelayFor(robots, policy.userAgent);
    if (declaredDelay !== undefined) {
      limiter.setHostInterval(host, declaredDelay);
      log(`robots.txt: Crawl-delay ${declaredDelay} ms wird beachtet`);
    }
  } else {
    log('WARNUNG: robots.txt wird auf ausdrückliche Anweisung ignoriert.');
  }

  const skipped: { url: string; reason: string }[] = [];
  const pages: SampledPage[] = [];
  const fetched = new Map<string, FetchedPage>();
  const seenSignatures = new Map<string, string>();
  const visited = new Set<string>();
  const queue: string[] = [normalizedStart];
  let platformEvidence: readonly string[] = [];
  let platform: CrawlResult['platform'] = 'unknown';
  let budget = policy.maxPagesPerShop;

  const pathOf = (url: string): string => {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  };

  const tryFetch = async (url: string): Promise<FetchedPage | undefined> => {
    if (visited.has(url)) return undefined;
    visited.add(url);

    if (policy.respectRobots && !isAllowed(robots, policy.userAgent, pathOf(url))) {
      skipped.push({ url, reason: 'durch robots.txt ausgeschlossen' });
      return undefined;
    }
    if (budget <= 0) {
      skipped.push({ url, reason: 'Seitenbudget erschöpft' });
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
      skipped.push({
        url,
        reason: `Abruf fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
      });
      return undefined;
    }
  };

  const record = (page: FetchedPage): void => {
    if (page.status >= 400 || page.status === 0) {
      skipped.push({ url: page.url, reason: `HTTP ${page.status}` });
      return;
    }
    const signature = domSignature(page.html);
    const duplicateOf = seenSignatures.get(signature);
    if (duplicateOf) {
      skipped.push({ url: page.url, reason: `identisches Template wie ${duplicateOf}` });
      return;
    }
    seenSignatures.set(signature, page.url);
    const journey = classifyJourney(page.url, {
      hasProductSchema: page.hasProductSchema,
      hasAddToCart: page.hasAddToCart,
      productLinkCount: page.productLinkCount,
    });
    pages.push({
      url: page.url,
      journey,
      title: page.title,
      signature,
      httpStatus: page.status,
    });
    fetched.set(page.url, page);
  };

  // --- Home page: also the fingerprinting sample -------------------------
  const home = await tryFetch(normalizedStart);
  if (home) {
    const result = fingerprint({ url: home.url, html: home.html, headers: home.headers });
    platform = result.platform;
    platformEvidence = result.evidence;
    record(home);
    for (const link of extractLinks(home.html, home.url)) queue.push(link);
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
    if (pages.length < policy.maxPagesPerShop) {
      for (const link of extractLinks(page.html, page.url)) {
        if (!visited.has(link)) queue.push(link);
      }
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
      if (page && page.status < 400) {
        record(page);
        break;
      }
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
