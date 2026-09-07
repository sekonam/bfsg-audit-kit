import { escapeHtml, formatDateDe, safeHref, safeTel } from '../report/format.ts';
import { renderDocument } from '../report/shell.ts';
import { assertNoLegalClaims } from '../report/rdg.ts';
import { statementWarnings, type StatementAnswers } from './model.ts';

/**
 * Render the Barrierefreiheitserklärung.
 *
 * Every section below maps to a required element of BFSGV Anlage 3, and the
 * heading ids are stable so the mapping can be asserted in tests. The document
 * itself must pass WCAG 2.1 AA — an inaccessible accessibility statement is
 * self-refuting — so it goes through the same shell as the report and is
 * verified with axe in a browser.
 */

/** Section ids, in the order Anlage 3 lists the required elements. */
export const STATEMENT_SECTIONS = {
  scope: 'geltungsbereich',
  requirements: 'anforderungen',
  description: 'beschreibung',
  usage: 'nutzung',
  howMet: 'umsetzung',
  barriers: 'barrieren',
  feedback: 'feedback',
  authority: 'marktueberwachung',
  meta: 'erstellung',
} as const;

const STATUS_TEXT: Record<StatementAnswers['conformance']['status'], string> = {
  vollstaendig:
    'Die genannten Anforderungen werden nach dem Ergebnis der durchgeführten Prüfung vollständig erfüllt.',
  teilweise:
    'Die genannten Anforderungen werden überwiegend erfüllt. Die unter „Bekannte Barrieren“ aufgeführten Punkte sind derzeit nicht barrierefrei.',
  nicht:
    'Die genannten Anforderungen werden derzeit nicht vollständig erfüllt. Die unter „Bekannte Barrieren“ aufgeführten Punkte werden bearbeitet.',
};

const BASIS_TEXT: Record<StatementAnswers['meta']['basis'], string> = {
  selbstbewertung: 'Selbstbewertung durch den Anbieter',
  'externe-pruefung': 'externe Prüfung durch einen Dritten',
};

function draftBanner(): string {
  return `
    <div class="notice draft" role="note">
      <p><strong>ENTWURF — noch nicht veröffentlichen.</strong> Diese Erklärung wurde
      automatisch aus einer Vorlage erzeugt. Die Formulierung ist noch nicht anwaltlich geprüft.
      Vor der Veröffentlichung ist eine Prüfung durch eine Rechtsanwältin oder einen Rechtsanwalt
      erforderlich.</p>
    </div>`;
}

/**
 * Provider name, with the legal form appended only when it is not already part
 * of the name.
 *
 * Merchants type their full registered name — "Musterschuhe GmbH" — into the
 * name field and "GmbH" into the legal-form field, because both are asked for.
 * Appending unconditionally printed "Musterschuhe GmbH (GmbH)" at the top of a
 * legally required public statement.
 */
export function providerNameLine(provider: StatementAnswers['provider']): string {
  const form = provider.legalForm?.trim();
  if (!form) return provider.name;
  const name = provider.name.trim();
  // `\\b` only holds when the form ends in a word character. German forms often
  // do not — "Muster e.K." + "e.K." produced "Muster e.K. (e.K.)".
  const boundary = /\w$/.test(form) ? '\\b' : '(?!\\w)';
  const alreadyNamed = new RegExp(
    `(^|[\\s(])${form.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}${boundary}`,
    'i',
  ).test(name);
  return alreadyNamed ? name : `${name} (${form})`;
}

function addressBlock(address: StatementAnswers['provider']['address']): string {
  return `${escapeHtml(address.street)}<br />${escapeHtml(address.postalCode)} ${escapeHtml(
    address.city,
  )}<br />${escapeHtml(address.country)}`;
}

export interface StatementRenderResult {
  readonly html: string;
  readonly warnings: readonly string[];
  readonly isDraft: boolean;
}

