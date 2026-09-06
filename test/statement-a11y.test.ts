import { beforeAll, describe, expect, it } from 'vitest';
import { renderStatementHtml } from '../src/core/statement/render.ts';
import { auditHtmlDocument, describeViolations, type DocumentAudit } from './helpers/a11y.ts';
import { sampleStatement } from './helpers/sample-statement.ts';

/**
 * The Barrierefreiheitserklärung is the one document where failing WCAG is not
 * merely a defect but a contradiction: it is the operator's public statement
 * that their service is accessible. It is therefore checked in a real browser,
 * in both its published and its ENTWURF form.
 */

let published: DocumentAudit;
let draft: DocumentAudit;

beforeAll(async () => {
  const answers = sampleStatement();
  published = await auditHtmlDocument(renderStatementHtml(answers).html);

  const unreviewed = { ...answers, meta: { ...answers.meta, legalReviewConfirmed: false } };
  draft = await auditHtmlDocument(renderStatementHtml(unreviewed).html);
}, 180_000);

describe('the generated Barrierefreiheitserklärung is itself accessible', () => {
  it('has no axe violations at WCAG 2.1 AA', () => {
    expect(describeViolations(published)).toBe('');
    expect(published.violations).toEqual([]);
  });

  it('is still accessible with the ENTWURF banner rendered', () => {
    expect(describeViolations(draft)).toBe('');
  });

  it('renders without console or page errors', () => {
    expect(published.consoleErrors).toEqual([]);
    expect(draft.consoleErrors).toEqual([]);
  });

  it('declares German, which is what a screen reader needs to pronounce it', () => {
    expect(published.lang).toBe('de');
    expect(published.title).toContain('Erklärung zur Barrierefreiheit');
  });

  it('has one h1 and a heading outline with no skipped levels', () => {
    expect(published.headings.filter((h) => h.level === 1)).toHaveLength(1);
    let previous = 1;
    for (const heading of published.headings) {
      expect(
        heading.level - previous,
        `Sprung von h${previous} auf h${heading.level} bei "${heading.text}"`,
      ).toBeLessThanOrEqual(1);
      previous = heading.level;
    }
  });

  it('puts the skip link first in the keyboard order and makes it visible on focus', () => {
    expect(published.firstFocusable?.text).toBe('Zum Inhalt springen');
    expect(published.firstFocusable?.visible).toBe(true);
  });
});
