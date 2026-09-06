import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { REPORT_HTML, REPORT_PDF, SCAN_JSON, writeReport } from '../src/pipeline/report.ts';
import { sampleScan } from './helpers/sample-scan.ts';

/**
 * The PDF path is exercised for real rather than assumed: it is the artefact
 * that gets attached to an email, and a silently broken printer would only
 * surface in front of a customer.
 */

let outDir: string;

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'bfsg-report-'));
  await writeReport(outDir, sampleScan(), {
    shopName: 'Musterschuhe GmbH',
    operatorName: 'Prüfstelle Muster',
    pdf: true,
  });
}, 120_000);

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('writeReport', () => {
  it('writes the German report, the PDF and the machine-readable scan', async () => {
    for (const name of [REPORT_HTML, REPORT_PDF, SCAN_JSON]) {
      const info = await stat(join(outDir, name));
      expect(info.size, name).toBeGreaterThan(0);
    }
  });

  it('produces a real, multi-kilobyte PDF', async () => {
    const pdf = await readFile(join(outDir, REPORT_PDF));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(10_000);
    // Chromium writes /StructTreeRoot only when the tagged-PDF flag took
    // effect; an untagged PDF of an accessibility report would be absurd.
    expect(pdf.toString('latin1')).toContain('/StructTreeRoot');
  });

  it('points the report at the screenshots directory it will be written next to', async () => {
    const html = await readFile(join(outDir, REPORT_HTML), 'utf8');
    expect(html).not.toContain('src="/');
    if (html.includes('<img')) expect(html).toContain('src="screenshots/');
  });

  it('round-trips the scan result as JSON', async () => {
    const parsed = JSON.parse(await readFile(join(outDir, SCAN_JSON), 'utf8'));
    expect(parsed.shopId).toBe('muster-shop.de');
    expect(parsed.score.conformance).toBe(sampleScan().score.conformance);
    expect(parsed.findings.length).toBeGreaterThan(0);
  });
});
