import type { Finding, ScanResult } from '../core/types.ts';
import { CRITICAL_JOURNEYS } from '../core/types.ts';
import type { CrawlPolicy } from '../core/crawl/policy.ts';
import { describePolicy } from '../core/crawl/policy.ts';
import { HostRateLimiter } from '../core/crawl/rate-limit.ts';
import { shopIdFromUrl } from '../core/crawl/url.ts';
import {
  normalizeFindings,
  type PageAxeResult,
  type PageLighthouseResult,
} from '../core/findings/normalize.ts';
import { scoreScan } from '../core/findings/score.ts';
import { fetchText, PlaywrightSession } from '../adapters/browser.ts';
import { freePort, runLighthouse } from '../adapters/lighthouse.ts';
import { crawlShop, type CrawlOutcome } from './crawl.ts';

/**
 * Crawl + scan one shop.
 *
 * Request discipline: axe runs inside the crawl visit, so a shop is fetched
 * once per sampled page. Lighthouse needs its own navigation, so it is limited
 * to the five critical journeys and each run passes through the same per-host
 * rate limiter as the crawl.
 */

export interface ScanOptions {
  readonly policy: CrawlPolicy;
  /** Run Lighthouse on the critical journeys. Default: true. */
  readonly lighthouse?: boolean;
  /** Directory for element screenshots; screenshots are skipped when unset. */
  readonly screenshotDir?: string | undefined;
  readonly log?: (message: string) => void;
}

export interface ScanOutcome {
  readonly result: ScanResult;
  readonly crawl: CrawlOutcome;
  readonly warnings: readonly string[];
}

export async function scanShop(startUrl: string, options: ScanOptions): Promise<ScanOutcome> {
  const log = options.log ?? (() => {});
  const warnings: string[] = [];
  const wantLighthouse = options.lighthouse ?? true;

  log(describePolicy(options.policy));

  const limiter = new HostRateLimiter(options.policy.minRequestIntervalMs);
  const devtoolsPort = wantLighthouse ? await freePort() : undefined;
  const session = await PlaywrightSession.launch(options.policy, {
    devtoolsPort,
    runAxe: true,
    screenshotDir: options.screenshotDir,
  });

  try {
    const crawl = await crawlShop(startUrl, options.policy, {
      fetcher: session,
      fetchText,
      limiter,
      log,
    });

    const axePages: PageAxeResult[] = [];
    let axeVersion = 'unbekannt';
    let incomplete = 0;
    for (const page of crawl.pages) {
      const fetched = crawl.fetched.get(page.url);
      if (!fetched?.axe) continue;
      axeVersion = fetched.axe.axeVersion;
      incomplete += fetched.axe.incomplete;
      axePages.push({
        url: page.url,
        journey: page.journey,
        violations: fetched.axe.violations,
      });
    }

    const lighthousePages: PageLighthouseResult[] = [];
    let lighthouseScore: number | null = null;
    let lighthouseVersion = 'nicht ausgeführt';
    if (wantLighthouse && devtoolsPort) {
      const targets = crawl.pages
        .filter((p) => CRITICAL_JOURNEYS.includes(p.journey))
        .slice(0, CRITICAL_JOURNEYS.length);
      const host = new URL(crawl.origin).host;
      for (const target of targets) {
        await limiter.acquire(host);
        const result = await runLighthouse(target.url, devtoolsPort);
        if (result.error) {
          warnings.push(`Lighthouse für ${target.url} fehlgeschlagen: ${result.error}`);
          continue;
        }
        lighthouseVersion = result.version;
        lighthousePages.push({
          url: target.url,
          journey: target.journey,
          categoryScore: result.categoryScore,
          audits: result.audits,
        });
        log(
          `Lighthouse ${target.url}: ${
            result.categoryScore === null ? 'kein Wert' : Math.round(result.categoryScore * 100)
          }`,
        );
      }
      const scores = lighthousePages
        .map((p) => p.categoryScore)
        .filter((s): s is number => s !== null);
      lighthouseScore =
        scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100)
          : null;
    }

    const findings: Finding[] = normalizeFindings(axePages, lighthousePages).map((finding) => ({
      ...finding,
      instances: finding.instances.map((instance) => {
        const shot = crawl.fetched.get(instance.url)?.screenshots?.[instance.selector];
        return shot ? { ...instance, screenshot: shot } : instance;
      }),
    }));

    if (incomplete > 0) {
      warnings.push(
        `${incomplete} axe-Ergebnisse konnten maschinell nicht entschieden werden und benötigen eine manuelle Prüfung.`,
      );
    }

    const result: ScanResult = {
      shopId: shopIdFromUrl(startUrl),
      origin: crawl.origin,
      crawl: {
        origin: crawl.origin,
        platform: crawl.platform,
        platformEvidence: crawl.platformEvidence,
        pages: crawl.pages,
        skipped: crawl.skipped,
        robotsRespected: crawl.robotsRespected,
        startedAt: crawl.startedAt,
        finishedAt: crawl.finishedAt,
      },
      findings,
      score: scoreScan(findings),
      lighthouseScore,
      toolVersions: {
        'axe-core': axeVersion,
        lighthouse: lighthouseVersion,
        'bfsg-audit-kit': '0.1.0',
      },
      scannedAt: new Date().toISOString(),
    };

    return { result, crawl, warnings };
  } finally {
    await session.close();
  }
}
