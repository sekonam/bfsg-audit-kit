import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { startFixtureServer, type FixtureServer } from './helpers/server.ts';
import { createPolicy } from '../src/core/crawl/policy.ts';
import { scanShop, type ScanOutcome } from '../src/pipeline/scan.ts';
import { missingJourneys } from '../src/pipeline/crawl.ts';

/**
 * End-to-end scan against a LOCAL fixture shop.
 *
 * This is the only test that starts a real browser, and it never leaves the
 * machine: `startFixtureServer` serves `test/fixtures/shop` on 127.0.0.1.
 * Scanning a live third-party shop from a test would be exactly the behaviour
 * the politeness rules exist to prevent.
 */

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'shop');

let server: FixtureServer;
let outcome: ScanOutcome;
let screenshotDir: string;

beforeAll(async () => {
  server = await startFixtureServer(FIXTURE_DIR);
  screenshotDir = await mkdtemp(join(tmpdir(), 'bfsg-shots-'));
  outcome = await scanShop(server.origin, {
    policy: createPolicy({
      contactUrl: 'https://beispiel.de/bot',
      // Fixtures are local; the 2 s interval would add a minute of pure waiting
      // to the test suite. The polite default still applies to every real run.
      minRequestIntervalMs: 0,
      override: { reason: 'Lokale Test-Fixtures auf 127.0.0.1, kein fremder Server' },
    }),
    lighthouse: false,
    screenshotDir,
  });
}, 180_000);

afterAll(async () => {
  await server?.close();
});

describe('crawl against the fixture shop', () => {
  it('identifies the shop system from the markup', () => {
    expect(outcome.result.crawl.platform).toBe('shopware');
    expect(outcome.result.crawl.platformEvidence.length).toBeGreaterThan(0);
  });

  it('reaches all five critical journeys', () => {
    const journeys = outcome.result.crawl.pages.map((p) => p.journey);
    for (const j of ['home', 'category', 'product', 'cart', 'checkout'] as const) {
      expect(journeys, j).toContain(j);
    }
    expect(missingJourneys(outcome.result.crawl)).toEqual([]);
  });

  it('honours robots.txt: /intern is never requested', () => {
    expect(server.requests).toContain('/robots.txt');
    expect(server.requests.filter((p) => p.startsWith('/intern'))).toEqual([]);
    // Counted, not listed. The count is what the report prints; the addresses
    // themselves must not reach any generated document — see
    // CrawlResult.robotsExcluded and operator-e2e.test.ts.
    expect(outcome.result.crawl.robotsExcluded).toBeGreaterThan(0);
    expect(JSON.stringify(outcome.result.crawl.skipped)).not.toContain('/intern');
  });

  it('does not follow a redirect onto a robots-disallowed page', () => {
    // /weiterleitung 302s to /intern/geheim.html. The redirect target must
    // never be requested — the guard resolves the chain hop by hop, so the
    // disallowed hop is refused instead of fetched and then discarded.
    expect(server.requests).toContain('/weiterleitung');
    expect(server.requests.filter((p) => p.startsWith('/intern'))).toEqual([]);
    // The URL we asked for is the shop's own and is named; the target it
    // redirected to is not, for the same reason as above.
    const redirect = outcome.result.crawl.skipped.find((s) => s.url.endsWith('/weiterleitung'));
    expect(redirect, JSON.stringify(outcome.result.crawl.skipped)).toBeDefined();
    expect(redirect?.reason).toContain(
      'Weiterleitung auf eine ausgeschlossene oder fremde Adresse',
    );
    expect(redirect?.reason).not.toContain('/intern');
  });

  it('identifies itself in the User-Agent on every single request', () => {
    // Previously this asserted only that robots were respected, which the
    // fixture server cannot observe. It now checks the header the shop
    // actually receives — the whole reason a contact URL is mandatory.
    expect(server.requestLog.length).toBeGreaterThan(5);
    for (const entry of server.requestLog) {
      expect(entry.userAgent, `${entry.path} carried "${entry.userAgent}"`).toMatch(
        /^BfsgAuditBot\/[\d.]+ \(\+https:\/\/beispiel\.de\/bot\)$/,
      );
    }
  });

  it('samples each template once: the two product pages collapse to one', () => {
    const productPages = outcome.result.crawl.pages.filter((p) => p.journey === 'product');
    expect(productPages).toHaveLength(1);
    expect(
      outcome.result.crawl.skipped.some((s) => s.reason.startsWith('identisches Template')),
    ).toBe(true);
  });

  it('stays inside the page budget', () => {
    expect(outcome.result.crawl.pages.length).toBeLessThanOrEqual(20);
    expect(
      server.requests.filter((p) => p.endsWith('.html') || p === '/').length,
    ).toBeLessThanOrEqual(21);
  });

  it('fetches each HTML page exactly once — axe runs inside the crawl visit', () => {
    // Sub-resources (the theme stylesheet) are naturally requested once per
    // page; what must not happen is the same document being navigated twice.
    const documents = server.requests.filter((p) => p === '/' || p.endsWith('.html'));
    const counts = new Map<string, number>();
    for (const path of documents) counts.set(path, (counts.get(path) ?? 0) + 1);
    for (const [path, count] of counts) {
      expect(count, `${path} was fetched ${count} times`).toBe(1);
    }
  });
});

