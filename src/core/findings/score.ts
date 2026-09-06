import type { Finding, Journey, ScanScore, ScoreBreakdown, Severity } from '../types.ts';
import { CRITICAL_JOURNEYS, SEVERITY_ORDER } from '../types.ts';
import { compareCriteria } from '../wcag/catalog.ts';
import { bestPracticeFindings, conformanceFindings } from './normalize.ts';

/**
 * Scoring model.
 *
 * Two numbers come out of a scan and they answer different questions:
 *
 *  - `conformance` (0–100) — how bad is this shop? Shown to the customer.
 *  - `prospect`    (0–100) — is this shop worth calling? Internal only.
 *
 * Both are HEURISTICS for prioritisation. Neither is a normative measure of
 * WCAG conformance: a shop scoring 100 has merely passed the ~57% of criteria a
 * machine can check. Every report says so in those words.
 */

/** Penalty weight per severity level. */
export const SEVERITY_WEIGHT: Readonly<Record<Severity, number>> = {
  critical: 10,
  serious: 6,
  moderate: 3,
  minor: 1,
};

/**
 * Occurrence multiplier: 1 + log2(n), so the 2nd occurrence adds as much as the
 * 3rd and 4th together. Capped so that one pathological page (a table with 400
 * unlabelled inputs) cannot dominate the whole score.
 */
export const MAX_OCCURRENCE_FACTOR = 7;

export function occurrenceFactor(instances: number): number {
  if (instances <= 0) return 0;
  return Math.min(1 + Math.log2(instances), MAX_OCCURRENCE_FACTOR);
}

/**
 * Decay constant converting an unbounded penalty into 0–100.
 *
 * Calibrated against the Buzzmatic study of 2,446 German shops (19.7% scored
 * 90+, 80.1% scored 50–89, 0.2% critical): a shop with a handful of serious
 * defects on a few templates should land in the 50–89 band, not near zero.
 */
export const DECAY = 120;

function penaltyOf(finding: Finding): number {
  return SEVERITY_WEIGHT[finding.severity] * occurrenceFactor(finding.instances.length);
}

/** Distinct critical journeys affected by serious-or-worse findings. */
export function affectedCriticalJourneys(findings: readonly Finding[]): Journey[] {
  const hit = new Set<Journey>();
  for (const finding of findings) {
    if (finding.severity !== 'critical' && finding.severity !== 'serious') continue;
    for (const instance of finding.instances) {
      if (CRITICAL_JOURNEYS.includes(instance.journey)) hit.add(instance.journey);
    }
  }
  return CRITICAL_JOURNEYS.filter((j) => hit.has(j));
}

/**
 * Effort estimate in hours for the remediation SKU.
 *
 * Per finding: a severity base, multiplied down for mechanical fixes (a colour
 * token change fixes every occurrence at once) and up for judgement work
 * (alt text, focus order), plus a small per-occurrence term.
 * Fixed overhead covers project setup, the manual pass and the re-test.
 */
export function estimateEffort(findings: readonly Finding[]): { low: number; high: number } {
  const base: Record<Severity, number> = { critical: 1.5, serious: 1, moderate: 0.5, minor: 0.25 };
  let raw = 0;
  for (const finding of findings) {
    const perFinding =
      base[finding.severity] * (finding.mechanicallyFixable ? 0.6 : 1.4) +
      Math.min(0.05 * Math.max(0, finding.instances.length - 1), 4);
    raw += perFinding;
  }
  return {
    low: Math.round((raw * 0.8 + 3) * 2) / 2,
    high: Math.round((raw * 1.6 + 6) * 2) / 2,
  };
}

/**
 * Outreach priority.
 *
 * A good prospect is NOT the worst shop. It is a shop with real, visible,
 * fixed-price-able problems on the journeys that matter:
 *
 *  - gap term       — bell curve peaking around conformance 55. A shop at 95
 *                     has nothing to sell; a shop at 10 needs a rebuild, which
 *                     the €2,400 fixed price cannot absorb (SKU D territory).
 *  - journey term   — defects on checkout and cart are the ones a merchant
 *                     recognises as lost revenue.
 *  - fixability term — mechanically fixable defects are cheap hours for us.
 */
export const PROSPECT_PEAK = 55;
export const PROSPECT_WIDTH = 20;

export function prospectScore(
  conformance: number,
  criticalJourneysAffected: number,
  mechanicalShare: number,
): number {
  const gapTerm = Math.exp(-((conformance - PROSPECT_PEAK) ** 2) / (2 * PROSPECT_WIDTH ** 2));
  const journeyTerm = 0.4 + 0.6 * (criticalJourneysAffected / CRITICAL_JOURNEYS.length);
  const fixabilityTerm = 0.5 + 0.5 * mechanicalShare;
  return Math.round(100 * gapTerm * journeyTerm * fixabilityTerm);
}

/**
 * Score a whole scan.
 *
 * Only findings that map to a WCAG 2.1 A/AA success criterion affect
 * `conformance`. Best-practice findings are reported but never counted, so the
 * customer is not charged against a criterion that does not exist.
 */
export function scoreScan(findings: readonly Finding[]): ScanScore {
  const counted = conformanceFindings(findings);
  const bestPractice = bestPracticeFindings(findings);
  const penalty = counted.reduce((sum, f) => sum + penaltyOf(f), 0);
  const conformance = Math.round(100 * Math.exp(-penalty / DECAY));

  const bySeverity: ScoreBreakdown[] = SEVERITY_ORDER.map((severity) => {
    const group = counted.filter((f) => f.severity === severity);
    return {
      severity,
      findings: group.length,
      instances: group.reduce((n, f) => n + f.instances.length, 0),
      penalty: Math.round(group.reduce((n, f) => n + penaltyOf(f), 0) * 100) / 100,
    };
  });

  const failedCriteria = [...new Set(counted.flatMap((f) => f.criteria))].sort(compareCriteria);
  const journeys = affectedCriticalJourneys(counted);
  const mechanicalShare =
    counted.length === 0 ? 0 : counted.filter((f) => f.mechanicallyFixable).length / counted.length;

  return {
    penalty: Math.round(penalty * 100) / 100,
    conformance,
    prospect: prospectScore(conformance, journeys.length, mechanicalShare),
    // Counted findings only. Mixing all findings into the headline while the
    // severity table below it summed only the counted ones put two
    // irreconcilable numbers on the same page of the customer's report.
    totalFindings: counted.length,
    totalInstances: counted.reduce((n, f) => n + f.instances.length, 0),
    bestPracticeFindings: bestPractice.length,
    bestPracticeInstances: bestPractice.reduce((n, f) => n + f.instances.length, 0),
    failedCriteria,
    criticalJourneysAffected: journeys,
    bySeverity,
    effortHours: estimateEffort(counted),
  };
}

/** German band label for a conformance score, used in report headings. */
export function conformanceBand(score: number): string {
  if (score >= 90) return 'Wenige automatisch erkennbare Mängel';
  if (score >= 70) return 'Einzelne automatisch erkennbare Mängel';
  if (score >= 50) return 'Deutliche automatisch erkennbare Mängel';
  if (score >= 25) return 'Erhebliche automatisch erkennbare Mängel';
  return 'Sehr viele automatisch erkennbare Mängel';
}
