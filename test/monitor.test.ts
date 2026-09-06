import { beforeAll, describe, expect, it } from 'vitest';
import type { Finding, ScanResult } from '../src/core/types.ts';
import { diffScans } from '../src/core/monitor/diff.ts';
import { renderRegressionReportHtml } from '../src/core/monitor/report.ts';
import { scoreScan } from '../src/core/findings/score.ts';
import { auditHtmlDocument, describeViolations, type DocumentAudit } from './helpers/a11y.ts';
import { sampleFindings, sampleScan } from './helpers/sample-scan.ts';

function withFindings(base: ScanResult, findings: Finding[], scannedAt: string): ScanResult {
  return { ...base, findings, score: scoreScan(findings), scannedAt };
}

const baseline = sampleScan();

describe('diffScans', () => {
  it('reports no regression when nothing changed', () => {
    const diff = diffScans(
      baseline,
      withFindings(baseline, sampleFindings(), '2026-10-06T08:00:00Z'),
    );
    expect(diff.hasRegression).toBe(false);
    expect(diff.newFindings).toEqual([]);
    expect(diff.worsened).toEqual([]);
    expect(diff.conformanceDelta).toBe(0);
    expect(diff.deltas.every((d) => d.kind === 'unverändert')).toBe(true);
  });

  it('flags a new finding as a regression', () => {
    const current = withFindings(
      baseline,
      [
        ...sampleFindings(),
        {
          ruleId: 'meta-viewport',
          source: 'axe',
          criteria: ['1.4.4'],
          severity: 'serious',
          titleDe: 'Zoom unterbunden',
          descriptionDe: 'x',
          remediationDe: 'y',
          mechanicallyFixable: true,
          instances: [
            {
              url: 'https://muster-shop.de/kasse',
              journey: 'checkout',
              selector: 'meta',
              snippet: '<meta>',
            },
          ],
        },
      ],
      '2026-10-06T08:00:00Z',
    );
    const diff = diffScans(baseline, current);
    expect(diff.hasRegression).toBe(true);
    expect(diff.newFindings.map((d) => d.ruleId)).toEqual(['meta-viewport']);
    expect(diff.newFindings[0]!.kind).toBe('neu');
    expect(diff.newFindings[0]!.journeys).toEqual(['checkout']);
    expect(diff.conformanceDelta).toBeLessThan(0);
  });

  it('reports a fixed defect as resolved, not as a regression', () => {
    const current = withFindings(
      baseline,
      sampleFindings().filter((f) => f.ruleId !== 'label'),
      '2026-10-06T08:00:00Z',
    );
    const diff = diffScans(baseline, current);
    expect(diff.hasRegression).toBe(false);
    expect(diff.resolvedFindings.map((d) => d.ruleId)).toEqual(['label']);
    expect(diff.conformanceDelta).toBeGreaterThan(0);
    expect(diff.journeysNowClean).toContain('checkout');
  });

  it('treats more occurrences of the same defect as a regression', () => {
    const findings = sampleFindings().map((f) =>
      f.ruleId === 'color-contrast'
        ? {
            ...f,
            instances: [
              ...f.instances,
              {
                url: 'https://muster-shop.de/neu',
                journey: 'product' as const,
                selector: '.p',
                snippet: '<p>',
              },
            ],
          }
        : f,
    );
    const diff = diffScans(baseline, withFindings(baseline, findings, '2026-10-06T08:00:00Z'));
    expect(diff.hasRegression).toBe(true);
    expect(diff.worsened.map((d) => d.ruleId)).toEqual(['color-contrast']);
    expect(diff.worsened[0]!.before).toBe(3);
    expect(diff.worsened[0]!.after).toBe(4);
  });

  it('treats a critical defect moving onto the checkout as a regression', () => {
    // Same rule, same severity, same occurrence count, same score — only the
    // journey changed. This is precisely the theme-update failure the Care
    // retainer exists to catch, and it used to report "no deterioration".
    const moved = sampleFindings().map((f) =>
      f.ruleId === 'label'
        ? {
            ...f,
            instances: [
              {
                url: 'https://muster-shop.de/kasse',
                journey: 'checkout' as const,
                selector: '#e',
                snippet: '<input>',
              },
              {
                url: 'https://muster-shop.de/kasse2',
                journey: 'checkout' as const,
                selector: '#f',
                snippet: '<input>',
              },
            ],
          }
        : f,
    );
    const cleanCheckout = withFindings(
      baseline,
      sampleFindings().map((f) =>
        f.ruleId === 'label'
          ? {
              ...f,
              instances: [
                {
                  url: 'https://muster-shop.de/',
                  journey: 'home' as const,
                  selector: '#a',
                  snippet: '<input>',
                },
                {
                  url: 'https://muster-shop.de/x',
                  journey: 'home' as const,
                  selector: '#b',
                  snippet: '<input>',
                },
              ],
            }
          : f,
      ),
      '2026-09-06T08:00:00Z',
    );
    const diff = diffScans(cleanCheckout, withFindings(baseline, moved, '2026-10-06T08:00:00Z'));
    expect(diff.conformanceDelta).toBe(0);
    expect(diff.newFindings).toEqual([]);
    expect(diff.worsened).toEqual([]);
    expect(diff.journeysNewlyAffected).toContain('checkout');
    expect(diff.hasRegression).toBe(true);
  });

  it('identifies a defect on a different page as a moved occurrence, not a new defect', () => {
    const findings = sampleFindings().map((f) =>
      f.ruleId === 'link-name'
        ? {
            ...f,
            instances: [
              {
                url: 'https://muster-shop.de/anderswo',
                journey: 'product' as const,
                selector: '.a',
                snippet: '<a>',
              },
            ],
          }
        : f,
    );
    const diff = diffScans(baseline, withFindings(baseline, findings, '2026-10-06T08:00:00Z'));
    expect(diff.newFindings).toEqual([]);
    expect(diff.resolvedFindings).toEqual([]);
    expect(diff.deltas.find((d) => d.ruleId === 'link-name')?.kind).toBe('unverändert');
  });

  it('reports which critical journeys became affected', () => {
    const findings = sampleFindings().map((f) =>
      f.ruleId === 'color-contrast'
        ? {
            ...f,
            instances: [
              ...f.instances,
              {
                url: 'https://muster-shop.de/kasse',
                journey: 'checkout' as const,
                selector: '.x',
                snippet: '<p>',
              },
            ],
          }
        : f,
    );
    // Baseline where checkout was clean.
    const cleanBaseline = withFindings(
      baseline,
      sampleFindings().filter((f) => f.ruleId !== 'label'),
      '2026-09-06T08:00:00Z',
    );
    const diff = diffScans(cleanBaseline, withFindings(baseline, findings, '2026-10-06T08:00:00Z'));
    expect(diff.journeysNewlyAffected).toContain('checkout');
  });

  it('reports changes in the sampled page set, which can explain a vanished finding', () => {
    const current: ScanResult = {
      ...baseline,
      scannedAt: '2026-10-06T08:00:00Z',
      crawl: {
        ...baseline.crawl,
        pages: [
          ...baseline.crawl.pages.slice(1),
          {
            url: 'https://muster-shop.de/neu',
            journey: 'other',
            title: 'Neu',
            signature: 'z1',
            httpStatus: 200,
          },
        ],
      },
    };
    const diff = diffScans(baseline, current);
    expect(diff.pagesAdded).toEqual(['https://muster-shop.de/neu']);
    expect(diff.pagesRemoved).toEqual(['https://muster-shop.de/']);
  });
});

