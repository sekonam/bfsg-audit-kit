import type { Finding, FindingInstance, Journey, Severity } from '../types.ts';
import { compareCriteria, criterionFromAxeTag } from '../wcag/catalog.ts';
import { LIGHTHOUSE_ONLY_COPY, RULE_COPY } from '../wcag/rule-catalog.ts';

/**
 * Engine-agnostic input shapes. The adapters in `src/adapters` map axe-core and
 * Lighthouse output onto these, so the normalisation logic stays pure and
 * testable without a browser.
 */
export interface RawAxeViolation {
  readonly id: string;
  readonly impact: Severity | null | undefined;
  readonly help: string;
  readonly description: string;
  readonly helpUrl?: string;
  readonly tags: readonly string[];
  readonly nodes: readonly {
    readonly target: readonly string[];
    readonly html: string;
    readonly failureSummary?: string;
  }[];
}

export interface PageAxeResult {
  readonly url: string;
  readonly journey: Journey;
  readonly violations: readonly RawAxeViolation[];
}

export interface RawLighthouseAudit {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** null for "not applicable"; 1 for pass; 0 for fail. */
  readonly score: number | null;
  readonly items: readonly {
    readonly selector?: string;
    readonly snippet?: string;
    readonly explanation?: string;
  }[];
}

export interface PageLighthouseResult {
  readonly url: string;
  readonly journey: Journey;
  /** Lighthouse accessibility category score 0–1, or null. */
  readonly categoryScore: number | null;
  readonly audits: readonly RawLighthouseAudit[];
}

const MAX_SNIPPET = 240;

function truncate(text: string, max = MAX_SNIPPET): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
}

/** WCAG criteria an axe rule maps to, derived from its tags. */
export function criteriaFromTags(tags: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const tag of tags) {
    const id = criterionFromAxeTag(tag);
    if (id) ids.add(id);
  }
  return [...ids].sort(compareCriteria);
}

interface Draft {
  ruleId: string;
  source: 'axe' | 'lighthouse';
  criteria: string[];
  severity: Severity;
  titleDe: string;
  descriptionDe: string;
  remediationDe: string;
  mechanicallyFixable: boolean;
  helpUrl?: string;
  instances: FindingInstance[];
}

/**
 * True when the German copy for this rule is missing and the report will fall
 * back to the engine's English text. Surfaced by a test so catalogue gaps are
 * visible rather than silently shipped to a customer.
 */
export function hasGermanCopy(ruleId: string): boolean {
  return ruleId in RULE_COPY || ruleId in LIGHTHOUSE_ONLY_COPY;
}

function draftFromAxe(violation: RawAxeViolation): Draft {
  const copy = RULE_COPY[violation.id];
  const derived = criteriaFromTags(violation.tags);
  return {
    ruleId: violation.id,
    source: 'axe',
    criteria: copy?.criteria ? [...copy.criteria].sort(compareCriteria) : derived,
    severity: copy?.severity ?? violation.impact ?? 'moderate',
    titleDe: copy?.titleDe ?? `[EN] ${violation.help}`,
    descriptionDe: copy?.descriptionDe ?? `[EN] ${violation.description}`,
    remediationDe:
      copy?.remediationDe ??
      'Für diese Regel liegt noch kein deutscher Hinweistext vor. Siehe die verlinkte Regelbeschreibung.',
    mechanicallyFixable: copy?.mechanicallyFixable ?? false,
    ...(violation.helpUrl ? { helpUrl: violation.helpUrl } : {}),
    instances: [],
  };
}

function mergeInto(map: Map<string, Draft>, draft: Draft, instances: FindingInstance[]): void {
  const existing = map.get(draft.ruleId);
  if (!existing) {
    map.set(draft.ruleId, { ...draft, instances: [...instances] });
    return;
  }
  existing.instances.push(...instances);
  // Keep the worst severity seen for a rule across pages.
  if (severityRank(draft.severity) < severityRank(existing.severity)) {
    existing.severity = draft.severity;
  }
  for (const c of draft.criteria) {
    if (!existing.criteria.includes(c)) existing.criteria.push(c);
  }
  existing.criteria.sort(compareCriteria);
}

