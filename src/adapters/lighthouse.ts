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
}

interface LhAuditDetailItem {
  node?: { selector?: string; snippet?: string; explanation?: string };
  [key: string]: unknown;
}

/**
 * Run the Lighthouse accessibility category against an already-running Chrome
 * (the same browser the crawler uses), attached over CDP on `port`.
 */
export async function runLighthouse(url: string, port: number): Promise<LighthouseRunResult> {
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
    return { categoryScore, audits, version: lhr.lighthouseVersion ?? 'unbekannt' };
  } catch (error) {
    return {
      categoryScore: null,
      audits: [],
      version: 'unbekannt',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Find a free TCP port for the Chrome DevTools endpoint. */
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
