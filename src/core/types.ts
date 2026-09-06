/**
 * Shared domain types for the BFSG audit kit.
 *
 * Vocabulary note: everything here describes *technical conformance* with
 * WCAG 2.1 AA / EN 301 549. Nothing in this codebase models legal compliance,
 * legal risk or penalties — see docs/PRODUCT-SPEC.md, "RDG boundary".
 */

/** Shop systems the fingerprinter can recognise from public markup. */
export type Platform =
  | 'shopify'
  | 'shopware'
  | 'woocommerce'
  | 'magento'
  | 'jtl'
  | 'oxid'
  | 'plentymarkets'
  | 'shopify-hydrogen'
  | 'unknown';

/**
 * The five critical journeys of a consumer shop, plus `other` for additional
 * sampled templates. Reports are organised around these.
 */
export type Journey = 'home' | 'category' | 'product' | 'cart' | 'checkout' | 'other';

export const CRITICAL_JOURNEYS: readonly Journey[] = [
  'home',
  'category',
  'product',
  'cart',
  'checkout',
] as const;

/** axe-core impact levels, reused as the single severity vocabulary. */
export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';

export const SEVERITY_ORDER: readonly Severity[] = [
  'critical',
  'serious',
  'moderate',
  'minor',
] as const;

/**
 * Severity comes from a scanning engine running inside a page the shop
 * controls, so it is untrusted input, not a guaranteed union member. A page can
 * hijack `window.axe` and return whatever it likes — including a value that
 * would land in a CSS class attribute, or one that makes a score arithmetic
 * NaN. Everything crossing that boundary is checked with this.
 */
export function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && (SEVERITY_ORDER as readonly string[]).includes(value);
}

export type WcagLevel = 'A' | 'AA';

export interface WcagCriterion {
  /** Success criterion number, e.g. "1.4.3". */
  readonly id: string;
  readonly level: WcagLevel;
  /** Official German title of the success criterion. */
  readonly titleDe: string;
  readonly titleEn: string;
  /** Corresponding EN 301 549 clause, e.g. "9.1.4.3". */
  readonly en301549: string;
}

/** One concrete occurrence of a finding on one page. */
export interface FindingInstance {
  readonly url: string;
  readonly journey: Journey;
  /** CSS selector of the offending node. */
  readonly selector: string;
  /** Truncated outer HTML of the offending node. */
  readonly snippet: string;
  /** Human-readable reason produced by the engine, if any. */
  readonly detail?: string;
  /** Path (relative to the report directory) of an element screenshot. */
  readonly screenshot?: string;
}

/** A normalised, de-duplicated defect across the whole crawl of one shop. */
export interface Finding {
  /** Stable identity: the engine rule id. Findings are merged on this. */
  readonly ruleId: string;
  readonly source: 'axe' | 'lighthouse';
  /** WCAG 2.1 success criteria this rule maps to. May be empty for best practices. */
  readonly criteria: readonly string[];
  readonly severity: Severity;
  readonly titleDe: string;
  readonly descriptionDe: string;
  /** What a developer has to change. German, theme-oriented. */
  readonly remediationDe: string;
  /**
   * True when this defect is normally fixed by a repeatable theme edit
   * (a codemod candidate) rather than by human judgement. Feeds the
   * prospect score: mechanical defects are cheap billable hours.
   */
  readonly mechanicallyFixable: boolean;
  /** Link to the engine's own documentation, for the appendix. */
  readonly helpUrl?: string;
  readonly instances: readonly FindingInstance[];
}

/** One sampled page of a shop. */
export interface SampledPage {
  readonly url: string;
  readonly journey: Journey;
  readonly title: string;
  /** Structural DOM signature used to deduplicate templates. */
  readonly signature: string;
  readonly httpStatus: number;
}

export interface CrawlResult {
  readonly origin: string;
  readonly platform: Platform;
  readonly platformEvidence: readonly string[];
  readonly pages: readonly SampledPage[];
  /** URLs discovered but not fetched, and why. */
  readonly skipped: readonly { url: string; reason: string }[];
  readonly robotsRespected: boolean;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface ScoreBreakdown {
  readonly severity: Severity;
  readonly findings: number;
  readonly instances: number;
  readonly penalty: number;
}

export interface ScanScore {
  /** Sum of severity × occurrence penalties. Unbounded, higher is worse. */
  readonly penalty: number;
  /** 0–100 heuristic conformance indicator. Not a normative measure. */
  readonly conformance: number;
  /** 0–100 outreach priority. Higher = better prospect for the practice. */
  readonly prospect: number;
  /**
   * Findings and occurrences that COUNT — i.e. those mapped to a WCAG 2.1 AA
   * criterion. The report's headline number and the table beneath it are both
   * derived from these, so they cannot disagree.
   */
  readonly totalFindings: number;
  readonly totalInstances: number;
  /** Best-practice findings, reported separately and never scored. */
  readonly bestPracticeFindings: number;
  readonly bestPracticeInstances: number;
  readonly failedCriteria: readonly string[];
  readonly criticalJourneysAffected: readonly Journey[];
  readonly bySeverity: readonly ScoreBreakdown[];
  /** Estimated remediation effort in hours, as a range. */
  readonly effortHours: { readonly low: number; readonly high: number };
}

export interface ScanResult {
  readonly shopId: string;
  readonly origin: string;
  readonly crawl: CrawlResult;
  readonly findings: readonly Finding[];
  readonly score: ScanScore;
  /** Lighthouse accessibility category score, 0–100, if Lighthouse ran. */
  readonly lighthouseScore: number | null;
  readonly toolVersions: Readonly<Record<string, string>>;
  readonly scannedAt: string;
}
