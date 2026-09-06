import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScanResult } from '../core/types.ts';
import { renderReportHtml, type ReportOptions } from '../core/report/report.ts';
import { renderPdfFromFile } from '../adapters/pdf.ts';

/**
 * Per-shop output layout.
 *
 *   out/<shop-id>/
 *     scan.json          machine-readable result, also the monitoring baseline
 *     bericht.html       the customer-facing German report
 *     bericht.pdf        the same document, printed
 *     screenshots/*.png  element screenshots referenced by the report
 *
 * German filenames are deliberate: this file is attached to an email or handed
 * over on a call, and "bericht.pdf" is what the recipient expects to see.
 */

export const REPORT_HTML = 'bericht.html';
export const REPORT_PDF = 'bericht.pdf';
export const SCAN_JSON = 'scan.json';
export const SCREENSHOT_DIR = 'screenshots';

export interface WriteReportOptions extends ReportOptions {
  readonly pdf?: boolean;
}

export interface WrittenReport {
  readonly htmlPath: string;
  readonly pdfPath?: string;
  readonly scanPath: string;
}

export function shopOutputDir(dataDir: string, shopId: string): string {
  return join(dataDir, shopId);
}

export async function writeScan(outDir: string, scan: ScanResult): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, SCAN_JSON);
  await writeFile(path, `${JSON.stringify(scan, null, 2)}\n`, 'utf8');
  return path;
}

export async function writeReport(
  outDir: string,
  scan: ScanResult,
  options: WriteReportOptions = {},
): Promise<WrittenReport> {
  await mkdir(outDir, { recursive: true });

  const html = renderReportHtml(scan, { ...options, screenshotBase: `${SCREENSHOT_DIR}/` });
  const htmlPath = join(outDir, REPORT_HTML);
  await writeFile(htmlPath, html, 'utf8');
  const scanPath = await writeScan(outDir, scan);

  if (!options.pdf) return { htmlPath, scanPath };

  const pdfPath = join(outDir, REPORT_PDF);
  await renderPdfFromFile(htmlPath, pdfPath, {
    headerText: `Barrierefreiheits-Prüfbericht — ${options.shopName ?? scan.shopId}`,
  });
  return { htmlPath, pdfPath, scanPath };
}
