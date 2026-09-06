import { describe, expect, it } from 'vitest';
import type { Finding, Journey, Severity } from '../src/core/types.ts';
import {
  affectedCriticalJourneys,
  conformanceBand,
  estimateEffort,
  occurrenceFactor,
  prospectScore,
  scoreScan,
  SEVERITY_WEIGHT,
} from '../src/core/findings/score.ts';

function finding(
  ruleId: string,
  severity: Severity,
  journeys: Journey[],
  opts: { criteria?: string[]; mechanical?: boolean } = {},
): Finding {
  return {
    ruleId,
    source: 'axe',
    criteria: opts.criteria ?? ['1.3.1'],
    severity,
    titleDe: ruleId,
    descriptionDe: 'x',
    remediationDe: 'y',
    mechanicallyFixable: opts.mechanical ?? false,
    instances: journeys.map((journey, i) => ({
      url: `https://s.example/${journey}${i}`,
      journey,
      selector: `#n${i}`,
      snippet: '<div>',
    })),
  };
}

describe('occurrenceFactor', () => {
  it('is 1 for a single occurrence and grows logarithmically', () => {
    expect(occurrenceFactor(1)).toBe(1);
    expect(occurrenceFactor(2)).toBe(2);
    expect(occurrenceFactor(4)).toBe(3);
    expect(occurrenceFactor(8)).toBe(4);
  });

  it('is capped so one pathological page cannot dominate the score', () => {
    expect(occurrenceFactor(10_000)).toBe(7);
    expect(occurrenceFactor(64)).toBe(7);
  });

  it('is 0 for no occurrences', () => {
    expect(occurrenceFactor(0)).toBe(0);
  });
});

describe('scoreScan', () => {
  it('gives a clean shop 100 with no failed criteria', () => {
    const score = scoreScan([]);
    expect(score.conformance).toBe(100);
    expect(score.penalty).toBe(0);
    expect(score.failedCriteria).toEqual([]);
    expect(score.criticalJourneysAffected).toEqual([]);
  });

  it('computes a golden penalty and conformance value', () => {
    // critical(10) x factor(1) + serious(6) x factor(2) = 22
    const findings = [
      finding('label', 'critical', ['checkout']),
      finding('color-contrast', 'serious', ['home', 'product']),
    ];
    const score = scoreScan(findings);
    expect(score.penalty).toBe(22);
    expect(score.conformance).toBe(Math.round(100 * Math.exp(-22 / 120)));
    expect(score.conformance).toBe(83);
  });

  it('lands a typical shop in the 50-89 band the Buzzmatic study reports as median', () => {
    const findings = [
      finding('label', 'critical', ['checkout', 'cart']),
      finding('color-contrast', 'serious', ['home', 'category', 'product', 'cart']),
      finding('link-name', 'serious', ['home', 'category', 'product']),
      finding('heading-order', 'moderate', ['home', 'product'], { criteria: ['1.3.1'] }),
    ];
    const score = scoreScan(findings);
    expect(score.conformance).toBeGreaterThanOrEqual(50);
    expect(score.conformance).toBeLessThanOrEqual(89);
  });

  it('weights severities in the documented order', () => {
    expect(SEVERITY_WEIGHT.critical).toBeGreaterThan(SEVERITY_WEIGHT.serious);
    expect(SEVERITY_WEIGHT.serious).toBeGreaterThan(SEVERITY_WEIGHT.moderate);
    expect(SEVERITY_WEIGHT.moderate).toBeGreaterThan(SEVERITY_WEIGHT.minor);
    const critical = scoreScan([finding('a', 'critical', ['home'])]).conformance;
    const minor = scoreScan([finding('a', 'minor', ['home'])]).conformance;
    expect(critical).toBeLessThan(minor);
  });

  it('never counts best-practice findings towards conformance', () => {
    const withBestPractice = scoreScan([
      finding('label', 'critical', ['checkout']),
      finding('landmark-one-main', 'critical', ['home'], { criteria: [] }),
    ]);
    const withoutBestPractice = scoreScan([finding('label', 'critical', ['checkout'])]);
    expect(withBestPractice.conformance).toBe(withoutBestPractice.conformance);
    // …but they are still reported.
    expect(withBestPractice.totalFindings).toBe(2);
  });

  it('collects failed criteria de-duplicated and numerically sorted', () => {
    const score = scoreScan([
      finding('a', 'serious', ['home'], { criteria: ['1.4.10', '1.1.1'] }),
      finding('b', 'serious', ['home'], { criteria: ['1.4.3', '1.1.1'] }),
    ]);
    expect(score.failedCriteria).toEqual(['1.1.1', '1.4.3', '1.4.10']);
  });

  it('reports a per-severity breakdown covering all four levels', () => {
    const score = scoreScan([finding('a', 'serious', ['home', 'cart'])]);
    expect(score.bySeverity.map((b) => b.severity)).toEqual([
      'critical',
      'serious',
      'moderate',
      'minor',
    ]);
    const serious = score.bySeverity.find((b) => b.severity === 'serious')!;
    expect(serious.findings).toBe(1);
    expect(serious.instances).toBe(2);
  });

  it('is monotonic: more occurrences of the same defect never improve the score', () => {
    const few = scoreScan([finding('a', 'serious', ['home'])]).conformance;
    const many = scoreScan([
      finding('a', 'serious', ['home', 'category', 'product', 'cart', 'checkout']),
    ]).conformance;
    expect(many).toBeLessThan(few);
  });
});

