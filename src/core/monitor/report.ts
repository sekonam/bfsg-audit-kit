import { isSeverity, type Severity } from '../types.ts';
import { journeyLabel } from '../crawl/journey.ts';
import {
  escapeHtml,
  formatDateTimeDe,
  formatNumberDe,
  plural,
  safeHref,
  severityLabelDe,
} from '../report/format.ts';
import { assertNoLegalClaims, SCOPE_ONE_LINER_DE } from '../report/rdg.ts';
import { renderDocument } from '../report/shell.ts';
import type { FindingDelta, ScanDiff } from './diff.ts';

/**
 * The regression report for the Care retainer.
 *
 * Deliberately short. The customer asked one question — "is anything worse
 * than last month?" — and the answer belongs in the first line, not on page
 * three. Everything else is supporting detail.
 *
 * There is no delivery mechanism attached to this by design: the toolkit has
 * no email capability (§ 7 Abs. 2 UWG), so the report is a file the operator
 * sends, or a URL the customer opens.
 */

/** Same fixed lookup as the audit report: never interpolate a severity. */
const BADGE_CLASS: Readonly<Record<Severity, string>> = {
  critical: 'badge-critical',
  serious: 'badge-serious',
  moderate: 'badge-moderate',
  minor: 'badge-minor',
};

function deltaRow(delta: FindingDelta): string {
  const change =
    delta.after === delta.before
      ? formatNumberDe(delta.after)
      : `${formatNumberDe(delta.before)} → ${formatNumberDe(delta.after)}`;
  return `
    <tr>
      <th scope="row">${escapeHtml(delta.titleDe)}</th>
      <td><span class="badge ${BADGE_CLASS[delta.severity] ?? 'badge-minor'}">${escapeHtml(
        isSeverity(delta.severity) ? severityLabelDe(delta.severity) : String(delta.severity),
      )}</span></td>
      <td>${escapeHtml(delta.kind)}</td>
      <td class="numeric">${change}</td>
      <td>${
        delta.journeys.length > 0
          ? escapeHtml(delta.journeys.map(journeyLabel).join(', '))
          : '<span class="muted">—</span>'
      }</td>
    </tr>`;
}

function deltaTable(caption: string, deltas: readonly FindingDelta[]): string {
  if (deltas.length === 0) return '';
  return `
    <div class="table-scroll">
      <table>
        <caption>${escapeHtml(caption)}</caption>
        <thead>
          <tr>
            <th scope="col">Befund</th><th scope="col">Einstufung</th>
            <th scope="col">Veränderung</th><th scope="col">Fundstellen</th>
            <th scope="col">Betroffene Nutzungswege</th>
          </tr>
        </thead>
        <tbody>${deltas.map(deltaRow).join('')}</tbody>
      </table>
    </div>`;
}

export interface RegressionReportOptions {
  readonly shopName?: string | undefined;
  readonly operatorName?: string | undefined;
}

