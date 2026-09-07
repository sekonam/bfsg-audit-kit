import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile, readdir, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  auditHtmlFile,
  brokenImages,
  clippedInPrint,
  describeViolations,
  headingOrderJumps,
  type DocumentAudit,
} from './helpers/a11y.ts';
import { runOperatorFlow, type OperatorRun } from './helpers/operator-run.ts';
import { REPO_ROOT } from './helpers/cli.ts';
import { SCREENSHOT_DIR } from '../src/pipeline/report.ts';
import { SCOPE_NOTE_DE } from '../src/core/report/rdg.ts';

/**
 * The operator end-to-end test.
 *
 * Everything else in this suite audits the RETURN VALUE of a render function.
 * This file audits the FILES the CLI wrote, opened from disk the way the
 * customer opens them. That gap is where file writing, screenshot embedding,
 * relative paths, PDF printing and the ENTWURF gate live, and a regression in
 * any of them ships a broken or inaccessible document while every other test
 * stays green.
 *
 * The run is one complete engagement against the local fixture shop:
 * scan → report --pdf → statement --pdf → statement (ENTWURF) → baseline → monitor.
 * No third-party site is ever contacted; the shop is on 127.0.0.1.
 */

/**
 * 320 CSS px, not 375. That is the width WCAG 1.4.10 Reflow names, and it is a
 * criterion these very documents tell the customer to have checked. Auditing
 * only at desktop hid three genuine failures: the report's scroll containers
 * were not keyboard-reachable, a shop URL in a screenshot caption scrolled the
 * whole page sideways, and a contact e-mail did the same in the statement.
 */
const REFLOW = { width: 320, height: 640 } as const;

/** Rule ids planted in `test/fixtures/shop`, each documented in the fixture. */
const PLANTED_RULES = [
  'image-alt',
  'color-contrast',
  'link-name',
  'button-name',
  'label',
  'select-name',
  'meta-viewport',
] as const;

let run: OperatorRun;
let report: DocumentAudit;
let statement: DocumentAudit;
let draft: DocumentAudit;
let regression: DocumentAudit;
let reportNarrow: DocumentAudit;
let statementNarrow: DocumentAudit;
let draftNarrow: DocumentAudit;
let regressionNarrow: DocumentAudit;
let reportHtml: string;
let statementHtml: string;
let draftHtml: string;

beforeAll(async () => {
  run = await runOperatorFlow();
  [report, statement, draft, regression] = await Promise.all([
    auditHtmlFile(run.reportHtml),
    auditHtmlFile(run.statementHtml),
    auditHtmlFile(run.draftStatementHtml),
    auditHtmlFile(run.regressionHtml),
  ]);
  [reportNarrow, statementNarrow, draftNarrow, regressionNarrow] = await Promise.all([
    auditHtmlFile(run.reportHtml, { viewport: REFLOW }),
    auditHtmlFile(run.statementHtml, { viewport: REFLOW }),
    auditHtmlFile(run.draftStatementHtml, { viewport: REFLOW }),
    auditHtmlFile(run.regressionHtml, { viewport: REFLOW }),
  ]);
  [reportHtml, statementHtml, draftHtml] = await Promise.all([
    readFile(run.reportHtml, 'utf8'),
    readFile(run.statementHtml, 'utf8'),
    readFile(run.draftStatementHtml, 'utf8'),
  ]);
}, 600_000);

afterAll(async () => {
  await run?.close();
});

describe('the operator run itself', () => {
  it('completes every step without an error', () => {
    for (const { command, result } of run.steps) {
      expect(result.code, `${command}\n${result.stderr}`).toBe(0);
      expect(result.stderr, command).not.toMatch(/Error|Fehler beim/);
    }
  });

  it('leaves exactly the documented file layout on disk', async () => {
    const files = [
      run.scanJson,
      run.reportHtml,
      run.reportPdf,
      run.baselineJson,
      run.regressionHtml,
      run.diffJson,
      run.statementHtml,
      run.statementPdf,
      run.draftStatementHtml,
    ];
    for (const file of files) {
      expect((await stat(file)).size, basename(file)).toBeGreaterThan(0);
    }
    // The PDF printer writes to a `.teil` neighbour and renames; nothing may
    // survive in the folder the operator hands over.
    for (const dir of [run.shopDir, dirname(run.statementHtml)]) {
      // `toContain` compares by equality and ignores asymmetric matchers, so
      // filter explicitly rather than writing an assertion that cannot fail.
      const leftovers = (await readdir(dir)).filter((name) => name.endsWith('.teil'));
      expect(leftovers, dir).toEqual([]);
    }
  });
});

