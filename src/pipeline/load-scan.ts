import { readFile } from 'node:fs/promises';
import type { ScanResult } from '../core/types.ts';

/**
 * Load a stored scan result.
 *
 * `JSON.parse(...) as ScanResult` was a lie the type system could not catch: a
 * scan.json can arrive from a colleague, from an older version of this tool, or
 * hand-edited, and everything downstream renders its URLs into `href`
 * attributes. Statement answers are schema-validated; this closes the same hole
 * for scans, without pretending to validate every leaf — the checks are the
 * ones the renderers actually depend on.
 */

export class ScanFileError extends Error {
  override readonly name = 'ScanFileError';
  readonly issues: readonly string[];

  constructor(path: string, issues: readonly string[]) {
    super(`${path} ist keine gültige Prüfdatei:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.issues = issues;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate the structure the report and diff generators rely on. */
export function validateScanResult(input: unknown, path = '(Eingabe)'): ScanResult {
  const issues: string[] = [];
  const require = (condition: boolean, message: string): void => {
    if (!condition) issues.push(message);
  };

  require(isObject(input), 'Die Datei enthält kein Objekt.');
  if (!isObject(input)) throw new ScanFileError(path, issues);

  require(typeof input['origin'] === 'string', 'origin fehlt oder ist kein Text.');
  require(typeof input['shopId'] === 'string', 'shopId fehlt oder ist kein Text.');
  require(typeof input['scannedAt'] === 'string', 'scannedAt fehlt oder ist kein Text.');
  require(Array.isArray(input['findings']), 'findings fehlt oder ist keine Liste.');
  require(isObject(input['score']), 'score fehlt oder ist kein Objekt.');
  require(isObject(input['crawl']), 'crawl fehlt oder ist kein Objekt.');

  const score = input['score'];
  if (isObject(score)) {
    require(typeof score['conformance'] === 'number', 'score.conformance fehlt.');
    require(Array.isArray(score['bySeverity']), 'score.bySeverity fehlt.');
    require(isObject(score['effortHours']), 'score.effortHours fehlt.');
  }

  const crawl = input['crawl'];
  if (isObject(crawl)) {
    require(Array.isArray(crawl['pages']), 'crawl.pages fehlt.');
    require(Array.isArray(crawl['skipped']), 'crawl.skipped fehlt.');
  }

  const findings = input['findings'];
  if (Array.isArray(findings)) {
    findings.forEach((finding, index) => {
      if (!isObject(finding)) {
        issues.push(`findings[${index}] ist kein Objekt.`);
        return;
      }
      require(typeof finding['ruleId'] === 'string', `findings[${index}].ruleId fehlt.`);
      require(Array.isArray(finding['instances']), `findings[${index}].instances fehlt.`);
    });
  }

  if (issues.length > 0) throw new ScanFileError(path, issues);
  return input as unknown as ScanResult;
}

export async function loadScanResult(path: string): Promise<ScanResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new ScanFileError(path, [error instanceof Error ? error.message : String(error)]);
  }
  return validateScanResult(parsed, path);
}
