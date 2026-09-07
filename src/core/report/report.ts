import type { Finding, Journey, ScanResult, Severity } from '../types.ts';
import { CRITICAL_JOURNEYS, isSeverity } from '../types.ts';
import { compareCriteria, getCriterion } from '../wcag/catalog.ts';
import { bestPracticeFindings, conformanceFindings } from '../findings/normalize.ts';
import { conformanceBand } from '../findings/score.ts';
import { journeyLabel } from '../crawl/journey.ts';
import { platformLabel } from '../crawl/fingerprint.ts';
import {
  escapeHtml,
  formatDateTimeDe,
  formatNumberDe,
  plural,
  safeHref,
  severityLabelDe,
  severityMeaningDe,
} from './format.ts';
import { renderDocument, tableRegion } from './shell.ts';
import { assertNoLegalClaims, SCOPE_NOTE_DE } from './rdg.ts';

/**
 * The per-shop German audit report.
 *
 * Shape follows the service specification: summary score, the five critical
 * journeys, findings grouped by success criterion with screenshots, an effort
 * estimate, and an explicit scope note. Nothing here asserts a legal position
 * — `assertNoLegalClaims` runs over the finished document and throws if it does.
 */

export interface ReportOptions {
  /** Shop name as the merchant writes it. Falls back to the host. */
  readonly shopName?: string | undefined;
  /** Who produced the report. Appears in the footer. */
  readonly operatorName?: string | undefined;
  readonly operatorContact?: string | undefined;
  /** Maximum example occurrences listed per finding. */
  readonly maxInstancesPerFinding?: number;
  /** Prefix for screenshot paths relative to the report file. */
  readonly screenshotBase?: string;
}

const DEFAULT_MAX_INSTANCES = 5;

/** Host of a URL, or the raw string when it does not parse. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Severity badge.
 *
 * The class name is taken from a fixed lookup rather than interpolated, because
 * the value originates in the scanned page: an unvalidated severity went
 * straight into a class attribute, which is a stored XSS on the customer's
 * origin once they publish the report — and, during --pdf, script execution
 * inside our own Chromium that could rewrite the DOM after the RDG check had
 * already read the source.
 */
const BADGE_CLASS: Readonly<Record<Severity, string>> = {
  critical: 'badge-critical',
  serious: 'badge-serious',
  moderate: 'badge-moderate',
  minor: 'badge-minor',
};

