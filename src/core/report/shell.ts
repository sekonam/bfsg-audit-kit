import { escapeHtml } from './format.ts';

/**
 * Shared document shell for every generated HTML document.
 *
 * Both the audit report and the Barrierefreiheitserklärung are rendered
 * through here, for one reason: a document about accessibility that is not
 * itself accessible is worse than no document. The shell fixes the parts that
 * are easy to forget — `lang`, a unique `<title>`, one `<main>`, a skip link,
 * a visible focus indicator, contrast, and print styles — so neither generator
 * can omit them.
 *
 * Everything is inline. The documents are handed over as single files and must
 * render identically offline, in an email attachment, and in the PDF printer.
 */

/**
 * Colours are picked for WCAG 1.4.3 / 1.4.11 headroom on white:
 *   #1f2328 on #ffffff    ≈ 14.8:1
 *   #0b4f9e on #ffffff    ≈  7.6:1
 *   #5c6470 on #ffffff    ≈  5.4:1  (secondary text)
 *   #8a1c1c on #fdeceb    ≈  8.0:1  (critical badge)
 *   #7a3b00 on #fdf1e3    ≈  6.6:1  (serious badge)
 *   #24543a on #e8f4ec    ≈  7.9:1  (ok badge)
 */
export const BASE_CSS = `
:root {
  --ink: #1f2328;
  --ink-muted: #5c6470;
  --accent: #0b4f9e;
  --rule: #d5d9e0;
  --surface: #f6f7f9;
  --page: #ffffff;
  --critical-fg: #8a1c1c; --critical-bg: #fdeceb;
  --serious-fg: #7a3b00;  --serious-bg: #fdf1e3;
  --moderate-fg: #35474f; --moderate-bg: #eaf1f4;
  --minor-fg: #4a4a55;    --minor-bg: #f0f0f3;
  --ok-fg: #24543a;       --ok-bg: #e8f4ec;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font-family: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  font-size: 1rem;
  line-height: 1.6;
}
.wrap { max-width: 62rem; margin: 0 auto; padding: 0 1.25rem 4rem; }
a { color: var(--accent); }
a:hover { text-decoration-thickness: 2px; }
:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  background: var(--page);
  color: var(--accent);
  padding: 0.75rem 1rem;
  border: 2px solid var(--accent);
  z-index: 10;
}
.skip-link:focus { left: 0; }
h1, h2, h3, h4 { line-height: 1.25; margin: 2rem 0 0.5rem; }
h1 { font-size: 1.9rem; margin-top: 1.5rem; }
h2 { font-size: 1.4rem; padding-top: 1rem; border-top: 1px solid var(--rule); }
h3 { font-size: 1.15rem; }
h4 { font-size: 1rem; }
p, ul, ol, table { margin: 0.75rem 0; }
ul, ol { padding-left: 1.4rem; }
li { margin: 0.25rem 0; }
.lead { font-size: 1.05rem; color: var(--ink); }
.muted { color: var(--ink-muted); }
.doc-header { background: var(--surface); border-bottom: 1px solid var(--rule); padding: 1.5rem 0; }
.doc-header .wrap { padding-bottom: 0.5rem; }
.meta { margin: 0; }
.meta div { display: flex; gap: 0.5rem; flex-wrap: wrap; padding: 0.15rem 0; }
.meta dt { font-weight: 600; min-width: 11rem; margin: 0; }
.meta dd { margin: 0; }
table { border-collapse: collapse; width: 100%; }
caption { text-align: left; font-weight: 600; padding: 0.5rem 0; }
th, td { border: 1px solid var(--rule); padding: 0.5rem 0.65rem; text-align: left; vertical-align: top; }
th { background: var(--surface); }
.numeric { text-align: right; font-variant-numeric: tabular-nums; }
.badge {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  border: 1px solid currentColor;
}
.badge-critical { color: var(--critical-fg); background: var(--critical-bg); }
.badge-serious  { color: var(--serious-fg);  background: var(--serious-bg); }
.badge-moderate { color: var(--moderate-fg); background: var(--moderate-bg); }
.badge-minor    { color: var(--minor-fg);    background: var(--minor-bg); }
.badge-ok       { color: var(--ok-fg);       background: var(--ok-bg); }
.scorecard {
  display: flex; flex-wrap: wrap; gap: 1rem; margin: 1rem 0;
}
.scorecard > div {
  border: 1px solid var(--rule); border-radius: 0.4rem;
  padding: 0.75rem 1rem; min-width: 12rem; background: var(--surface);
}
.scorecard .value { font-size: 1.75rem; font-weight: 700; display: block; }
.finding { border: 1px solid var(--rule); border-radius: 0.4rem; padding: 0.25rem 1rem 1rem; margin: 1rem 0; }
.finding h4 { margin-top: 1rem; }
.instances { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 0.85rem; }
.instances td { word-break: break-word; }
figure { margin: 0.75rem 0; }
figure img { max-width: 100%; height: auto; border: 1px solid var(--rule); }
figcaption { font-size: 0.875rem; color: var(--ink-muted); }
.notice { border-left: 4px solid var(--accent); background: var(--surface); padding: 0.75rem 1rem; margin: 1rem 0; }
.toc ol { margin: 0.5rem 0; }
footer.doc-footer { border-top: 1px solid var(--rule); margin-top: 3rem; padding-top: 1rem; color: var(--ink-muted); font-size: 0.9rem; }
code { background: var(--surface); padding: 0.05rem 0.3rem; border-radius: 0.2rem; word-break: break-word; }
.table-scroll { overflow-x: auto; }
@media print {
  body { font-size: 10.5pt; }
  .skip-link, .toc { display: none; }
  h2 { break-before: auto; break-after: avoid; }
  .finding { break-inside: avoid; }
  a { color: var(--ink); text-decoration: underline; }
  .wrap { max-width: none; padding: 0; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
`;

export interface ShellOptions {
  /** BCP-47 language of the document content. Always German here. */
  readonly lang?: string;
  readonly title: string;
  /** Content of <header>, already escaped/rendered. */
  readonly headerHtml: string;
  /** Content of <main>, already escaped/rendered. */
  readonly mainHtml: string;
  /** Content of <footer>, already escaped/rendered. */
  readonly footerHtml: string;
  /** Extra CSS appended after the base stylesheet. */
  readonly extraCss?: string;
}

/**
 * Wrap rendered content in an accessible HTML document.
 *
 * Provides: `lang`, a unique title, a skip link as the first focusable element,
 * exactly one `<main id="inhalt">`, header/footer landmarks and the inline
 * stylesheet.
 */
export function renderDocument(options: ShellOptions): string {
  const lang = options.lang ?? 'de';
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <style>${BASE_CSS}${options.extraCss ?? ''}</style>
  </head>
  <body>
    <a class="skip-link" href="#inhalt">Zum Inhalt springen</a>
    <header class="doc-header">
      <div class="wrap">${options.headerHtml}</div>
    </header>
    <main id="inhalt">
      <div class="wrap">${options.mainHtml}</div>
    </main>
    <footer class="doc-footer">
      <div class="wrap">${options.footerHtml}</div>
    </footer>
  </body>
</html>
`;
}