export function renderStatementHtml(
  answers: StatementAnswers,
  today = new Date(),
): StatementRenderResult {
  const warnings = statementWarnings(answers, today);
  const isDraft = !answers.meta.legalReviewConfirmed;
  const title = `Erklärung zur Barrierefreiheit — ${answers.service.name}`;

  const headerHtml = `
    <h1>Erklärung zur Barrierefreiheit</h1>
    <p class="lead">${escapeHtml(answers.provider.name)} ist Anbieter der Dienstleistung
    „${escapeHtml(answers.service.name)}“ und erklärt hiermit, in welchem Umfang diese
    Dienstleistung barrierefrei nutzbar ist.</p>`;

  const barriersSection =
    answers.conformance.knownBarriers.length === 0
      ? `<p>Zum Zeitpunkt der letzten Überprüfung sind keine Barrieren bekannt. Sollten Sie auf
         eine Barriere stoßen, teilen Sie uns das bitte über den unten genannten Kontakt mit.</p>`
      : `<dl>
          ${answers.conformance.knownBarriers
            .map(
              (barrier) => `
            <dt>${escapeHtml(barrier.description)}</dt>
            <dd>
              <p><strong>Grund:</strong> ${escapeHtml(barrier.reason)}</p>
              ${barrier.alternative ? `<p><strong>Alternative:</strong> ${escapeHtml(barrier.alternative)}</p>` : ''}
              ${barrier.plannedFix ? `<p><strong>Geplante Behebung:</strong> ${escapeHtml(barrier.plannedFix)}</p>` : ''}
            </dd>`,
            )
            .join('')}
        </dl>`;

  const mainHtml = `
    ${isDraft ? draftBanner() : ''}

    <h2 id="${STATEMENT_SECTIONS.scope}">Geltungsbereich</h2>
    <p>Diese Erklärung gilt für die Dienstleistung „${escapeHtml(answers.service.name)}“,
    erreichbar unter <a href="${escapeHtml(safeHref(answers.service.url))}">${escapeHtml(answers.service.url)}</a>.</p>
    <p>Anbieter:</p>
    <address>
      ${escapeHtml(providerNameLine(answers.provider))}<br />
      ${addressBlock(answers.provider.address)}<br />
      E-Mail: <a href="mailto:${escapeHtml(answers.provider.email)}">${escapeHtml(answers.provider.email)}</a>
      ${answers.provider.phone ? `<br />Telefon: <a href="tel:${escapeHtml(safeTel(answers.provider.phone).replace(/[^0-9+]/g, ''))}">${escapeHtml(answers.provider.phone)}</a>` : ''}
    </address>

    <h2 id="${STATEMENT_SECTIONS.requirements}">Angewandte Barrierefreiheitsanforderungen</h2>
    <p>Grundlage sind die Anforderungen des Barrierefreiheitsstärkungsgesetzes (BFSG) und der
    Barrierefreiheitsstärkungsgesetz-Verordnung (BFSGV). Als technischer Maßstab wird angewendet:
    <strong>${escapeHtml(answers.conformance.standard)}</strong>.</p>

    <h2 id="${STATEMENT_SECTIONS.description}">Beschreibung der Dienstleistung</h2>
    <p>${escapeHtml(answers.service.description)}</p>

    <h2 id="${STATEMENT_SECTIONS.usage}">Was Sie zur Nutzung wissen müssen</h2>
    <ul>
      ${answers.service.understandingNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}
    </ul>

    <h2 id="${STATEMENT_SECTIONS.howMet}">Wie die Anforderungen erfüllt werden</h2>
    <p>${escapeHtml(STATUS_TEXT[answers.conformance.status])}</p>
    <ul>
      ${answers.conformance.measures.map((measure) => `<li>${escapeHtml(measure)}</li>`).join('')}
    </ul>

    <h2 id="${STATEMENT_SECTIONS.barriers}">Bekannte Barrieren</h2>
    ${barriersSection}

    <h2 id="${STATEMENT_SECTIONS.feedback}">Barriere melden — Kontakt</h2>
    <p>Sie können eine Barriere melden oder Informationen in einer zugänglichen Form anfordern.
    Wir antworten in der Regel innerhalb von ${escapeHtml(String(answers.feedback.responseTimeDays))} Tagen.</p>
    <ul>
      ${answers.feedback.contactName ? `<li>Ansprechpartner: ${escapeHtml(answers.feedback.contactName)}</li>` : ''}
      <li>E-Mail: <a href="mailto:${escapeHtml(answers.feedback.email)}">${escapeHtml(answers.feedback.email)}</a></li>
      ${answers.feedback.phone ? `<li>Telefon: <a href="tel:${escapeHtml(safeTel(answers.feedback.phone).replace(/[^0-9+]/g, ''))}">${escapeHtml(answers.feedback.phone)}</a></li>` : ''}
      ${answers.feedback.formUrl ? `<li>Kontaktformular: <a href="${escapeHtml(safeHref(answers.feedback.formUrl))}">${escapeHtml(answers.feedback.formUrl)}</a></li>` : ''}
    </ul>

    <h2 id="${STATEMENT_SECTIONS.authority}">Marktüberwachungsbehörde</h2>
    <p>Wenn Sie mit unserer Antwort nicht zufrieden sind, können Sie sich an die zuständige
    Marktüberwachungsbehörde wenden:</p>
    <address>
      ${escapeHtml(answers.authority.name)}<br />
      ${addressBlock(answers.authority.address)}<br />
      ${answers.authority.email ? `E-Mail: <a href="mailto:${escapeHtml(answers.authority.email)}">${escapeHtml(answers.authority.email)}</a><br />` : ''}
      ${answers.authority.phone ? `Telefon: <a href="tel:${escapeHtml(safeTel(answers.authority.phone).replace(/[^0-9+]/g, ''))}">${escapeHtml(answers.authority.phone)}</a><br />` : ''}
      Web: <a href="${escapeHtml(safeHref(answers.authority.url))}">${escapeHtml(answers.authority.url)}</a>
    </address>
    <p class="muted">Angaben zur Behörde zuletzt geprüft am ${escapeHtml(formatDateDe(answers.authority.verifiedOn))}.</p>

    <h2 id="${STATEMENT_SECTIONS.meta}">Erstellung dieser Erklärung</h2>
    <ul>
      <li>Erstellt am: ${escapeHtml(formatDateDe(answers.meta.createdOn))}</li>
      <li>Zuletzt überprüft am: ${escapeHtml(formatDateDe(answers.meta.lastReviewedOn))}</li>
      <li>Grundlage: ${escapeHtml(BASIS_TEXT[answers.meta.basis])}</li>
    </ul>`;

  const footerHtml = `
    <p>Erklärung zur Barrierefreiheit nach Anlage 3 der BFSGV · Stand ${escapeHtml(
      formatDateDe(answers.meta.lastReviewedOn),
    )}.</p>`;

  const extraCss = `
    address { font-style: normal; }
    dl dt { font-weight: 600; margin-top: 0.75rem; }
    dl dd { margin-left: 0; padding-left: 1rem; border-left: 3px solid var(--rule); }
    .draft { border-left-color: var(--critical-fg); background: var(--critical-bg); }
  `;

  const html = renderDocument({ title, headerHtml, mainHtml, footerHtml, extraCss });
  assertNoLegalClaims(html, 'Die Barrierefreiheitserklärung');
  return { html, warnings, isDraft };
}
