import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from 'playwright';
import type { RawAxeViolation } from '../core/findings/normalize.ts';
import type { Severity } from '../core/types.ts';

/**
 * axe-core adapter.
 *
 * Tag selection matters: `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa` are the rules
 * that map to the criteria EN 301 549 requires, and `best-practice` rules are
 * included because several of them (skip links, one main landmark, heading
 * order) describe defects a merchant recognises immediately. Normalisation
 * keeps the two groups apart so best practice is never reported as a
 * conformance failure.
 */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] as const;

export interface AxeRunResult {
  readonly violations: RawAxeViolation[];
  readonly axeVersion: string;
  readonly passes: number;
  readonly incomplete: number;
}

export async function runAxe(page: Page): Promise<AxeRunResult> {
  const results = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();

  const violations: RawAxeViolation[] = results.violations.map((violation) => ({
    id: violation.id,
    impact: (violation.impact ?? null) as Severity | null,
    help: violation.help,
    description: violation.description,
    ...(violation.helpUrl ? { helpUrl: violation.helpUrl } : {}),
    tags: violation.tags,
    nodes: violation.nodes.map((node) => ({
      target: node.target.map((t) => (typeof t === 'string' ? t : JSON.stringify(t))),
      html: node.html,
      ...(node.failureSummary ? { failureSummary: node.failureSummary } : {}),
    })),
  }));

  return {
    violations,
    axeVersion: results.testEngine?.version ?? 'unbekannt',
    passes: results.passes.length,
    // "incomplete" results need a human decision — they are the visible edge of
    // the ~43% of criteria automation cannot settle, and the report says so.
    incomplete: results.incomplete.length,
  };
}