describe.each([
  ['bericht.html', () => report],
  ['barrierefreiheitserklaerung.html', () => statement],
  ['barrierefreiheitserklaerung.html (ENTWURF)', () => draft],
  ['ueberwachungsbericht.html', () => regression],
  ['bericht.html at 320 px', () => reportNarrow],
  ['barrierefreiheitserklaerung.html at 320 px', () => statementNarrow],
  ['barrierefreiheitserklaerung.html (ENTWURF) at 320 px', () => draftNarrow],
  ['ueberwachungsbericht.html at 320 px', () => regressionNarrow],
])('the written document %s', (_name, get) => {
  it('has no axe violations at WCAG 2.1 AA', () => {
    expect(describeViolations(get())).toBe('');
  });

  it('renders without console errors or failed requests', () => {
    expect(get().consoleErrors).toEqual([]);
    expect(get().failedRequests).toEqual([]);
  });

  it('declares German', () => {
    expect(get().lang).toBe('de');
  });

  it('has exactly one h1 and no skipped heading levels', () => {
    expect(get().headings.filter((h) => h.level === 1)).toHaveLength(1);
    expect(headingOrderJumps(get())).toEqual([]);
  });

  it('offers the skip link first and shows it on focus', () => {
    expect(get().firstFocusable?.text).toBe('Zum Inhalt springen');
    expect(get().firstFocusable?.visible).toBe(true);
  });

  it('never scrolls the page sideways', () => {
    // WCAG 1.4.10 Reflow: no two-dimensional scrolling at 320 px. A
    // `.table-scroll` region that scrolls INSIDE itself is the accepted
    // pattern and is not measured here; the page scrolling is the failure.
    const { scrollWidth, clientWidth } = get().documentOverflow;
    expect(scrollWidth, 'Dokument läuft horizontal über').toBeLessThanOrEqual(clientWidth);
  });
});

describe('the embedded element screenshots', () => {
  it('are actually referenced by the written report', () => {
    expect(report.images.length).toBeGreaterThan(0);
    for (const image of report.images) {
      expect(image.src, 'Screenshot-Pfad muss relativ zum Bericht sein').toMatch(
        new RegExp(`^${SCREENSHOT_DIR}/`),
      );
      expect(image.alt.length, image.src).toBeGreaterThan(0);
    }
  });

  it('all resolve — a report full of broken screenshots is worthless', () => {
    expect(brokenImages(report).map((i) => i.src)).toEqual([]);
  });

  it('are of a shop whose own images actually load', async () => {
    // "Resolves" is not the same as "shows something", and the gap is not
    // hypothetical: while the fixture referenced images that 404'd, every
    // image-alt finding in the report illustrated itself with a picture of a
    // broken-image icon — a screenshot that loaded perfectly and showed the
    // customer nothing. The screenshots are only worth asserting on if the
    // scanned page had something to photograph, so that is asserted directly.
    for (const path of ['/', '/collections/schuhe.html']) {
      const html = await (await fetch(new URL(path, run.origin))).text();
      const sources = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((src): src is string => typeof src === 'string');
      expect(sources.length, path).toBeGreaterThan(0);
      for (const src of sources) {
        const response = await fetch(new URL(src, run.origin));
        expect(response.status, `${path} → ${src}`).toBe(200);
      }
    }
  });

  it('have non-degenerate dimensions', () => {
    for (const image of report.images) {
      expect(image.naturalWidth, image.src).toBeGreaterThanOrEqual(8);
      expect(image.naturalHeight, image.src).toBeGreaterThanOrEqual(8);
    }
    const biggest = Math.max(...report.images.map((i) => i.naturalWidth * i.naturalHeight));
    expect(biggest, 'kein Screenshot zeigt ein Element von nennenswerter Größe').toBeGreaterThan(
      100 * 50,
    );
  });

  it('exist as files next to the report', async () => {
    const written = new Set(await readdir(run.screenshotDir));
    for (const image of report.images) {
      expect(written, image.src).toContain(basename(image.src));
    }
  });
});

describe('the printed PDFs', () => {
  it.each([
    ['bericht.pdf', () => run.reportPdf],
    ['barrierefreiheitserklaerung.pdf', () => run.statementPdf],
  ])('%s is a real, tagged PDF', async (_name, get) => {
    const pdf = await readFile(get());
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(10_000);
    // Chromium writes /StructTreeRoot only when the tagged-PDF flag took
    // effect. An untagged PDF of an accessibility report would be absurd.
    expect(pdf.toString('latin1')).toContain('/StructTreeRoot');
  });

  it('clips no table when printed to A4', async () => {
    // `overflow-x: auto` scrolls on screen and clips on paper. Every table fits
    // today with ~160 px to spare; this fails the moment a column is added,
    // instead of quietly losing it in the file the customer receives.
    expect(await clippedInPrint(run.reportHtml)).toEqual([]);
    expect(await clippedInPrint(run.statementHtml)).toEqual([]);
  });

  it('is never older than the HTML beside it', async () => {
    // `monitor` rewrites bericht.html from the fresh scan. If it does not
    // reprint bericht.pdf, the folder holds two files claiming to be the same
    // report while saying different things — and the PDF is the one that gets
    // attached to a mail.
    const [html, pdf] = await Promise.all([stat(run.reportHtml), stat(run.reportPdf)]);
    expect(pdf.mtimeMs).toBeGreaterThanOrEqual(html.mtimeMs);
  });
});

