import { chromium, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { AXE_TAGS } from '../../src/adapters/axe.ts';

/**
 * Run axe over a generated HTML document.
 *
 * Used to VERIFY, not assert, that the documents this toolkit produces are
 * themselves accessible. An audit report or a Barrierefreiheitserklärung that
 * fails WCAG is a self-refuting deliverable, so it is checked the same way a
 * customer's shop is checked: in a real browser, with the real engine.
 */

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
  readonly headings: { level: number; text: string }[];
  readonly firstFocusable: { tag: string; text: string; visible: boolean } | null;
}

export async function auditHtmlDocument(
  html: string,
  extra?: (page: Page) => Promise<void>,
): Promise<DocumentAudit> {
  const browser = await chromium.launch({ headless: true });
  try {
    // axe-core/playwright requires a page created from an explicit context.
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.setContent(html, { waitUntil: 'load' });
    await extra?.(page);

    const results = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();

    const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', (nodes) =>
      nodes.map((node) => ({
        level: Number(node.tagName.slice(1)),
        text: (node.textContent ?? '').trim().slice(0, 80),
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
      headings,
      firstFocusable,
    };
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
