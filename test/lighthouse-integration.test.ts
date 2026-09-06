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

beforeAll(async () => {
  server = await startFixtureServer(FIXTURE_DIR);
  outcome = await scanShop(server.origin, {
    policy: createPolicy({
      contactUrl: 'https://beispiel.de/bot',
      minRequestIntervalMs: 0,
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
    // Nothing may appear twice: one finding per rule id, whatever its source.
    const ids = outcome.result.findings.map((f) => f.ruleId);
    expect(new Set(ids).size).toBe(ids.length);
  });
}, 300_000);
