import type { Finding, Journey, ScanResult, Severity } from '../types.ts';
import { CRITICAL_JOURNEYS } from '../types.ts';
import { affectedCriticalJourneys } from '../findings/score.ts';
import { conformanceFindings } from '../findings/normalize.ts';

/**
 * Baseline diffing for the Care retainer.
 *
 * What the customer is paying for is not a monthly re-scan — anyone sells that
 * for €39 — but the answer to "did the theme update break something we fixed?".
 * So the diff is built around regressions: defects that came back, defects that
 * are newly present, and critical journeys that were clean and now are not.
 *
 * A finding is identified by its rule id, the same key normalisation merges on,
 * so a defect that moves from one template to another is a change in occurrence
 * count rather than a resolve-plus-new pair.
 */

export type DeltaKind = 'neu' | 'behoben' | 'zugenommen' | 'abgenommen' | 'unverändert';

export interface FindingDelta {
  readonly ruleId: string;
  readonly titleDe: string;
  readonly severity: Severity;
  readonly criteria: readonly string[];
  readonly before: number;
  readonly after: number;
  readonly kind: DeltaKind;
  /** Critical journeys this finding touches in the newer scan. */
  readonly journeys: readonly Journey[];
}

export interface ScanDiff {
  readonly origin: string;
  readonly baselineAt: string;
  readonly currentAt: string;
  readonly conformanceBefore: number;
  readonly conformanceAfter: number;
  readonly conformanceDelta: number;
  readonly deltas: readonly FindingDelta[];
  readonly newFindings: readonly FindingDelta[];
  readonly resolvedFindings: readonly FindingDelta[];
  readonly worsened: readonly FindingDelta[];
  readonly improved: readonly FindingDelta[];
  /** Critical journeys with a serious-or-worse finding now but not before. */
  readonly journeysNewlyAffected: readonly Journey[];
  readonly journeysNowClean: readonly Journey[];
  readonly pagesAdded: readonly string[];
  readonly pagesRemoved: readonly string[];
  /**
   * True when something got worse: a new finding, more occurrences of an
   * existing one, a lower conformance score, or a critical journey that was
   * clean and now is not. The last case matters on its own — a theme update
   * that moves an existing critical defect onto the checkout changes no count
   * and no score, and is exactly the event the Care retainer exists to catch.
   */
  readonly hasRegression: boolean;
}

function journeysOf(finding: Finding): Journey[] {
  const seen = new Set<Journey>(finding.instances.map((i) => i.journey));
  return CRITICAL_JOURNEYS.filter((j) => seen.has(j));
}

function kindOf(before: number, after: number): DeltaKind {
  if (before === 0 && after > 0) return 'neu';
  if (before > 0 && after === 0) return 'behoben';
  if (after > before) return 'zugenommen';
  if (after < before) return 'abgenommen';
  return 'unverändert';
}

export function diffScans(baseline: ScanResult, current: ScanResult): ScanDiff {
  const before = new Map(baseline.findings.map((f) => [f.ruleId, f]));
  const after = new Map(current.findings.map((f) => [f.ruleId, f]));

  const deltas: FindingDelta[] = [];
  for (const ruleId of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(ruleId);
    const a = after.get(ruleId);
    const source = a ?? b;
    if (!source) continue;
    const beforeCount = b?.instances.length ?? 0;
    const afterCount = a?.instances.length ?? 0;
    deltas.push({
      ruleId,
      titleDe: source.titleDe,
      severity: source.severity,
      criteria: source.criteria,
      before: beforeCount,
      after: afterCount,
      kind: kindOf(beforeCount, afterCount),
      journeys: a ? journeysOf(a) : [],
    });
  }

  const severityRank: Record<Severity, number> = {
    critical: 0,
    serious: 1,
    moderate: 2,
    minor: 3,
  };
  deltas.sort(
    (x, y) =>
      severityRank[x.severity] - severityRank[y.severity] ||
      y.after - y.before - (x.after - x.before) ||
      x.ruleId.localeCompare(y.ruleId),
  );

  const journeysBefore = new Set(affectedCriticalJourneys(conformanceFindings(baseline.findings)));
  const journeysAfter = new Set(affectedCriticalJourneys(conformanceFindings(current.findings)));

  const newFindings = deltas.filter((d) => d.kind === 'neu');
  const worsened = deltas.filter((d) => d.kind === 'zugenommen');
  const conformanceDelta = current.score.conformance - baseline.score.conformance;
  const journeysNewlyAffected = CRITICAL_JOURNEYS.filter(
    (j) => journeysAfter.has(j) && !journeysBefore.has(j),
  );

  const baselineUrls = new Set(baseline.crawl.pages.map((p) => p.url));
  const currentUrls = new Set(current.crawl.pages.map((p) => p.url));

  return {
    origin: current.origin,
    baselineAt: baseline.scannedAt,
    currentAt: current.scannedAt,
    conformanceBefore: baseline.score.conformance,
    conformanceAfter: current.score.conformance,
    conformanceDelta,
    deltas,
    newFindings,
    resolvedFindings: deltas.filter((d) => d.kind === 'behoben'),
    worsened,
    improved: deltas.filter((d) => d.kind === 'abgenommen'),
    journeysNewlyAffected,
    journeysNowClean: CRITICAL_JOURNEYS.filter(
      (j) => journeysBefore.has(j) && !journeysAfter.has(j),
    ),
    pagesAdded: [...currentUrls].filter((u) => !baselineUrls.has(u)),
    pagesRemoved: [...baselineUrls].filter((u) => !currentUrls.has(u)),
    hasRegression:
      newFindings.length > 0 ||
      worsened.length > 0 ||
      conformanceDelta < 0 ||
      journeysNewlyAffected.length > 0,
  };
}
