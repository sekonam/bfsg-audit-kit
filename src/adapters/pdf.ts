import { rename, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { escapeHtml } from '../core/report/format.ts';

/**
 * HTML → PDF via headless Chromium.
 *
 * The PDF is produced from the same file the customer can open in a browser,
 * with `print` media emulation so the print rules in the stylesheet apply.
 * `tagged: true` asks Chromium to emit a tagged (structured) PDF, which is what
 * makes headings and tables navigable for a screen reader — a PDF of an
 * accessibility report that is itself untagged would be an embarrassment.
 */

export interface PdfOptions {
  readonly format?: 'A4' | 'Letter';
  readonly headerText?: string;
}

export async function renderPdfFromFile(
  htmlPath: string,
  pdfPath: string,
  options: PdfOptions = {},
): Promise<void> {
  // Print to a temporary neighbour and rename on success. `page.pdf({path})`
  // writes in place, so a crash or a timeout mid-print used to leave a
  // truncated file at the customer-facing path — and rename is atomic within a
  // directory, so the operator either has the previous PDF or the new one.
  const tempPath = `${pdfPath}.teil`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: tempPath,
      format: options.format ?? 'A4',
      printBackground: true,
      tagged: true,
      outline: true,
      margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
      displayHeaderFooter: true,
      // The only interpolation in the codebase that used to skip escapeHtml.
      // A shop called `Müller & Söhne <GmbH>` corrupted the header on every
      // page, and a double quote closed the style attribute outright.
      headerTemplate: `<div style="font-size:8pt;color:#5c6470;width:100%;padding:0 16mm;">${escapeHtml(
        options.headerText ?? '',
      )}</div>`,
      footerTemplate:
        '<div style="font-size:8pt;color:#5c6470;width:100%;padding:0 16mm;text-align:right;">' +
        'Seite <span class="pageNumber"></span> von <span class="totalPages"></span></div>',
    });
    await rename(tempPath, pdfPath);
  } finally {
    await browser.close();
    await rm(tempPath, { force: true });
  }
}
