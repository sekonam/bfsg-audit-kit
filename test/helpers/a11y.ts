import { chromium, type Browser, type Page } from 'playwright';
import { pathToFileURL } from 'node:url';
import { AxeBuilder } from '@axe-core/playwright';
import { AXE_TAGS } from '../../src/adapters/axe.ts';

/**
 * Run axe over a generated HTML document.
 *
 * Used to VERIFY, not assert, that the documents this toolkit produces are
 * themselves accessible. An audit report or a Barrierefreiheitserklärung that
 * fails WCAG is a self-refuting deliverable, so it is checked the same way a
 * customer's shop is checked: in a real browser, with the real engine.
 *
 * Two entry points, and the difference matters:
 *
 * - `auditHtmlDocument` audits the STRING a renderer returned. Fast, and the
 *   right tool for unit-testing a renderer.
 * - `auditHtmlFile` audits the FILE the CLI wrote, loaded over `file://` with
 *   its real neighbours on disk. Only this one exercises file writing, relative
 *   screenshot paths and asset resolution — the layer between a correct render
 *   function and a correct deliverable.
 */

export interface AuditedImage {
  readonly src: string;
  readonly alt: string;
  /** 0 when the browser could not decode the image — i.e. a broken <img>. */
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

export interface DocumentAudit {
  readonly violations: {
    id: string;
    impact: string | null | undefined;
    help: string;
    nodes: string[];
  }[];
  readonly title: string;
  readonly lang: string | null;
  readonly consoleErrors: string[];
  /** Requests the browser could not complete (missing screenshots, fonts, …). */
  readonly failedRequests: string[];
  readonly headings: { level: number; text: string }[];
  readonly firstFocusable: { tag: string; text: string; visible: boolean } | null;
  readonly images: AuditedImage[];
  /**
   * Page-level horizontal overflow. A document whose BODY scrolls sideways is
   * unusable on a phone; a `.table-scroll` region that scrolls internally is
   * fine and is not measured here.
   */
  readonly documentOverflow: { scrollWidth: number; clientWidth: number };
}

export interface AuditOptions {
  /** Defaults to 1280×900. Pass 375 to audit the document as a phone sees it. */
  readonly viewport?: { width: number; height: number };
  readonly extra?: (page: Page) => Promise<void>;
}

const DEFAULT_VIEWPORT = { width: 1280, height: 900 } as const;

async function auditPage(
  load: (page: Page) => Promise<void>,
  options: AuditOptions = {},
): Promise<DocumentAudit> {
  const extra = options.extra;
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    // axe-core/playwright requires a page created from an explicit context.
    const context = await browser.newContext({
      viewport: { ...DEFAULT_VIEWPORT, ...options.viewport },
    });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    page.on('requestfailed', (request) => failedRequests.push(request.url()));

    await load(page);
    // Images referenced by the document are part of the deliverable, so wait
    // for them to settle before deciding whether any of them is broken.
    await page.evaluate(async () => {
      await Promise.all(
        Array.from(document.images)
          .filter((image) => !image.complete)
          .map(
            (image) =>
              new Promise<void>((resolve) => {
                image.addEventListener('load', () => resolve(), { once: true });
                image.addEventListener('error', () => resolve(), { once: true });
              }),
          ),
      );
    });
    await extra?.(page);

    const results = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();

    const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', (nodes) =>
      nodes.map((node) => ({
        level: Number(node.tagName.slice(1)),
        text: (node.textContent ?? '').trim().slice(0, 80),
      })),
    );

    const images = await page.$$eval('img', (nodes) =>
      nodes.map((node) => ({
        src: node.getAttribute('src') ?? '',
        alt: node.getAttribute('alt') ?? '',
        naturalWidth: node.naturalWidth,
        naturalHeight: node.naturalHeight,
      })),
    );

    await page.keyboard.press('Tab');
    const firstFocusable = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? '').trim(),
        visible: rect.left >= 0 && rect.top >= 0 && rect.width > 0 && rect.height > 0,
      };
    });

    return {
      violations: results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => n.html),
      })),
      title: await page.title(),
      lang: await page.getAttribute('html', 'lang'),
      consoleErrors,
      failedRequests,
      headings,
      firstFocusable,
      images,
      documentOverflow: await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      })),
    };
  } finally {
    await browser.close();
  }
}

/** Audit the HTML a renderer returned, without ever touching the filesystem. */
export async function auditHtmlDocument(
  html: string,
  options: AuditOptions = {},
): Promise<DocumentAudit> {
  return auditPage((page) => page.setContent(html, { waitUntil: 'load' }), options);
}

/**
 * Audit an HTML file the CLI actually wrote, in place.
 *
 * Loading over `file://` from its real directory is the point: relative
 * `screenshots/…` sources resolve exactly as they will for the customer who
 * opens the handed-over folder, so a report full of broken images fails here
 * instead of in front of them.
 */
export async function auditHtmlFile(
  filePath: string,
  options: AuditOptions = {},
): Promise<DocumentAudit> {
  const url = pathToFileURL(filePath).href;
  return auditPage(async (page) => {
    await page.goto(url, { waitUntil: 'load' });
  }, options);
}

/**
 * Table regions that would be clipped when the document is printed to A4.
 *
 * `overflow-x: auto` scrolls on screen and CLIPS on paper, so a table wider
 * than the printable width silently loses its right-hand columns in the PDF —
 * the artefact that gets attached to a mail. 673 px is A4 (210 mm) minus the
 * 16 mm side margins `renderPdfFromFile` uses, at 96 dpi.
 */
export async function clippedInPrint(filePath: string): Promise<string[]> {
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 673, height: 900 } });
    const page = await context.newPage();
    await page.goto(pathToFileURL(filePath).href, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    return await page.$$eval('.table-scroll', (nodes) =>
      nodes
        .filter((node) => node.scrollWidth > node.clientWidth + 1)
        .map((node) => node.getAttribute('aria-label') ?? '(ohne Beschriftung)'),
    );
  } finally {
    await browser.close();
  }
}

/** Readable failure output: axe's own message plus the offending markup. */
export function describeViolations(audit: DocumentAudit): string {
  return audit.violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.join('\n    ')}`)
    .join('\n');
}

/** Images the browser could not decode. A non-empty result is a broken report. */
export function brokenImages(audit: DocumentAudit): AuditedImage[] {
  return audit.images.filter((image) => image.naturalWidth === 0 || image.naturalHeight === 0);
}

/** Heading levels that skip a step, e.g. an h2 followed directly by an h4. */
export function headingOrderJumps(audit: DocumentAudit): string[] {
  const jumps: string[] = [];
  let previous = 1;
  for (const heading of audit.headings) {
    if (heading.level - previous > 1) {
      jumps.push(`Sprung von h${previous} auf h${heading.level} bei "${heading.text}"`);
    }
    previous = heading.level;
  }
  return jumps;
}
