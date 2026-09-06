import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScanResult } from '../core/types.ts';
import { diffScans, type ScanDiff } from '../core/monitor/diff.ts';
import {
  renderRegressionReportHtml,
  type RegressionReportOptions,
} from '../core/monitor/report.ts';
import { SCAN_JSON } from './report.ts';
import { ScanFileError, validateScanResult } from './load-scan.ts';

/**
 * Monitoring output. NOTE: nothing here sends anything.
 *
 * The service specification called for a "regression email". The toolkit has no
 * email capability at all (§ 7 Abs. 2 UWG; see scripts/guard-no-email.sh), so
 * monitoring produces files: a German regression report the operator forwards,
 * and a machine-readable diff for scripting. Adding a mailer here would break
 * the build.
 */

export const BASELINE_JSON = 'baseline.json';
export const REGRESSION_HTML = 'ueberwachungsbericht.html';
export const DIFF_JSON = 'diff.json';

export interface MonitorOutput {
  readonly diff: ScanDiff;
  readonly htmlPath: string;
  readonly diffPath: string;
}

/**
 * The baseline to compare against: an explicit `baseline.json` if one was set,
 * otherwise the last scan. Both missing is a normal first-run situation and
 * gets a German message naming the fix, not an unhandled rejection.
 */
export async function readBaseline(outDir: string): Promise<ScanResult> {
  for (const name of [BASELINE_JSON, SCAN_JSON]) {
    try {
      return validateScanResult(JSON.parse(await readFile(join(outDir, name), 'utf8')), name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new ScanFileError(outDir, [
    `Weder ${BASELINE_JSON} noch ${SCAN_JSON} gefunden. Zuerst "bfsg scan" ausführen und dann "bfsg baseline" setzen.`,
  ]);
}

export async function writeBaseline(outDir: string, scan: ScanResult): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, BASELINE_JSON);
  await writeFile(path, `${JSON.stringify(scan, null, 2)}\n`, 'utf8');
  return path;
}

export async function writeRegressionReport(
  outDir: string,
  baseline: ScanResult,
  current: ScanResult,
  options: RegressionReportOptions = {},
): Promise<MonitorOutput> {
  await mkdir(outDir, { recursive: true });
  const diff = diffScans(baseline, current);

  const htmlPath = join(outDir, REGRESSION_HTML);
  await writeFile(htmlPath, renderRegressionReportHtml(diff, options), 'utf8');

  const diffPath = join(outDir, DIFF_JSON);
  await writeFile(diffPath, `${JSON.stringify(diff, null, 2)}\n`, 'utf8');

  return { diff, htmlPath, diffPath };
}