function badge(severity: Severity): string {
  const cls = BADGE_CLASS[severity] ?? 'badge-minor';
  const label = isSeverity(severity) ? severityLabelDe(severity) : String(severity);
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function instancesTable(finding: Finding, max: number, screenshotBase: string): string {
  const shown = finding.instances.slice(0, max);
  const rows = shown
    .map(
      (instance) => `
        <tr>
          <td>${escapeHtml(journeyLabel(instance.journey))}</td>
          <td><a href="${escapeHtml(safeHref(instance.url))}">${escapeHtml(instance.url)}</a></td>
          <td><code>${escapeHtml(instance.selector)}</code></td>
          <td><code>${escapeHtml(instance.snippet)}</code></td>
        </tr>`,
    )
    .join('');

  const more =
    finding.instances.length > shown.length
      ? `<p class="muted">… und ${plural(finding.instances.length - shown.length, 'weiterer Fall', 'weitere Fälle')} derselben Ursache.</p>`
      : '';

  const shot = shown.find((i) => i.screenshot);
  const figure = shot?.screenshot
    ? `<figure>
         <img src="${escapeHtml(screenshotBase + shot.screenshot)}"
              alt="Bildschirmfoto des betroffenen Elements auf der Seite ${escapeHtml(journeyLabel(shot.journey))}" />
         <figcaption>Betroffenes Element auf: ${escapeHtml(shot.url)}</figcaption>
       </figure>`
    : '';

  const caption = `Beispiele (${plural(finding.instances.length, 'Fundstelle', 'Fundstellen')} insgesamt)`;
  return `
    ${figure}
    ${tableRegion(
      `${caption} — ${finding.titleDe}`,
      `<table class="instances">
        <caption>${escapeHtml(caption)}</caption>
        <thead>
          <tr><th scope="col">Seitentyp</th><th scope="col">Seite</th><th scope="col">Element</th><th scope="col">Markup</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`,
    )}
    ${more}`;
}

/**
 * One finding.
 *
 * `level` is passed in rather than fixed because the block appears under a
 * criterion heading (h3) in the conformance section and directly under the
 * section heading (h2) in the best-practice section. A fixed h4 would skip a
 * level in the second case — which is a defect this very report would flag on
 * a customer's shop.
 */
function findingBlock(
  finding: Finding,
  options: Required<Pick<ReportOptions, 'maxInstancesPerFinding' | 'screenshotBase'>>,
  level: 3 | 4 = 4,
): string {
  const criteria =
    finding.criteria.length > 0
      ? finding.criteria
          .map((id) => {
            const criterion = getCriterion(id);
            return criterion
              ? `${escapeHtml(id)} ${escapeHtml(criterion.titleDe)} (Stufe ${criterion.level}, EN 301 549 ${escapeHtml(criterion.en301549)})`
              : escapeHtml(id);
          })
          .join('; ')
      : 'kein Erfolgskriterium der Stufe AA — Hinweis zur guten Praxis';

  return `
    <div class="finding">
      <h${level}>${escapeHtml(finding.titleDe)} ${badge(finding.severity)}</h${level}>
      <p>${escapeHtml(finding.descriptionDe)}</p>
      <p class="muted"><strong>Auswirkung:</strong> ${escapeHtml(severityMeaningDe(finding.severity))}</p>
      <p><strong>Betroffenes Kriterium:</strong> ${criteria}</p>
      <p><strong>Empfohlene Behebung:</strong> ${escapeHtml(finding.remediationDe)}</p>
      <p class="muted">Prüfregel: <code>${escapeHtml(finding.ruleId)}</code> (${escapeHtml(finding.source)})${
        finding.helpUrl
          ? ` — <a href="${escapeHtml(safeHref(finding.helpUrl))}">Regelbeschreibung</a>`
          : ''
      }</p>
      ${instancesTable(finding, options.maxInstancesPerFinding, options.screenshotBase)}
    </div>`;
}

function journeyTable(scan: ScanResult): string {
  const rows = CRITICAL_JOURNEYS.map((journey) => {
    const page = scan.crawl.pages.find((p) => p.journey === journey);
    const findings = conformanceFindings(scan.findings).filter((f) =>
      f.instances.some((i) => i.journey === journey),
    );
    const worst: Severity | undefined = (
      ['critical', 'serious', 'moderate', 'minor'] as const
    ).find((s) => findings.some((f) => f.severity === s));
    return `
      <tr>
        <th scope="row">${escapeHtml(journeyLabel(journey))}</th>
        <td>${page ? `<a href="${escapeHtml(safeHref(page.url))}">${escapeHtml(page.url)}</a>` : '<span class="muted">nicht erreicht</span>'}</td>
        <td class="numeric">${page ? formatNumberDe(findings.length) : '—'}</td>
        <td>${worst ? badge(worst) : page ? '<span class="badge badge-ok">ohne Befund</span>' : '—'}</td>
      </tr>`;
  }).join('');

  const others = scan.crawl.pages.filter((p) => !CRITICAL_JOURNEYS.includes(p.journey));
  const otherRow =
    others.length > 0
      ? `<tr>
           <th scope="row">${escapeHtml(journeyLabel('other'))}</th>
           <td>${plural(others.length, 'weitere Seite', 'weitere Seiten')} geprüft</td>
           <td class="numeric">—</td><td>—</td>
         </tr>`
      : '';

  return tableRegion(
    'Die fünf kritischen Nutzungswege',
    `<table>
        <caption>Die fünf kritischen Nutzungswege</caption>
        <thead>
          <tr>
            <th scope="col">Nutzungsweg</th><th scope="col">Geprüfte Seite</th>
            <th scope="col">Befunde</th><th scope="col">Höchste Einstufung</th>
          </tr>
        </thead>
        <tbody>${rows}${otherRow}</tbody>
      </table>`,
  );
}

function summarySection(scan: ScanResult): string {
  const { score } = scan;
  const severityRows = score.bySeverity
    .filter((row) => row.findings > 0)
    .map(
      (row) => `
        <tr>
          <th scope="row">${badge(row.severity)}</th>
          <td class="numeric">${formatNumberDe(row.findings)}</td>
          <td class="numeric">${formatNumberDe(row.instances)}</td>
          <td>${escapeHtml(severityMeaningDe(row.severity))}</td>
        </tr>`,
    )
    .join('');

  return `
    <h2 id="zusammenfassung">Zusammenfassung</h2>
    <div class="scorecard">
      <div>
        <span class="value">${formatNumberDe(score.conformance)}/100</span>
        <span>Automatisch geprüfte Konformität</span><br />
        <span class="muted">${escapeHtml(conformanceBand(score.conformance))}</span>
      </div>
      <div>
        <span class="value">${formatNumberDe(score.failedCriteria.length)}</span>
        <span>betroffene Erfolgskriterien (WCAG 2.1 AA)</span>
      </div>
      <div>
        <span class="value">${formatNumberDe(score.totalInstances)}</span>
        <span>Fundstellen in ${plural(scan.crawl.pages.length, 'geprüfter Seite', 'geprüften Seiten')}</span>
      </div>
      ${
        scan.lighthouseScore !== null
          ? `<div><span class="value">${formatNumberDe(scan.lighthouseScore)}/100</span><span>Lighthouse „Accessibility“</span></div>`
          : ''
      }
    </div>
    <div class="notice">
      <p><strong>Wie diese Zahl zu lesen ist:</strong> Der Wert beschreibt ausschließlich die
      maschinell prüfbaren Kriterien. Er ist eine Priorisierungshilfe, kein Konformitätsnachweis.
      Auch bei 100 von 100 bleibt die manuelle Prüfung erforderlich.</p>
    </div>
    ${
      severityRows === ''
        ? '<p>In den geprüften Seiten wurden keine automatisch erkennbaren Verstöße gegen WCAG 2.1 AA gefunden.</p>'
        : tableRegion(
            'Befunde nach Einstufung',
            `<table>
             <caption>Befunde nach Einstufung</caption>
             <thead><tr><th scope="col">Einstufung</th><th scope="col">Befunde</th><th scope="col">Fundstellen</th><th scope="col">Bedeutung</th></tr></thead>
             <tbody>${severityRows}</tbody>
           </table>`,
          )
    }`;
}

function criteriaSections(
  scan: ScanResult,
  options: Required<Pick<ReportOptions, 'maxInstancesPerFinding' | 'screenshotBase'>>,
): string {
  const findings = conformanceFindings(scan.findings);
  if (findings.length === 0) {
    return '<p>Keine Befunde mit Bezug auf ein Erfolgskriterium der Stufe AA.</p>';
  }

  // Each finding appears ONCE, under its lowest-numbered criterion; the other
  // criteria it touches are listed inside the block. Rendering it under every
  // criterion would duplicate whole sections — and duplicate their ids.
  const byCriterion = new Map<string, Finding[]>();
  for (const finding of findings) {
    const primary = [...finding.criteria].sort(compareCriteria)[0];
    if (!primary) continue;
    const list = byCriterion.get(primary) ?? [];
    list.push(finding);
    byCriterion.set(primary, list);
  }

  return [...byCriterion.keys()]
    .sort(compareCriteria)
    .map((id) => {
      const criterion = getCriterion(id);
      const heading = criterion
        ? `${escapeHtml(id)} ${escapeHtml(criterion.titleDe)} <span class="muted">(Stufe ${criterion.level}, EN 301 549 ${escapeHtml(criterion.en301549)})</span>`
        : escapeHtml(id);
      const blocks = (byCriterion.get(id) ?? [])
        .map((finding) => findingBlock(finding, options))
        .join('');
      return `<h3 id="sc-${escapeHtml(id.replace(/\./g, '-'))}">${heading}</h3>${blocks}`;
    })
    .join('');
}

function manualSection(): string {
  return `
    <h2 id="manuell">Was diese Prüfung nicht leisten kann</h2>
    <p>Die folgenden Anforderungen sind maschinell nicht entscheidbar und benötigen eine
    manuelle Prüfung an der tatsächlichen Umsetzung:</p>
    <ul>
      <li><strong>Sinnhaftigkeit der Alternativtexte.</strong> Ein Werkzeug erkennt, dass ein
        <code>alt</code>-Attribut fehlt — nicht, ob „Bild1.jpg“ den Artikel beschreibt.</li>
      <li><strong>Fokusreihenfolge und Tastaturbedienung.</strong> Ob sich Filter, Größenauswahl,
        Cookie-Dialog und Bestellabschluss vollständig ohne Maus bedienen lassen.</li>
      <li><strong>Screenreader-Ausgabe.</strong> Verifikation mit NVDA (Firefox) und
        VoiceOver (Safari) auf den fünf Nutzungswegen.</li>
      <li><strong>Fehlerbehandlung im Bestellprozess.</strong> Ob Fehlermeldungen erkannt,
        zugeordnet und korrigierbar sind (Erfolgskriterien 3.3.1 bis 3.3.4).</li>
      <li><strong>Umbruch bei 320 px und Textabstand.</strong> Ob Inhalte bei starker
        Vergrößerung vollständig erreichbar bleiben (1.4.10, 1.4.12).</li>
      <li><strong>Verständlichkeit und Konsistenz</strong> von Beschriftungen und Navigation.</li>
    </ul>
    <p>Nach Messungen von Deque sind rund 57 % der Erfolgskriterien maschinell prüfbar. Die
    verbleibenden rund 43 % sind der Teil, den dieser Bericht offenlässt.</p>`;
}

function effortSection(scan: ScanResult): string {
  const { effortHours } = scan.score;
  const mechanical = conformanceFindings(scan.findings).filter((f) => f.mechanicallyFixable).length;
  const total = conformanceFindings(scan.findings).length;
  return `
    <h2 id="aufwand">Aufwandsschätzung</h2>
    <p>Geschätzter Aufwand für die Behebung der oben genannten Befunde auf den fünf kritischen
    Nutzungswegen, einschließlich Nachtest:
    <strong>${formatNumberDe(effortHours.low, 1)} bis ${formatNumberDe(effortHours.high, 1)} Stunden</strong>.</p>
    <p>${
      total === 0
        ? 'Es liegen keine automatisch erkennbaren Befunde vor.'
        : `Davon sind ${formatNumberDe(mechanical)} von ${formatNumberDe(total)} Befunden durch wiederholbare Änderungen am Theme zu beheben (z. B. Farbwerte, Sprachattribut, Sprunglink); die übrigen erfordern eine inhaltliche Entscheidung.`
    }</p>
    <p class="muted">Die Schätzung beruht auf Art und Häufigkeit der Befunde. Sie ist kein Angebot;
    der tatsächliche Aufwand hängt vom Zustand des Themes und von eingesetzten Erweiterungen ab.</p>`;
}

function methodSection(scan: ScanResult): string {
  const skipped = scan.crawl.skipped;
  const skippedRows = skipped
    .slice(0, 20)
    .map(
      (entry) =>
        `<tr><td><code>${escapeHtml(entry.url)}</code></td><td>${escapeHtml(entry.reason)}</td></tr>`,
    )
    .join('');

  // A COUNT, never a list. `Disallow:` is where a shop keeps its staging areas
  // and back-office paths, and this document gets forwarded and sometimes
  // published. See CrawlResult.robotsExcluded.
  const excluded = scan.crawl.robotsExcluded ?? 0;

  return `
    <h2 id="methodik">Methodik</h2>
    <p>Die Seiten wurden mit einem Browser geladen und automatisiert geprüft. Es wurden
    ausschließlich öffentlich erreichbare Seiten abgerufen, ohne Formulareingaben und ohne
    Bestellvorgang. Die Datei <code>robots.txt</code> wurde
    ${scan.crawl.robotsRespected ? 'beachtet' : 'auf ausdrückliche Anweisung nicht beachtet'};
    zwischen zwei Abrufen lag mindestens eine Wartezeit, und der Prüfbot war im
    <code>User-Agent</code> mit Kontaktadresse erkennbar.</p>
    ${
      excluded > 0
        ? // Not plural(): that helper prefixes the count, and this sentence needs
          // the number inside a different clause in each form.
          `<p>${excluded === 1 ? 'Eine Adresse wurde' : `${formatNumberDe(excluded)} Adressen wurden`}
           durch <code>robots.txt</code> ausgeschlossen und deshalb nicht abgerufen. Die betroffenen
           Adressen sind hier bewusst nicht aufgeführt; sie stehen im Protokoll des Prüflaufs.</p>`
        : ''
    }
    ${tableRegion(
      'Eingesetzte Werkzeuge',
      `<table>
        <caption>Eingesetzte Werkzeuge</caption>
        <thead><tr><th scope="col">Werkzeug</th><th scope="col">Version</th></tr></thead>
        <tbody>${Object.entries(scan.toolVersions)
          .map(
            ([name, version]) =>
              `<tr><th scope="row">${escapeHtml(name)}</th><td>${escapeHtml(version)}</td></tr>`,
          )
          .join('')}</tbody>
      </table>`,
    )}
    ${
      skippedRows === ''
        ? ''
        : tableRegion(
            'Nicht geprüfte Seiten',
            `<table>
             <caption>Nicht geprüfte Seiten (${plural(skipped.length, 'Eintrag', 'Einträge')})</caption>
             <thead><tr><th scope="col">Adresse</th><th scope="col">Grund</th></tr></thead>
             <tbody>${skippedRows}</tbody>
           </table>`,
          )
    }`;
}

function scopeSection(): string {
  return `
    <h2 id="geltungsbereich">${escapeHtml(SCOPE_NOTE_DE.heading)}</h2>
    ${SCOPE_NOTE_DE.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}`;
}

function bestPracticeSection(
  scan: ScanResult,
  options: Required<Pick<ReportOptions, 'maxInstancesPerFinding' | 'screenshotBase'>>,
): string {
  const findings = bestPracticeFindings(scan.findings);
  if (findings.length === 0) return '';
  return `
    <h2 id="hinweise">Weitere Hinweise (außerhalb WCAG 2.1 AA)</h2>
    <p>Diese Punkte sind keine Verstöße gegen ein Erfolgskriterium der Stufe AA. Sie sind als
    Empfehlung aufgeführt, weil sie die Bedienbarkeit spürbar verbessern.</p>
    ${findings.map((finding) => findingBlock(finding, options, 3)).join('')}`;
}

/** Render the full German audit report as a self-contained HTML document. */
export function renderReportHtml(scan: ScanResult, options: ReportOptions = {}): string {
  const resolved = {
    maxInstancesPerFinding: options.maxInstancesPerFinding ?? DEFAULT_MAX_INSTANCES,
    screenshotBase: options.screenshotBase ?? 'screenshots/',
  };
  // scan.json can come from disk, so `origin` is not guaranteed to parse.
  const shopName = options.shopName ?? hostOf(scan.origin);
  const title = `Barrierefreiheits-Prüfbericht — ${shopName}`;
  const missing: Journey[] = CRITICAL_JOURNEYS.filter(
    (j) => !scan.crawl.pages.some((p) => p.journey === j),
  );

  const headerHtml = `
    <p class="muted">Technischer Prüfbericht</p>
    <h1>${escapeHtml(title)}</h1>
    <dl class="meta">
      <div><dt>Geprüfte Adresse</dt><dd><a href="${escapeHtml(safeHref(scan.origin))}">${escapeHtml(scan.origin)}</a></dd></div>
      <div><dt>Prüfzeitpunkt</dt><dd>${escapeHtml(formatDateTimeDe(scan.scannedAt))}</dd></div>
      <div><dt>Prüfmaßstab</dt><dd>WCAG 2.1 Stufe AA / EN 301 549 (Kapitel 9)</dd></div>
      <div><dt>Shopsystem</dt><dd>${escapeHtml(platformLabel(scan.crawl.platform))}</dd></div>
      <div><dt>Geprüfte Seiten</dt><dd>${plural(scan.crawl.pages.length, 'Seite', 'Seiten')} (je Seitentyp eine Stichprobe)</dd></div>
    </dl>`;

  const mainHtml = `
    <nav class="toc" aria-labelledby="inhalt-titel">
      <h2 id="inhalt-titel">Inhalt</h2>
      <ol>
        <li><a href="#zusammenfassung">Zusammenfassung</a></li>
        <li><a href="#nutzungswege">Die fünf kritischen Nutzungswege</a></li>
        <li><a href="#befunde">Befunde nach Erfolgskriterium</a></li>
        ${bestPracticeFindings(scan.findings).length > 0 ? '<li><a href="#hinweise">Weitere Hinweise</a></li>' : ''}
        <li><a href="#manuell">Was diese Prüfung nicht leisten kann</a></li>
        <li><a href="#aufwand">Aufwandsschätzung</a></li>
        <li><a href="#methodik">Methodik</a></li>
        <li><a href="#geltungsbereich">${escapeHtml(SCOPE_NOTE_DE.heading)}</a></li>
      </ol>
    </nav>

    ${summarySection(scan)}

    <h2 id="nutzungswege">Die fünf kritischen Nutzungswege</h2>
    <p>Geprüft wurden die Seiten, über die eine Bestellung zustande kommt. Ein Mangel im
    Bestellabschluss wiegt schwerer als derselbe Mangel auf einer Inhaltsseite.</p>
    ${journeyTable(scan)}
    ${
      missing.length > 0
        ? `<div class="notice"><p><strong>Nicht erreicht:</strong> ${escapeHtml(
            missing.map(journeyLabel).join(', '),
          )}. Diese Seiten waren über die öffentliche Navigation nicht auffindbar oder setzen einen
          gefüllten Warenkorb voraus. Sie sind in diesem Bericht nicht bewertet.</p></div>`
        : ''
    }

    <h2 id="befunde">Befunde nach Erfolgskriterium</h2>
    ${criteriaSections(scan, resolved)}

    ${bestPracticeSection(scan, resolved)}
    ${manualSection()}
    ${effortSection(scan)}
    ${methodSection(scan)}
    ${scopeSection()}`;

  const footerHtml = `
    <p>${escapeHtml(
      options.operatorName
        ? `Erstellt von ${options.operatorName}${options.operatorContact ? ` · ${options.operatorContact}` : ''}`
        : 'Automatisch erzeugter technischer Prüfbericht.',
    )}</p>
    <p>Prüfbericht vom ${escapeHtml(formatDateTimeDe(scan.scannedAt))} · Prüfmaßstab WCAG 2.1 AA / EN 301 549.</p>`;

  const html = renderDocument({ title, headerHtml, mainHtml, footerHtml });
  // The report quotes the shop's own markup, so the check runs over the text
  // this codebase authored, not over the evidence it reproduces.
  assertNoLegalClaims(html, 'Der Prüfbericht', { quotesEvidence: true });
  return html;
}
