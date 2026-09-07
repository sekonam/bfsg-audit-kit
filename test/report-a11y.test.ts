import { beforeAll, describe, expect, it } from 'vitest';
import { renderReportHtml } from '../src/core/report/report.ts';
import {
  auditHtmlDocument,
  describeViolations,
  headingOrderJumps,
  type DocumentAudit,
} from './helpers/a11y.ts';
import { sampleScan } from './helpers/sample-scan.ts';

/**
 * The report is checked with the same engine it uses on customers.
 *
 * If this test is ever weakened, the product is weakened: selling a WCAG audit
 * on a report that fails WCAG is not a defensible position.
 */

let audit: DocumentAudit;

beforeAll(async () => {
  const html = renderReportHtml(sampleScan(), {
    shopName: 'Musterschuhe GmbH',
    operatorName: 'Prüfstelle Muster',
    operatorContact: 'kontakt@beispiel.de',
  });
  audit = await auditHtmlDocument(html);
}, 120_000);

describe('the generated report is itself accessible', () => {
  it('has no axe violations at WCAG 2.1 AA', () => {
    expect(describeViolations(audit)).toBe('');
    expect(audit.violations).toEqual([]);
  });

  it('renders without console or page errors', () => {
    expect(audit.consoleErrors).toEqual([]);
  });

  it('declares German and carries a descriptive title', () => {
    expect(audit.lang).toBe('de');
    expect(audit.title).toContain('Musterschuhe GmbH');
  });

  it('has exactly one h1 and no skipped heading levels', () => {
    const h1s = audit.headings.filter((h) => h.level === 1);
    expect(h1s).toHaveLength(1);

    expect(headingOrderJumps(audit)).toEqual([]);
  });

  it('offers the skip link as the first thing keyboard focus reaches, and shows it', () => {
    expect(audit.firstFocusable?.tag).toBe('a');
    expect(audit.firstFocusable?.text).toBe('Zum Inhalt springen');
    // The link is off-screen until focused; on focus it must become visible.
    expect(audit.firstFocusable?.visible).toBe(true);
  });
});
