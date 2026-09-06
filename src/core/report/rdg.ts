/**
 * The RDG boundary, enforced at render time.
 *
 * Rechtsdienstleistungsgesetz: assessing someone's legal exposure is a legal
 * service and may only be provided by people licensed to provide it. A
 * technical conformance report may say "this input has no label"; it may not
 * say "you are in breach", "you face a fine", or "this makes you compliant".
 *
 * The most persuasive sentence available is the one we may not write, so the
 * check is a hard failure rather than a lint warning: `assertNoLegalClaims`
 * throws, and every generated document passes through it.
 *
 * Note the list forbids BOTH directions — threats ("Bußgeld", "Abmahnung") and
 * guarantees ("rechtssicher", "BFSG-konform"). A promise of legal compliance is
 * as far outside our competence as a threat of legal consequences.
 */

export interface ForbiddenPattern {
  readonly pattern: RegExp;
  readonly why: string;
}

export const FORBIDDEN_LEGAL_CLAIMS: readonly ForbiddenPattern[] = [
  { pattern: /bußgeld/i, why: 'Androhung einer Geldbuße ist eine rechtliche Bewertung' },
  { pattern: /geldbuße/i, why: 'Androhung einer Geldbuße ist eine rechtliche Bewertung' },
  { pattern: /abmahnung/i, why: 'Abmahnrisiko zu bewerten ist Rechtsberatung' },
  { pattern: /abmahnwelle/i, why: 'Abmahnrisiko zu bewerten ist Rechtsberatung' },
  { pattern: /sanktion/i, why: 'Rechtsfolgen zu benennen ist Rechtsberatung' },
  { pattern: /\bstrafe[nr]?\b/i, why: 'Rechtsfolgen zu benennen ist Rechtsberatung' },
  { pattern: /rechtswidrig/i, why: 'Rechtmäßigkeit zu bewerten ist Rechtsberatung' },
  { pattern: /gesetzeswidrig/i, why: 'Rechtmäßigkeit zu bewerten ist Rechtsberatung' },
  { pattern: /nicht rechtskonform/i, why: 'Rechtmäßigkeit zu bewerten ist Rechtsberatung' },
  { pattern: /haftbar/i, why: 'Haftungsfragen sind Rechtsberatung' },
  { pattern: /\bhaftung\b/i, why: 'Haftungsfragen sind Rechtsberatung' },
  { pattern: /rechtssicher/i, why: 'Rechtssicherheit darf nicht zugesichert werden' },
  { pattern: /gesetzeskonform/i, why: 'Gesetzeskonformität darf nicht zugesichert werden' },
  { pattern: /bfsg-konform/i, why: 'Gesetzeskonformität darf nicht zugesichert werden' },
  { pattern: /rechtlich (unbedenklich|abgesichert)/i, why: 'rechtliche Zusicherung' },
  {
    pattern: /verstoß gegen (das|die)\s+(gesetz|bfsg|barrierefreiheitsstärkungsgesetz)/i,
    why: 'Feststellung eines Gesetzesverstoßes ist Rechtsberatung',
  },
];

export class RdgBoundaryError extends Error {
  override readonly name = 'RdgBoundaryError';
  readonly matches: readonly { text: string; why: string }[];

  // Written as explicit assignment rather than a parameter property: Node's
  // --experimental-strip-types cannot erase parameter properties, and the CLI
  // is run straight from source during development.
  constructor(matches: readonly { text: string; why: string }[], context: string) {
    super(
      `${context} enthält unzulässige rechtliche Aussagen (RDG-Grenze):\n` +
        matches.map((m) => `  - "${m.text}": ${m.why}`).join('\n'),
    );
    this.matches = matches;
  }
}

/** Find forbidden legal claims in a document. Returns an empty array if clean. */
export function findLegalClaims(text: string): { text: string; why: string }[] {
  const hits: { text: string; why: string }[] = [];
  for (const { pattern, why } of FORBIDDEN_LEGAL_CLAIMS) {
    const match = pattern.exec(text);
    if (match) hits.push({ text: match[0], why });
  }
  return hits;
}