function severityRank(s: Severity): number {
  return { critical: 0, serious: 1, moderate: 2, minor: 3 }[s];
}

/**
 * Merge per-page axe and Lighthouse output into one de-duplicated finding list
 * for a whole shop.
 *
 * Rules are merged on the engine rule id, so a missing form label appearing on
 * eight templates is ONE finding with eight instances — which is how the report
 * and the effort estimate should treat it.
 *
 * Lighthouse is used only for audits axe did not already report on that page:
 * Lighthouse's accessibility category is itself axe-powered, so counting both
 * would double-count every occurrence.
 */
export function normalizeFindings(
  axePages: readonly PageAxeResult[],
  lighthousePages: readonly PageLighthouseResult[] = [],
): Finding[] {
  const drafts = new Map<string, Draft>();

  for (const page of axePages) {
    for (const violation of page.violations) {
      const instances: FindingInstance[] = violation.nodes.map((node) => ({
        url: page.url,
        journey: page.journey,
        selector: node.target.join(' '),
        snippet: truncate(node.html),
        ...(node.failureSummary ? { detail: truncate(node.failureSummary, 400) } : {}),
      }));
      mergeInto(drafts, draftFromAxe(violation), instances);
    }
  }

  const axeRuleIdsByUrl = new Map<string, Set<string>>();
  for (const page of axePages) {
    axeRuleIdsByUrl.set(page.url, new Set(page.violations.map((v) => v.id)));
  }

  for (const page of lighthousePages) {
    const seenByAxe = axeRuleIdsByUrl.get(page.url) ?? new Set<string>();
    for (const audit of page.audits) {
      if (audit.score === null || audit.score >= 1) continue;
      if (seenByAxe.has(audit.id)) continue;
      const copy = LIGHTHOUSE_ONLY_COPY[audit.id] ?? RULE_COPY[audit.id];
      const instances: FindingInstance[] = (audit.items.length > 0 ? audit.items : [{}]).map(
        (item) => ({
          url: page.url,
          journey: page.journey,
          selector: item.selector ?? '(nicht ermittelt)',
          snippet: truncate(item.snippet ?? ''),
          ...(item.explanation ? { detail: truncate(item.explanation, 400) } : {}),
        }),
      );
      mergeInto(
        drafts,
        {
          ruleId: audit.id,
          source: 'lighthouse',
          criteria: copy?.criteria ? [...copy.criteria].sort(compareCriteria) : [],
          severity: copy?.severity ?? 'moderate',
          titleDe: copy?.titleDe ?? `[EN] ${audit.title}`,
          descriptionDe: copy?.descriptionDe ?? `[EN] ${audit.description}`,
          remediationDe:
            copy?.remediationDe ??
            'Für diesen Lighthouse-Test liegt noch kein deutscher Hinweistext vor.',
          mechanicallyFixable: copy?.mechanicallyFixable ?? false,
          instances: [],
        },
        instances,
      );
    }
  }

  return [...drafts.values()]
    .map((d): Finding => ({
      ruleId: d.ruleId,
      source: d.source,
      criteria: d.criteria,
      severity: d.severity,
      titleDe: d.titleDe,
      descriptionDe: d.descriptionDe,
      remediationDe: d.remediationDe,
      mechanicallyFixable: d.mechanicallyFixable,
      ...(d.helpUrl ? { helpUrl: d.helpUrl } : {}),
      instances: d.instances,
    }))
    .sort(
      (a, b) =>
        severityRank(a.severity) - severityRank(b.severity) ||
        b.instances.length - a.instances.length ||
        a.ruleId.localeCompare(b.ruleId),
    );
}

/** Findings that map to at least one WCAG 2.1 A/AA success criterion. */
export function conformanceFindings(findings: readonly Finding[]): Finding[] {
  return findings.filter((f) => f.criteria.length > 0);
}

/**
 * Findings with no WCAG 2.1 AA mapping (axe "best practice" rules). Reported in
 * a clearly separated section so the customer is never told that a best-practice
 * hint is a conformance failure.
 */
export function bestPracticeFindings(findings: readonly Finding[]): Finding[] {
  return findings.filter((f) => f.criteria.length === 0);
}
