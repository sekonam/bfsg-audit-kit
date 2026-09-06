import { describe, expect, it } from 'vitest';
import {
  bestPracticeFindings,
  conformanceFindings,
  criteriaFromTags,
  hasGermanCopy,
  normalizeFindings,
  type PageAxeResult,
  type PageLighthouseResult,
} from '../src/core/findings/normalize.ts';

function axePage(url: string, journey: PageAxeResult['journey'], violations: unknown[]) {
  return { url, journey, violations } as PageAxeResult;
}

const labelViolation = {
  id: 'label',
  impact: 'critical',
  help: 'Form elements must have labels',
  description: 'Ensures every form element has a label',
  helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/label',
  tags: ['cat.forms', 'wcag2a', 'wcag412', 'wcag332', 'EN-301-549'],
  nodes: [
    { target: ['#email'], html: '<input id="email" type="email">', failureSummary: 'Fix any of…' },
  ],
};

const contrastViolation = {
  id: 'color-contrast',
  impact: 'serious',
  help: 'Elements must have sufficient colour contrast',
  description: 'Ensures contrast between foreground and background',
  tags: ['cat.color', 'wcag2aa', 'wcag143'],
  nodes: [
    { target: ['.price'], html: '<span class="price">19,99 €</span>' },
    { target: ['.hint'], html: '<p class="hint">inkl. MwSt.</p>' },
  ],
};

describe('criteriaFromTags', () => {
  it('extracts and de-duplicates WCAG criteria, sorted numerically', () => {
    expect(criteriaFromTags(['wcag412', 'wcag332', 'wcag2a', 'wcag412'])).toEqual([
      '3.3.2',
      '4.1.2',
    ]);
  });

  it('returns an empty list for best-practice-only rules', () => {
    expect(criteriaFromTags(['cat.semantics', 'best-practice'])).toEqual([]);
  });
});

describe('normalizeFindings', () => {
  it('merges the same rule across pages into one finding with many instances', () => {
    const findings = normalizeFindings([
      axePage('https://shop.example/', 'home', [labelViolation]),
      axePage('https://shop.example/checkout', 'checkout', [labelViolation]),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe('label');
    expect(findings[0]!.instances).toHaveLength(2);
    expect(findings[0]!.instances.map((i) => i.journey)).toEqual(['home', 'checkout']);
  });

  it('uses the German catalogue copy rather than the engine English text', () => {
    const [finding] = normalizeFindings([axePage('https://s.example/', 'home', [labelViolation])]);
    expect(finding!.titleDe).toBe('Formularfeld ohne Beschriftung');
    expect(finding!.titleDe).not.toMatch(/\[EN\]/);
    expect(finding!.remediationDe).toContain('label');
  });

  it('marks untranslated rules explicitly instead of shipping silent English', () => {
    const [finding] = normalizeFindings([
      axePage('https://s.example/', 'home', [
        { ...labelViolation, id: 'some-unknown-future-rule', tags: ['wcag2a', 'wcag131'] },
      ]),
    ]);
    expect(hasGermanCopy('some-unknown-future-rule')).toBe(false);
    expect(finding!.titleDe.startsWith('[EN] ')).toBe(true);
    expect(finding!.criteria).toEqual(['1.3.1']);
  });

  it('applies catalogue severity overrides over the engine impact', () => {
    const [finding] = normalizeFindings([
      axePage('https://s.example/', 'home', [{ ...labelViolation, impact: 'minor' }]),
    ]);
    // The catalogue pins `label` to critical: an unlabelled checkout field
    // makes the order un-completable, whatever axe's default impact says.
    expect(finding!.severity).toBe('critical');
  });

  it('keeps the worst severity when a rule appears with different impacts', () => {
    const [finding] = normalizeFindings([
      axePage('https://s.example/a', 'home', [{ ...contrastViolation, impact: 'minor' }]),
      axePage('https://s.example/b', 'product', [contrastViolation]),
    ]);
    expect(finding!.severity).toBe('serious');
    expect(finding!.instances).toHaveLength(4);
  });

  it('sorts by severity, then by occurrence count', () => {
    const findings = normalizeFindings([
      axePage('https://s.example/', 'home', [contrastViolation, labelViolation]),
    ]);
    expect(findings.map((f) => f.ruleId)).toEqual(['label', 'color-contrast']);
  });

  it('truncates long HTML snippets so the report stays readable', () => {
    const [finding] = normalizeFindings([
      axePage('https://s.example/', 'home', [
        { ...labelViolation, nodes: [{ target: ['#x'], html: `<div>${'a'.repeat(600)}</div>` }] },
      ]),
    ]);
    expect(finding!.instances[0]!.snippet.length).toBeLessThanOrEqual(240);
    expect(finding!.instances[0]!.snippet.endsWith('…')).toBe(true);
  });

  it('separates best-practice findings from WCAG AA conformance findings', () => {
    const findings = normalizeFindings([
      axePage('https://s.example/', 'home', [
        labelViolation,
        {
          id: 'landmark-one-main',
          impact: 'moderate',
          help: 'Document should have one main landmark',
          description: 'Ensures the document has a main landmark',
          tags: ['cat.semantics', 'best-practice'],
          nodes: [{ target: ['html'], html: '<html>' }],
        },
      ]),
    ]);
    expect(conformanceFindings(findings).map((f) => f.ruleId)).toEqual(['label']);
    expect(bestPracticeFindings(findings).map((f) => f.ruleId)).toEqual(['landmark-one-main']);
  });
});

describe('normalizeFindings with Lighthouse', () => {
  const lhPage = (url: string, audits: PageLighthouseResult['audits']): PageLighthouseResult => ({
    url,
    journey: 'home',
    categoryScore: 0.8,
    audits,
  });

  it('does not double-count an audit axe already reported on the same page', () => {
    const findings = normalizeFindings(
      [axePage('https://s.example/', 'home', [labelViolation])],
      [
        lhPage('https://s.example/', [
          { id: 'label', title: 'Form elements have labels', description: '', score: 0, items: [] },
        ]),
      ],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.instances).toHaveLength(1);
    expect(findings[0]!.source).toBe('axe');
  });

  it('adds Lighthouse-only audits that axe does not cover', () => {
    const findings = normalizeFindings(
      [axePage('https://s.example/', 'home', [])],
      [
        lhPage('https://s.example/', [
          {
            id: 'target-size',
            title: 'Touch targets have sufficient size',
            description: '',
            score: 0,
            items: [{ selector: '.qty-minus', snippet: '<button>-</button>' }],
          },
        ]),
      ],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.source).toBe('lighthouse');
    expect(findings[0]!.titleDe).toBe('Zu kleine Klickflächen');
  });

  it('ignores passing and not-applicable audits', () => {
    const findings = normalizeFindings(
      [axePage('https://s.example/', 'home', [])],
      [
        lhPage('https://s.example/', [
          { id: 'video-caption', title: 'x', description: '', score: null, items: [] },
          { id: 'image-alt', title: 'x', description: '', score: 1, items: [] },
        ]),
      ],
    );
    expect(findings).toEqual([]);
  });
});