/**
 * Remove quoted third-party evidence before checking a report.
 *
 * The guard must police what THIS codebase says, not what a shop's own markup
 * happens to contain. A perfectly ordinary German footer link —
 * `<a href="/haftung">Haftung</a>` — appears verbatim in a finding's snippet,
 * and checking the raw HTML made such a shop unreportable: `bfsg scan` exited 1
 * with no report and no obvious remedy.
 *
 * Quoted evidence is exactly the content inside `<code>` (snippets, selectors,
 * skipped URLs) and `<figcaption>` (the URL under a screenshot), so those are
 * stripped before the check.
 */
export function stripQuotedEvidence(html: string): string {
  return html
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, '<code></code>')
    .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, '<figcaption></figcaption>');
}

/**
 * Throw if the document asserts legal consequences or legal compliance.
 * Called by every generator; there is no flag to disable it.
 *
 * `quotesEvidence` opts into stripping quoted third-party markup first — set
 * for the audit and monitoring reports, which embed a shop's own HTML, and NOT
 * for the Barrierefreiheitserklärung, where every word is authored.
 */
export function assertNoLegalClaims(
  text: string,
  context = 'Das Dokument',
  options: { quotesEvidence?: boolean } = {},
): void {
  const subject = options.quotesEvidence ? stripQuotedEvidence(text) : text;
  const matches = findLegalClaims(subject);
  if (matches.length > 0) throw new RdgBoundaryError(matches, context);
}

/**
 * The scope note printed in full in every customer-facing document.
 *
 * The 57% figure is Deque's published measurement of what automated testing
 * can decide; it is quoted because it is the honest answer to "so am I done
 * now?" and because the remaining 43% is what the service actually sells.
 */
export const SCOPE_NOTE_DE = {
  heading: 'Geltungsbereich und Grenzen dieser Prüfung',
  paragraphs: [
    'Dieser Bericht dokumentiert ausschließlich die technische Übereinstimmung der untersuchten Seiten mit den Erfolgskriterien der WCAG 2.1 Stufe AA bzw. den entsprechenden Anforderungen der EN 301 549 zum Zeitpunkt der Prüfung.',
    'Der Bericht enthält keine rechtliche Bewertung. Er trifft keine Aussage darüber, ob eine gesetzliche Verpflichtung besteht, ob sie erfüllt wird oder welche Folgen sich daraus ergeben könnten. Eine solche Bewertung ist eine Rechtsdienstleistung und darf nur von dazu befugten Personen erbracht werden (Rechtsdienstleistungsgesetz, RDG). Für rechtliche Fragen wenden Sie sich bitte an eine Rechtsanwältin oder einen Rechtsanwalt.',
    'Automatisierte Prüfwerkzeuge decken nach Messungen von Deque etwa 57 % der Erfolgskriterien ab. Die übrigen Kriterien — unter anderem Fokusreihenfolge, sinnvolle Alternativtexte, Fehlerbehandlung, Bedienbarkeit mit Screenreader, Verständlichkeit und Umbruch bei 320 px — lassen sich nur manuell beurteilen. Ein Ergebnis ohne automatisch erkennbare Mängel bedeutet daher nicht, dass die Seite barrierefrei ist.',
    'Nicht Gegenstand dieser Prüfung sind: PDF-Dokumente, Untertitel und Audiodeskription für Videos, eingebettete Inhalte Dritter (Zahlungs-Iframes, Bewertungs- und Kartendienste), redaktionelle Inhalte, die Kriterien der WCAG 2.2 sowie sämtliche rechtlichen Fragen.',
  ],
} as const;

/** Short one-line version for the report header and the prospect summary. */
export const SCOPE_ONE_LINER_DE =
  'Technische Prüfung gegen WCAG 2.1 AA / EN 301 549 — keine rechtliche Bewertung.';