export function renderRegressionReportHtml(
  diff: ScanDiff,
  options: RegressionReportOptions = {},
): string {
  let shopName = options.shopName;
  if (!shopName) {
    try {
      shopName = new URL(diff.origin).host;
    } catch {
      shopName = diff.origin;
    }
  }
  const title = `Überwachungsbericht — ${shopName}`;
  const deltaSign = diff.conformanceDelta > 0 ? '+' : '';

  const verdict = diff.hasRegression
    ? `<div class="notice draft" role="note">
         <p><strong>Es gibt Verschlechterungen gegenüber der letzten Prüfung.</strong>
         ${escapeHtml(
           [
             diff.newFindings.length > 0
               ? plural(diff.newFindings.length, 'neuer Befund', 'neue Befunde')
               : '',
             diff.worsened.length > 0
               ? plural(
                   diff.worsened.length,
                   'Befund mit mehr Fundstellen',
                   'Befunde mit mehr Fundstellen',
                 )
               : '',
             diff.conformanceDelta < 0
               ? `Kennzahl um ${formatNumberDe(Math.abs(diff.conformanceDelta))} Punkte gefallen`
               : '',
           ]
             .filter(Boolean)
             .join(' · '),
         )}</p>
       </div>`
    : `<div class="notice" role="note">
         <p><strong>Keine Verschlechterung gegenüber der letzten Prüfung.</strong>
         ${
           diff.resolvedFindings.length > 0
             ? escapeHtml(
                 `${plural(diff.resolvedFindings.length, 'Befund ist', 'Befunde sind')} entfallen.`,
               )
             : ''
         }</p>
       </div>`;

  const headerHtml = `
    <p class="muted">Regelmäßige technische Überwachung</p>
    <h1>${escapeHtml(title)}</h1>
    <dl class="meta">
      <div><dt>Adresse</dt><dd><a href="${escapeHtml(safeHref(diff.origin))}">${escapeHtml(diff.origin)}</a></dd></div>
      <div><dt>Vergleichszeitraum</dt><dd>${escapeHtml(formatDateTimeDe(diff.baselineAt))} → ${escapeHtml(formatDateTimeDe(diff.currentAt))}</dd></div>
      <div><dt>Prüfmaßstab</dt><dd>${escapeHtml(SCOPE_ONE_LINER_DE)}</dd></div>
    </dl>`;

  const journeyNotes = [
    diff.journeysNewlyAffected.length > 0
      ? `<p><strong>Neu betroffene Nutzungswege:</strong> ${escapeHtml(
          diff.journeysNewlyAffected.map(journeyLabel).join(', '),
        )}.</p>`
      : '',
    diff.journeysNowClean.length > 0
      ? `<p><strong>Nicht mehr betroffen:</strong> ${escapeHtml(
          diff.journeysNowClean.map(journeyLabel).join(', '),
        )}.</p>`
      : '',
  ].join('');

  const pageNotes =
    diff.pagesAdded.length > 0 || diff.pagesRemoved.length > 0
      ? `<h2 id="seiten">Veränderte Seitenauswahl</h2>
         <p class="muted">Die Stichprobe wird bei jedem Durchlauf neu ermittelt. Abweichungen hier
         erklären oft, warum ein Befund entfallen ist, ohne behoben worden zu sein.</p>
         ${
           diff.pagesAdded.length > 0
             ? `<p><strong>Neu geprüft:</strong></p><ul>${diff.pagesAdded
                 .map((u) => `<li><code>${escapeHtml(u)}</code></li>`)
                 .join('')}</ul>`
             : ''
         }
         ${
           diff.pagesRemoved.length > 0
             ? `<p><strong>Diesmal nicht geprüft:</strong></p><ul>${diff.pagesRemoved
                 .map((u) => `<li><code>${escapeHtml(u)}</code></li>`)
                 .join('')}</ul>`
             : ''
         }`
      : '';

  const mainHtml = `
    ${verdict}

    <h2 id="kennzahl">Kennzahl</h2>
    <div class="scorecard">
      <div><span class="value">${formatNumberDe(diff.conformanceAfter)}/100</span><span>aktuell</span></div>
      <div><span class="value">${formatNumberDe(diff.conformanceBefore)}/100</span><span>vorherige Prüfung</span></div>
      <div><span class="value">${deltaSign}${formatNumberDe(diff.conformanceDelta)}</span><span>Veränderung</span></div>
    </div>
    <p class="muted">Die Kennzahl beschreibt nur maschinell prüfbare Kriterien und ist eine
    Priorisierungshilfe, kein Konformitätsnachweis.</p>

    <h2 id="veraenderungen">Veränderungen</h2>
    ${
      diff.newFindings.length === 0 &&
      diff.worsened.length === 0 &&
      diff.resolvedFindings.length === 0 &&
      diff.improved.length === 0
        ? '<p>Keine Veränderungen gegenüber der letzten Prüfung.</p>'
        : ''
    }
    ${deltaTable('Neue Befunde', diff.newFindings)}
    ${deltaTable('Mehr Fundstellen als zuvor', diff.worsened)}
    ${deltaTable('Weniger Fundstellen als zuvor', diff.improved)}
    ${deltaTable('Entfallene Befunde', diff.resolvedFindings)}
    ${journeyNotes}

    ${pageNotes}

    <h2 id="hinweis">Hinweis zum Umfang</h2>
    <p>${escapeHtml(SCOPE_ONE_LINER_DE)} Die Überwachung wiederholt ausschließlich die
    automatisierte Prüfung. Manuelle Kriterien — Fokusreihenfolge, Alternativtexte,
    Screenreader-Ausgabe, Fehlerbehandlung — sind nicht Gegenstand dieses Durchlaufs.</p>`;

  const footerHtml = `<p>${escapeHtml(
    options.operatorName ? `Erstellt von ${options.operatorName}` : 'Automatisch erzeugter Bericht',
  )} · ${escapeHtml(formatDateTimeDe(diff.currentAt))}</p>`;

  const extraCss = `.draft { border-left-color: var(--critical-fg); background: var(--critical-bg); }`;

  const html = renderDocument({ title, headerHtml, mainHtml, footerHtml, extraCss });
  assertNoLegalClaims(html, 'Der Überwachungsbericht', { quotesEvidence: true });
  return html;
}