describe('affectedCriticalJourneys', () => {
  it('lists only the five critical journeys, in canonical order', () => {
    const journeys = affectedCriticalJourneys([
      finding('a', 'critical', ['checkout', 'home', 'other']),
    ]);
    expect(journeys).toEqual(['home', 'checkout']);
  });

  it('ignores moderate and minor findings', () => {
    expect(affectedCriticalJourneys([finding('a', 'moderate', ['checkout'])])).toEqual([]);
    expect(affectedCriticalJourneys([finding('a', 'minor', ['checkout'])])).toEqual([]);
  });
});

describe('prospectScore', () => {
  it('rates a nearly clean shop as a poor prospect — nothing to sell', () => {
    expect(prospectScore(97, 1, 0.5)).toBeLessThan(15);
  });

  it('rates a hopeless shop as a poor prospect — a fixed price cannot absorb it', () => {
    expect(prospectScore(5, 5, 0.5)).toBeLessThan(15);
  });

  it('peaks for a mid-range shop with defects across the critical journeys', () => {
    const good = prospectScore(55, 5, 0.8);
    expect(good).toBeGreaterThan(70);
    expect(good).toBeGreaterThan(prospectScore(55, 1, 0.8));
    expect(good).toBeGreaterThan(prospectScore(55, 5, 0.1));
  });

  it('stays within 0-100', () => {
    for (const c of [0, 10, 55, 80, 100]) {
      const s = prospectScore(c, 5, 1);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});

describe('estimateEffort', () => {
  it('returns the fixed overhead for a clean shop', () => {
    expect(estimateEffort([])).toEqual({ low: 3, high: 6 });
  });

  it('costs judgement work more than mechanical work', () => {
    const mechanical = estimateEffort([finding('a', 'serious', ['home'], { mechanical: true })]);
    const judgement = estimateEffort([finding('a', 'serious', ['home'], { mechanical: false })]);
    expect(judgement.high).toBeGreaterThan(mechanical.high);
  });

  it('produces a range that brackets the 20-30 h assumption behind the €2,400 SKU', () => {
    const findings = [
      finding('label', 'critical', ['checkout', 'cart']),
      finding('color-contrast', 'serious', ['home', 'category', 'product', 'cart'], {
        mechanical: true,
      }),
      finding('link-name', 'serious', ['home', 'category', 'product']),
      finding('image-alt', 'critical', ['category', 'product']),
      finding('button-name', 'critical', ['home', 'cart']),
      finding('heading-order', 'moderate', ['home', 'product'], { mechanical: true }),
      finding('html-has-lang', 'serious', ['home'], { mechanical: true }),
    ];
    const effort = estimateEffort(findings);
    expect(effort.low).toBeGreaterThan(6);
    expect(effort.high).toBeLessThan(40);
    expect(effort.high).toBeGreaterThan(effort.low);
  });
});

describe('conformanceBand', () => {
  it('describes machine-detectable defects only, never legal status', () => {
    for (const s of [0, 30, 60, 80, 95]) {
      const band = conformanceBand(s);
      expect(band).toMatch(/erkennbare Mängel/);
      expect(band).not.toMatch(/konform|rechts|Gesetz/i);
    }
  });

  it('is monotone in the score', () => {
    expect(conformanceBand(95)).toBe('Wenige automatisch erkennbare Mängel');
    expect(conformanceBand(10)).toBe('Sehr viele automatisch erkennbare Mängel');
  });
});