describe('scan findings from the fixture shop', () => {
  it('finds the defects planted in the fixtures', () => {
    const ruleIds = outcome.result.findings.map((f) => f.ruleId);
    // Planted deliberately: see the comments at the top of each fixture file.
    expect(ruleIds).toContain('image-alt');
    expect(ruleIds).toContain('button-name');
    expect(ruleIds).toContain('link-name');
    expect(ruleIds).toContain('color-contrast');
    expect(ruleIds).toContain('label');
    expect(ruleIds).toContain('meta-viewport');
    expect(ruleIds).toContain('heading-order');
  });

  it('reports German copy, not axe English, for the catalogued rules', () => {
    const label = outcome.result.findings.find((f) => f.ruleId === 'label');
    expect(label?.titleDe).toBe('Formularfeld ohne Beschriftung');
    expect(label?.remediationDe).toMatch(/label/);
    for (const finding of outcome.result.findings) {
      // A [EN] prefix is allowed but should not appear for rules we catalogue.
      if (['label', 'image-alt', 'color-contrast', 'link-name'].includes(finding.ruleId)) {
        expect(finding.titleDe).not.toMatch(/^\[EN\]/);
      }
    }
  });

  it('attributes the unlabelled fields to the checkout journey', () => {
    const label = outcome.result.findings.find((f) => f.ruleId === 'label');
    expect(label?.instances.some((i) => i.journey === 'checkout')).toBe(true);
    expect(outcome.result.score.criticalJourneysAffected).toContain('checkout');
  });

  it('produces a conformance score below 100 and a usable prospect score', () => {
    expect(outcome.result.score.conformance).toBeLessThan(100);
    expect(outcome.result.score.conformance).toBeGreaterThan(0);
    expect(outcome.result.score.prospect).toBeGreaterThan(0);
    expect(outcome.result.score.failedCriteria.length).toBeGreaterThan(3);
    expect(outcome.result.score.effortHours.high).toBeGreaterThan(
      outcome.result.score.effortHours.low,
    );
  });

  it('records the axe version actually used rather than a hard-coded string', () => {
    expect(outcome.result.toolVersions['axe-core']).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('captures element screenshots for findings', async () => {
    const files = await readdir(screenshotDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith('.png'))).toBe(true);
    const withShot = outcome.result.findings.filter((f) =>
      f.instances.some((i) => i.screenshot !== undefined),
    );
    expect(withShot.length).toBeGreaterThan(0);
  });
});
