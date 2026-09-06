import type { RawLighthouseAudit } from '../core/findings/normalize.ts';

/**
 * Lighthouse accessibility adapter.
 *
 * Lighthouse's accessibility category is itself axe-powered, so it adds little
 * on top of the direct axe run — with two exceptions worth the runtime:
 * a category score merchants recognise (and that Shopify's Theme Store gates
 * on), and a handful of audits axe does not expose the same way.
 *
 * Failures are non-fatal. A scan that loses Lighthouse still produces a report;
 * the report states that the Lighthouse score is unavailable rather than
 * pretending it was 100.
 */

export interface LighthouseRunResult {
  readonly categoryScore: number | null;
  readonly audits: RawLighthouseAudit[];
  readonly version: string;
  readonly error?: string;
  /**
   * The URL Lighthouse ended up on. Lighthouse drives its own target over CDP,
   * outside the Playwright context the navigation guard is installed on, so it
   * follows redirects unchecked. The caller compares this against the URL it
   * asked for and discards the result on a mismatch.
   */
  readonly finalUrl?: string;
}

interface LhAuditDetailItem {
  node?: { selector?: string; snippet?: string; explanation?: string };
  [key: string]: unknown;
}

/**
 * Run the Lighthouse accessibility category against an already-running Chrome
 * (the same browser the crawler uses), attached over CDP on `port`.
 */
export async function runLighthouse(
  url: string,
  port: number,
  userAgent: string,
): Promise<LighthouseRunResult> {
  try {
    const { default: lighthouse } = await import('lighthouse');
    const runnerResult = await lighthouse(url, {
      port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['accessibility'],
      // The shop was already fetched by the crawler; do not re-simulate a slow
      // network, it triples the runtime for no accessibility benefit.
      throttlingMethod: 'provided',
      // Lighthouse otherwise emulates a mobile Chrome and overrides the
      // context User-Agent over CDP — which would mean a quarter of the
      // requests a shop receives from us carry no contact address at all.
      // The contact URL is the whole reason createPolicy refuses to run
      // without one, so it has to survive here too.
      emulatedUserAgent: userAgent,
      formFactor: 'desktop',
      screenEmulation: { disabled: true },
    });

    if (!runnerResult?.lhr) {
      return { categoryScore: null, audits: [], version: 'unbekannt', error: 'Kein Ergebnis' };
    }
    const { lhr } = runnerResult;

    const audits: RawLighthouseAudit[] = [];
    for (const [id, audit] of Object.entries(lhr.audits ?? {})) {
      const details = audit.details as { items?: LhAuditDetailItem[] } | undefined;
      const items = (details?.items ?? []).map((item) => ({
        ...(item.node?.selector ? { selector: item.node.selector } : {}),
        ...(item.node?.snippet ? { snippet: item.node.snippet } : {}),
        ...(item.node?.explanation ? { explanation: item.node.explanation } : {}),
      }));
      audits.push({
        id,
        title: audit.title ?? id,
        description: audit.description ?? '',
        score: audit.score ?? null,
        items,
      });
    }

    const categoryScore = lhr.categories?.accessibility?.score ?? null;
    const finalUrl = lhr.finalDisplayedUrl ?? lhr.finalUrl ?? lhr.requestedUrl ?? url;
    return {
      categoryScore,
      audits,
      version: lhr.lighthouseVersion ?? 'unbekannt',
      finalUrl,
    };
  } catch (error) {
    return {
      categoryScore: null,
      audits: [],
      version: 'unbekannt',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Find a free TCP port for the Chrome DevTools endpoint.
 *
 * Inherently racy — the listener must be closed before Chromium can bind the
 * port — so the caller gets a clear failure rather than a confusing
 * Lighthouse-attach error if something else takes it in between.
 */
export async function freePort(): Promise<number> {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}
