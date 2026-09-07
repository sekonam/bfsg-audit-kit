#!/usr/bin/env node
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { runOperatorFlow } from '../test/helpers/operator-run.ts';
import { REPO_ROOT } from '../test/helpers/cli.ts';
import { escapeHtml, formatDateTimeDe } from '../src/core/report/format.ts';

/**
 * Visual verification of the customer-facing deliverables.
 *
 * `pnpm run demo:screens` performs a full operator run against the local
 * fixture shop, then photographs every document it produced at a desktop and a
 * 375 px mobile viewport and writes an index page linking them all.
 *
 * Why this exists: axe answers "is it accessible", not "does it look like
 * something a merchant would pay for". These documents are sold, so somebody
 * has to look at them — and asking a human to run six CLI commands first is how
 * that stops happening. Output is gitignored; nothing here is a test.
 *
 * It reuses `test/helpers/operator-run.ts` deliberately: the screenshots must
 * be of the same artefacts the end-to-end test asserts on, not of a second,
 * conveniently different code path.
 */

const OUT_DIR = join(REPO_ROOT, '.artifacts', 'demo-screens');
const SHOTS_DIR = join(OUT_DIR, 'screens');
const RUN_DIR = join(OUT_DIR, 'run');

const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop (1280 px)', width: 1280, height: 900 },
  { id: 'mobil', label: 'Mobil (375 px)', width: 375, height: 800 },
] as const;

interface Shot {
  readonly documentId: string;
  readonly documentLabel: string;
  readonly viewportId: string;
  readonly viewportLabel: string;
  readonly file: string;
  readonly pixelHeight: number;
}

async function capture(browser: Browser, htmlPath: string, id: string, label: string) {
  const shots: Shot[] = [];
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      locale: 'de-DE',
    });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });

    const broken = await page.$$eval('img', (nodes) =>
      nodes.filter((n) => n.naturalWidth === 0).map((n) => n.getAttribute('src') ?? '(ohne src)'),
    );
    if (broken.length > 0) console.warn(`  ! defekte Bilder in ${id}/${viewport.id}:`, broken);
    if (consoleErrors.length > 0) console.warn(`  ! Konsolenfehler in ${id}:`, consoleErrors);

    const file = `${id}-${viewport.id}.png`;
    await page.screenshot({ path: join(SHOTS_DIR, file), fullPage: true });
    const pixelHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    shots.push({
      documentId: id,
      documentLabel: label,
      viewportId: viewport.id,
      viewportLabel: viewport.label,
      file,
      pixelHeight,
    });
    console.log(`  ✓ ${file} (${viewport.width}×${pixelHeight})`);
    await context.close();
  }
  return shots;
}

function indexHtml(shots: readonly Shot[], runDir: string): string {
  const byDocument = new Map<string, Shot[]>();
  for (const shot of shots) {
    byDocument.set(shot.documentId, [...(byDocument.get(shot.documentId) ?? []), shot]);
  }
  const sections = [...byDocument.values()]
    .map((group) => {
      const first = group[0];
      if (!first) return '';
      const figures = group
        .map(
          (shot) => `
          <figure>
            <figcaption>${escapeHtml(shot.viewportLabel)} — ${shot.pixelHeight} px hoch,
            Ausschnitt; klicken für das ganze Bild</figcaption>
            <a href="screens/${escapeHtml(shot.file)}"><img src="screens/${escapeHtml(shot.file)}" alt="Bildschirmfoto: ${escapeHtml(first.documentLabel)}, ${escapeHtml(shot.viewportLabel)}" /></a>
          </figure>`,
        )
        .join('');
      return `<section><h2>${escapeHtml(first.documentLabel)}</h2><div class="row">${figures}</div></section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sichtprüfung der erzeugten Dokumente</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 76rem; padding: 1.5rem; color: #1f2328; }
      .row { display: flex; gap: 1.5rem; align-items: flex-start; flex-wrap: wrap; }
      figure { margin: 0; flex: 1 1 20rem; }
      /* A 375 px document is 16 000 px tall; shown whole it dwarfs the desktop
         column and neither is readable. Show the top at a comparable scale and
         link through to the full PNG. */
      img { width: 100%; max-height: 44rem; object-fit: cover; object-position: top center;
            border: 1px solid #d5d9e0; }
      figcaption { font-size: 0.9rem; color: #5c6470; padding-bottom: 0.4rem; }
      h2 { border-top: 1px solid #d5d9e0; padding-top: 1rem; }
      code { background: #f6f7f9; padding: 0.1rem 0.3rem; }
    </style>
  </head>
  <body>
    <h1>Sichtprüfung der erzeugten Dokumente</h1>
    <p>Erzeugt am ${escapeHtml(formatDateTimeDe(new Date().toISOString()))} aus einem vollständigen Lauf gegen den
    lokalen Fixture-Shop. Die Dokumente selbst liegen unter <code>${escapeHtml(runDir)}</code>.</p>
    ${sections}
  </body>
</html>
`;
}

async function main(): Promise<void> {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(SHOTS_DIR, { recursive: true });

  console.log('Operator-Lauf gegen den lokalen Fixture-Shop …');
  const run = await runOperatorFlow({ root: RUN_DIR });
  try {
    for (const { command, result } of run.steps) {
      console.log(`  ${result.code === 0 ? '✓' : '✗'} ${command} (exit ${result.code})`);
      if (result.code !== 0) console.log(result.stderr.trim());
    }

    const browser = await chromium.launch({ headless: true });
    try {
      const shots: Shot[] = [
        ...(await capture(browser, run.reportHtml, 'bericht', 'Prüfbericht (bericht.html)')),
        ...(await capture(
          browser,
          run.statementHtml,
          'erklaerung',
          'Barrierefreiheitserklärung — freigegeben',
        )),
        ...(await capture(
          browser,
          run.draftStatementHtml,
          'erklaerung-entwurf',
          'Barrierefreiheitserklärung — ENTWURF',
        )),
        ...(await capture(
          browser,
          run.regressionHtml,
          'ueberwachung',
          'Überwachungsbericht (ueberwachungsbericht.html)',
        )),
      ];
      await writeFile(
        join(OUT_DIR, 'index.html'),
        indexHtml(shots, relative(REPO_ROOT, RUN_DIR)),
        'utf8',
      );
    } finally {
      await browser.close();
    }
  } finally {
    // Keep the run directory: the screenshots are only useful next to the
    // documents they were taken of.
    await run.close();
  }

  console.log(`\nÜbersicht: ${join(OUT_DIR, 'index.html')}`);
}

await main();
