import type { Finding, Journey, ScanResult, Severity } from '../../src/core/types.ts';
import { scoreScan } from '../../src/core/findings/score.ts';

/**
 * A synthetic but realistic scan result, used by the rendering tests so they do
 * not depend on a browser run. Mirrors the shape of the fixture shop.
 */

function finding(
  ruleId: string,
  severity: Severity,
  criteria: string[],
  journeys: Journey[],
  overrides: Partial<Finding> = {},
): Finding {
  return {
    ruleId,
    source: 'axe',
    criteria,
    severity,
    titleDe: `Titel für ${ruleId}`,
    descriptionDe: `Beschreibung für ${ruleId} mit Sonderzeichen: <script>alert("x")</script> & Co.`,
    remediationDe: `Behebung für ${ruleId}.`,
    mechanicallyFixable: severity === 'moderate',
    helpUrl: `https://dequeuniversity.com/rules/axe/4.10/${ruleId}`,
    instances: journeys.map((journey, i) => ({
      url: `https://muster-shop.de/${journey}/${i}`,
      journey,
      selector: `#feld-${i}`,
      snippet: `<input id="feld-${i}">`,
    })),
    ...overrides,
  };
}

export function sampleFindings(): Finding[] {
  return [
    finding('label', 'critical', ['3.3.2', '4.1.2'], ['checkout', 'cart']),
    finding('color-contrast', 'serious', ['1.4.3'], ['home', 'category', 'product']),
    finding('link-name', 'serious', ['2.4.4', '4.1.2'], ['home']),
    finding('heading-order', 'moderate', [], ['category'], { mechanicallyFixable: true }),
  ];
}

export function sampleScan(overrides: Partial<ScanResult> = {}): ScanResult {
  const findings = overrides.findings ?? sampleFindings();
  return {
    shopId: 'muster-shop.de',
    origin: 'https://muster-shop.de',
    crawl: {
      origin: 'https://muster-shop.de',
      platform: 'shopware',
      platformEvidence: ['meta generator: Shopware'],
      pages: [
        {
          url: 'https://muster-shop.de/',
          journey: 'home',
          title: 'Start',
          signature: 'a1',
          httpStatus: 200,
        },
        {
          url: 'https://muster-shop.de/kategorie/schuhe',
          journey: 'category',
          title: 'Schuhe',
          signature: 'a2',
          httpStatus: 200,
        },
        {
          url: 'https://muster-shop.de/produkte/schuh',
          journey: 'product',
          title: 'Schuh',
          signature: 'a3',
          httpStatus: 200,
        },
        {
          url: 'https://muster-shop.de/warenkorb',
          journey: 'cart',
          title: 'Warenkorb',
          signature: 'a4',
          httpStatus: 200,
        },
        {
          url: 'https://muster-shop.de/kasse',
          journey: 'checkout',
          title: 'Kasse',
          signature: 'a5',
          httpStatus: 200,
        },
        {
          url: 'https://muster-shop.de/ueber-uns',
          journey: 'other',
          title: 'Über uns',
          signature: 'a6',
          httpStatus: 200,
        },
      ],
      skipped: [
        { url: 'https://muster-shop.de/intern', reason: 'durch robots.txt ausgeschlossen' },
      ],
      robotsRespected: true,
      startedAt: '2026-09-06T08:00:00.000Z',
      finishedAt: '2026-09-06T08:02:00.000Z',
    },
    findings,
    score: scoreScan(findings),
    lighthouseScore: 72,
    toolVersions: { 'axe-core': '4.13.0', lighthouse: '12.8.2', 'bfsg-audit-kit': '0.1.0' },
    scannedAt: '2026-09-06T08:02:00.000Z',
    ...overrides,
  };
}