describe('regression report', () => {
  let regression: DocumentAudit;
  let clean: DocumentAudit;

  beforeAll(async () => {
    const worse = withFindings(
      baseline,
      [
        ...sampleFindings(),
        {
          ruleId: 'button-name',
          source: 'axe',
          criteria: ['4.1.2'],
          severity: 'critical',
          titleDe: 'Schaltfläche ohne Beschriftung',
          descriptionDe: 'x',
          remediationDe: 'y',
          mechanicallyFixable: false,
          instances: [
            {
              url: 'https://muster-shop.de/kasse',
              journey: 'checkout',
              selector: 'button',
              snippet: '<button>',
            },
          ],
        },
      ],
      '2026-10-06T08:00:00Z',
    );
    regression = await auditHtmlDocument(
      renderRegressionReportHtml(diffScans(baseline, worse), { shopName: 'Musterschuhe GmbH' }),
    );
    clean = await auditHtmlDocument(
      renderRegressionReportHtml(
        diffScans(baseline, withFindings(baseline, sampleFindings(), '2026-10-06T08:00:00Z')),
      ),
    );
  }, 180_000);

  it('is accessible in both its "regression" and "all clear" forms', () => {
    expect(describeViolations(regression)).toBe('');
    expect(describeViolations(clean)).toBe('');
    expect(regression.consoleErrors).toEqual([]);
  });

  it('answers the customer question in the first line', () => {
    const html = renderRegressionReportHtml(
      diffScans(baseline, withFindings(baseline, sampleFindings(), '2026-10-06T08:00:00Z')),
    );
    expect(html).toContain('Keine Verschlechterung gegenüber der letzten Prüfung');
  });

  it('names what got worse', () => {
    expect(regression.headings.map((h) => h.text)).toContain('Veränderungen');
    expect(regression.title).toContain('Überwachungsbericht');
  });

  it('repeats the scope limitation instead of implying a full re-audit', () => {
    const html = renderRegressionReportHtml(
      diffScans(baseline, withFindings(baseline, sampleFindings(), '2026-10-06T08:00:00Z')),
    );
    expect(html).toContain('keine rechtliche Bewertung');
    expect(html).toContain('Manuelle Kriterien');
    expect(html).toContain('nicht Gegenstand dieses Durchlaufs');
  });
});