describe('the ENTWURF gate, on the written file', () => {
  it('stamps the statement when legalReviewConfirmed is false', () => {
    expect(draftHtml).toContain('ENTWURF');
    expect(draft.violations).toEqual([]);
  });

  it('leaves no trace of the stamp once legal review is confirmed', () => {
    expect(statementHtml).not.toContain('ENTWURF');
    expect(statementHtml).not.toContain('noch nicht anwaltlich geprüft');
  });
});

describe('what the written report says', () => {
  it('carries the shop name the operator supplied, not the bare host', () => {
    // `monitor` runs last and rewrites bericht.html. Dropping --shop-name there
    // silently renamed the customer's report back to "127.0.0.1:1234".
    expect(reportHtml).toContain('<title>Barrierefreiheits-Prüfbericht — Musterschuhe GmbH');
  });

  it('reports every defect planted in the fixture shop', () => {
    for (const rule of PLANTED_RULES) {
      expect(reportHtml, `Regel ${rule} fehlt im Bericht`).toContain(`<code>${rule}</code>`);
    }
  });

  it('states the RDG scope boundary in full', () => {
    for (const paragraph of SCOPE_NOTE_DE.paragraphs) {
      // The heading and the first words are enough to pin the section; the
      // renderer escapes the text, so compare on a distinctive fragment.
      expect(reportHtml).toContain(paragraph.slice(0, 60));
    }
    expect(reportHtml).toContain('Rechtsdienstleistungsgesetz');
  });

  it('states the scope boundary in the Barrierefreiheitserklärung as well', () => {
    expect(statementHtml).toContain('EN 301 549');
    expect(statementHtml).toContain('Marktüberwachungsbehörde');
  });
});

describe('robots.txt is honoured in the OUTPUT, not just in the crawl', () => {
  it('never names a disallowed address in any artefact the operator hands over', async () => {
    const artefacts = [
      run.reportHtml,
      run.scanJson,
      run.baselineJson,
      run.regressionHtml,
      run.diffJson,
      run.statementHtml,
      run.draftStatementHtml,
    ];
    // Read the forbidden prefixes from the fixture's own robots.txt rather than
    // hard-coding them, so changing the fixture cannot quietly weaken this.
    const robots = await readFile(
      join(REPO_ROOT, 'test', 'fixtures', 'shop', 'robots.txt'),
      'utf8',
    );
    const disallowed = [...robots.matchAll(/^\s*Disallow:\s*(\S+)\s*$/gim)]
      .map((match) => match[1])
      .filter((path): path is string => typeof path === 'string' && path !== '/');
    expect(disallowed.length, 'Die Fixture-robots.txt verbietet nichts mehr').toBeGreaterThan(0);

    for (const artefact of artefacts) {
      const text = await readFile(artefact, 'utf8');
      for (const path of disallowed) {
        expect(text, `${basename(artefact)} nennt die gesperrte Adresse ${path}`).not.toContain(
          path,
        );
      }
    }
    // The PDF is clean by construction — Chromium prints it from the very HTML
    // file asserted above — so this only guards against an uncompressed stream
    // carrying the string. Cheap, and it costs no PDF-parsing dependency.
    const pdf = (await readFile(run.reportPdf)).toString('latin1');
    for (const path of disallowed) expect(pdf).not.toContain(path);
  });

  it('still tells the customer that something was excluded, and how many', () => {
    // Asserting the specific sentence, not just the words "robots.txt" and
    // "ausgeschlossen" — both of those appear elsewhere in the Methodik
    // paragraph and in a skip reason, so the weaker version passed with the
    // whole exclusion notice deleted.
    expect(reportHtml).toMatch(
      /(Eine Adresse wurde|[\d.]+ Adressen wurden)\s+durch <code>robots\.txt<\/code> ausgeschlossen und deshalb nicht abgerufen/,
    );
    expect(reportHtml).toContain('sind hier bewusst nicht aufgeführt');
  });

  it('counts only genuine robots.txt exclusions, and does not double-count', () => {
    // The fixture robots.txt disallows exactly one reachable address
    // (/intern/geheim.html). /weiterleitung redirects into it and is refused by
    // the navigation guard — but the guard also refuses foreign hosts and
    // redirect loops, so folding that into the robots count both
    // double-counted the page (it is in "Nicht geprüfte Seiten" as well) and
    // attributed a non-robots refusal to robots.txt.
    const scan = JSON.parse(readFileSync(run.scanJson, 'utf8'));
    expect(scan.crawl.robotsExcluded).toBe(1);
    expect(reportHtml).toContain('Eine Adresse wurde');
    expect(
      scan.crawl.skipped.some((entry: { url: string }) => entry.url.endsWith('/weiterleitung')),
    ).toBe(true);
  });
});

describe('the screenshot directory', () => {
  it('contains only files the crawl produced, under sanitised names', async () => {
    const names = await readdir(join(run.shopDir, SCREENSHOT_DIR));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name, 'Dateiname stammt aus fremdem Input').toMatch(/^[a-zA-Z0-9._-]+\.png$/);
      expect(name).not.toContain('..');
      const info = await stat(join(run.screenshotDir, name));
      expect(info.size, name).toBeGreaterThan(100);
    }
  });
});
