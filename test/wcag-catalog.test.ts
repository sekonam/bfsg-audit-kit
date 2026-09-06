import { describe, expect, it } from 'vitest';
import {
  compareCriteria,
  criterionFromAxeTag,
  getCriterion,
  isAaCriterion,
  WCAG_21_AA,
} from '../src/core/wcag/catalog.ts';
import { RULE_COPY } from '../src/core/wcag/rule-catalog.ts';

describe('WCAG 2.1 AA catalogue', () => {
  it('contains exactly the 50 A and AA success criteria of WCAG 2.1', () => {
    expect(WCAG_21_AA).toHaveLength(50);
    expect(WCAG_21_AA.filter((c) => c.level === 'A')).toHaveLength(30);
    expect(WCAG_21_AA.filter((c) => c.level === 'AA')).toHaveLength(20);
  });

  it('contains no AAA criteria (they are outside the service scope)', () => {
    // 1.4.6 Contrast (Enhanced) and 2.4.9 Link Purpose (Link Only) are AAA.
    expect(isAaCriterion('1.4.6')).toBe(false);
    expect(isAaCriterion('2.4.9')).toBe(false);
    expect(isAaCriterion('2.4.8')).toBe(false);
  });

  it('has unique ids and a German title for every criterion', () => {
    const ids = new Set(WCAG_21_AA.map((c) => c.id));
    expect(ids.size).toBe(WCAG_21_AA.length);
    for (const c of WCAG_21_AA) {
      expect(c.titleDe.length).toBeGreaterThan(3);
      expect(c.titleEn.length).toBeGreaterThan(3);
    }
  });

  it('maps every criterion to its EN 301 549 clause', () => {
    expect(getCriterion('1.4.3')?.en301549).toBe('9.1.4.3');
    expect(getCriterion('1.4.10')?.en301549).toBe('9.1.4.10');
    expect(getCriterion('4.1.3')?.en301549).toBe('9.4.1.3');
  });

  it('carries the correct German titles for the criteria most cited in reports', () => {
    expect(getCriterion('1.1.1')?.titleDe).toBe('Nicht-Text-Inhalt');
    expect(getCriterion('1.4.3')?.titleDe).toBe('Kontrast (Minimum)');
    expect(getCriterion('2.4.7')?.titleDe).toBe('Sichtbarer Fokus');
    expect(getCriterion('4.1.2')?.titleDe).toBe('Name, Rolle, Wert');
    expect(getCriterion('3.3.2')?.titleDe).toBe('Beschriftungen (Labels) oder Anweisungen');
  });
});

describe('criterionFromAxeTag', () => {
  it('parses single-digit criteria', () => {
    expect(criterionFromAxeTag('wcag143')).toBe('1.4.3');
    expect(criterionFromAxeTag('wcag111')).toBe('1.1.1');
    expect(criterionFromAxeTag('wcag412')).toBe('4.1.2');
  });

  it('parses two-digit criteria without confusing them with single-digit ones', () => {
    expect(criterionFromAxeTag('wcag1410')).toBe('1.4.10');
    expect(criterionFromAxeTag('wcag1411')).toBe('1.4.11');
    expect(criterionFromAxeTag('wcag1412')).toBe('1.4.12');
    expect(criterionFromAxeTag('wcag1413')).toBe('1.4.13');
  });

  it('ignores conformance-level and category tags', () => {
    expect(criterionFromAxeTag('wcag2a')).toBeUndefined();
    expect(criterionFromAxeTag('wcag2aa')).toBeUndefined();
    expect(criterionFromAxeTag('wcag21aa')).toBeUndefined();
    expect(criterionFromAxeTag('best-practice')).toBeUndefined();
    expect(criterionFromAxeTag('cat.forms')).toBeUndefined();
    expect(criterionFromAxeTag('EN-301-549')).toBeUndefined();
  });

  it('ignores AAA criteria that axe also tags', () => {
    // wcag146 = 1.4.6 Contrast (Enhanced), level AAA.
    expect(criterionFromAxeTag('wcag146')).toBeUndefined();
  });
});

describe('compareCriteria', () => {
  it('sorts numerically, not lexically', () => {
    const sorted = ['1.4.10', '1.4.3', '2.4.1', '1.1.1'].sort(compareCriteria);
    expect(sorted).toEqual(['1.1.1', '1.4.3', '1.4.10', '2.4.1']);
  });

  it('is a total order returning 0 for equal ids', () => {
    expect(compareCriteria('1.4.3', '1.4.3')).toBe(0);
  });
});

describe('rule copy catalogue', () => {
  it('provides German title, description and remediation for every rule', () => {
    for (const [ruleId, copy] of Object.entries(RULE_COPY)) {
      expect(copy.titleDe, ruleId).not.toMatch(/\[EN\]/);
      expect(copy.descriptionDe.length, ruleId).toBeGreaterThan(20);
      expect(copy.remediationDe.length, ruleId).toBeGreaterThan(10);
    }
  });

  it('never asserts legal consequences (RDG boundary)', () => {
    const forbidden =
      /(bußgeld|strafe|abmahnung|rechtswidrig|haftbar|verstoß gegen das gesetz|gesetzeswidrig|sie sind verpflichtet, andernfalls)/i;
    for (const [ruleId, copy] of Object.entries(RULE_COPY)) {
      const text = `${copy.titleDe} ${copy.descriptionDe} ${copy.remediationDe}`;
      expect(forbidden.test(text), `${ruleId} contains legal-consequence wording`).toBe(false);
    }
  });

  it('covers the rules that dominate real shop scans', () => {
    for (const ruleId of [
      'color-contrast',
      'label',
      'link-name',
      'button-name',
      'image-alt',
      'html-has-lang',
      'heading-order',
      'meta-viewport',
      'select-name',
      'frame-title',
    ]) {
      expect(RULE_COPY[ruleId], ruleId).toBeDefined();
    }
  });
});
