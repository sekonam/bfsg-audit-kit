import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startFixtureServer, type FixtureServer } from './helpers/server.ts';
import { createPolicy } from '../src/core/crawl/policy.ts';
import { scanShop, type ScanOutcome } from '../src/pipeline/scan.ts';

/**
 * Lighthouse runs against the LOCAL fixture shop, attached over CDP to the same
 * Chromium instance the crawler uses.
 *
 * This test exists because "we also run Lighthouse" is exactly the kind of
 * claim that is easy to write and easy to have silently broken: Lighthouse
 * needs a DevTools port, and the adapter swallows its errors by design so a
 * scan never dies over it. Without this test a permanently failing Lighthouse
 * would look identical to a working one.
 */

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'shop');

let server: FixtureServer;
let outcome: ScanOutcome;
const MAX_PAGES = 12;

beforeAll(async () => {
  server = await startFixtureServer(FIXTURE_DIR);
  outcome = await scanShop(server.origin, {
    policy: createPolicy({
      contactUrl: 'https://beispiel.de/bot',
      minRequestIntervalMs: 0,
      maxPagesPerShop: MAX_PAGES,
      override: { reason: 'Lokale Test-Fixtures auf 127.0.0.1, kein fremder Server' },
    }),
    lighthouse: true,
  });
}, 300_000);

afterAll(async () => {
  await server?.close();
});

describe('Lighthouse accessibility audit', () => {
  it('produces a category score, and no Lighthouse run failed', () => {
    expect(outcome.warnings.filter((w) => w.includes('Lighthouse'))).toEqual([]);
    expect(outcome.result.lighthouseScore).not.toBeNull();
    expect(outcome.result.lighthouseScore!).toBeGreaterThan(0);
    expect(outcome.result.lighthouseScore!).toBeLessThan(100);
  });

  it('records the real Lighthouse version', () => {
    expect(outcome.result.toolVersions['lighthouse']).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('contributes audits axe does not report, without double-counting the ones it does', () => {
    const lighthouseOnly = outcome.result.findings.filter((f) => f.source === 'lighthouse');
    expect(lighthouseOnly.length).toBeGreaterThan(0);

    // Rule ids are unique by construction (findings are keyed on them), so
    // asserting uniqueness proves nothing. What would actually double is the
    // OCCURRENCE count. Lighthouse-sourced instances are recognisable by the
    // placeholder selector it emits when it has no node; an axe-reported rule
    // must never gain one of those for a page axe already covered.
    const axeSelectors = (f: (typeof outcome.result.findings)[number]) =>
      f.instances.filter((i) => i.selector !== '(nicht ermittelt)');

    for (const finding of outcome.result.findings) {
      if (finding.source !== 'axe') continue;
      const pagesWithAxeInstances = new Set(axeSelectors(finding).map((i) => i.url));
      const placeholderPages = finding.instances
        .filter((i) => i.selector === '(nicht ermittelt)')
        .map((i) => i.url);
      for (const url of placeholderPages) {
        expect(
          pagesWithAxeInstances.has(url),
          `${finding.ruleId} gained a Lighthouse instance for ${url}, which axe already reported`,
        ).toBe(false);
      }
    }

    // color-contrast fires on the fixture shop in both engines; every instance
    // of it must be attributed to axe.
    const contrast = outcome.result.findings.find((f) => f.ruleId === 'color-contrast');
    expect(contrast?.source).toBe('axe');
    expect(contrast?.instances.every((i) => i.selector !== '(nicht ermittelt)')).toBe(true);
  });

  it('keeps the documented page cap over crawl AND Lighthouse loads together', () => {
    const documents = server.requests.filter((p) => p === '/' || p.endsWith('.html'));
    expect(documents.length).toBeLessThanOrEqual(MAX_PAGES);
  });

  it('identifies the bot on Lighthouse requests too, not just crawl requests', () => {
    for (const entry of server.requestLog) {
      expect(entry.userAgent, `${entry.path} carried "${entry.userAgent}"`).toContain(
        'BfsgAuditBot',
      );
    }
  });
}, 300_000);
