import type { WcagCriterion } from '../types.ts';

/**
 * WCAG 2.1 success criteria at conformance levels A and AA — the exact set
 * EN 301 549 (clause 9) requires for web content, and therefore the set the
 * BFSG references for consumer-facing online shops.
 *
 * German titles follow the German translation of WCAG 2.1 published by the
 * W3C Authorized Translation. EN 301 549 clause numbers for web content are
 * "9." + the success criterion number.
 *
 * Level AAA criteria are deliberately absent: they are out of scope for the
 * service and quoting them would overstate the obligation.
 */
export const WCAG_21_AA: readonly WcagCriterion[] = [
  { id: '1.1.1', level: 'A', titleDe: 'Nicht-Text-Inhalt', titleEn: 'Non-text Content' },
  {
    id: '1.2.1',
    level: 'A',
    titleDe: 'Reine Audio- und reine Videoinhalte (aufgezeichnet)',
    titleEn: 'Audio-only and Video-only (Prerecorded)',
  },
  {
    id: '1.2.2',
    level: 'A',
    titleDe: 'Untertitel (aufgezeichnet)',
    titleEn: 'Captions (Prerecorded)',
  },
  {
    id: '1.2.3',
    level: 'A',
    titleDe: 'Audiodeskription oder Volltext-Alternative (aufgezeichnet)',
    titleEn: 'Audio Description or Media Alternative (Prerecorded)',
  },
  { id: '1.2.4', level: 'AA', titleDe: 'Untertitel (live)', titleEn: 'Captions (Live)' },
  {
    id: '1.2.5',
    level: 'AA',
    titleDe: 'Audiodeskription (aufgezeichnet)',
    titleEn: 'Audio Description (Prerecorded)',
  },
  { id: '1.3.1', level: 'A', titleDe: 'Info und Beziehungen', titleEn: 'Info and Relationships' },
  {
    id: '1.3.2',
    level: 'A',
    titleDe: 'Bedeutungstragende Reihenfolge',
    titleEn: 'Meaningful Sequence',
  },
  {
    id: '1.3.3',
    level: 'A',
    titleDe: 'Sensorische Eigenschaften',
    titleEn: 'Sensory Characteristics',
  },
  { id: '1.3.4', level: 'AA', titleDe: 'Ausrichtung', titleEn: 'Orientation' },
  {
    id: '1.3.5',
    level: 'AA',
    titleDe: 'Eingabezweck bestimmen',
    titleEn: 'Identify Input Purpose',
  },
  { id: '1.4.1', level: 'A', titleDe: 'Benutzung von Farbe', titleEn: 'Use of Color' },
  { id: '1.4.2', level: 'A', titleDe: 'Audio-Steuerelement', titleEn: 'Audio Control' },
  { id: '1.4.3', level: 'AA', titleDe: 'Kontrast (Minimum)', titleEn: 'Contrast (Minimum)' },
  { id: '1.4.4', level: 'AA', titleDe: 'Textgröße ändern', titleEn: 'Resize Text' },
  { id: '1.4.5', level: 'AA', titleDe: 'Bilder eines Textes', titleEn: 'Images of Text' },
  { id: '1.4.10', level: 'AA', titleDe: 'Reflow', titleEn: 'Reflow' },
  { id: '1.4.11', level: 'AA', titleDe: 'Nicht-Text-Kontrast', titleEn: 'Non-text Contrast' },
  { id: '1.4.12', level: 'AA', titleDe: 'Textabstand', titleEn: 'Text Spacing' },
  {
    id: '1.4.13',
    level: 'AA',
    titleDe: 'Inhalt bei Hover oder Fokus',
    titleEn: 'Content on Hover or Focus',
  },
  { id: '2.1.1', level: 'A', titleDe: 'Tastatur', titleEn: 'Keyboard' },
  { id: '2.1.2', level: 'A', titleDe: 'Keine Tastaturfalle', titleEn: 'No Keyboard Trap' },
  { id: '2.1.4', level: 'A', titleDe: 'Tastaturkurzbefehle', titleEn: 'Character Key Shortcuts' },
  { id: '2.2.1', level: 'A', titleDe: 'Zeiteinteilung anpassbar', titleEn: 'Timing Adjustable' },
  {
    id: '2.2.2',
    level: 'A',
    titleDe: 'Pausieren, stoppen, ausblenden',
    titleEn: 'Pause, Stop, Hide',
  },
  {
    id: '2.3.1',
    level: 'A',
    titleDe: 'Grenzwert von dreimaligem Blitzen oder weniger',
    titleEn: 'Three Flashes or Below Threshold',
  },
  { id: '2.4.1', level: 'A', titleDe: 'Blöcke umgehen', titleEn: 'Bypass Blocks' },
  { id: '2.4.2', level: 'A', titleDe: 'Seite mit Titel versehen', titleEn: 'Page Titled' },
  { id: '2.4.3', level: 'A', titleDe: 'Fokus-Reihenfolge', titleEn: 'Focus Order' },
  {
    id: '2.4.4',
    level: 'A',
    titleDe: 'Linkzweck (im Kontext)',
    titleEn: 'Link Purpose (In Context)',
  },
  { id: '2.4.5', level: 'AA', titleDe: 'Verschiedene Methoden', titleEn: 'Multiple Ways' },
  {
    id: '2.4.6',
    level: 'AA',
    titleDe: 'Überschriften und Beschriftungen',
    titleEn: 'Headings and Labels',
  },
  { id: '2.4.7', level: 'AA', titleDe: 'Sichtbarer Fokus', titleEn: 'Focus Visible' },
  { id: '2.5.1', level: 'A', titleDe: 'Zeigergesten', titleEn: 'Pointer Gestures' },
  { id: '2.5.2', level: 'A', titleDe: 'Zeiger-Abbruch', titleEn: 'Pointer Cancellation' },
  {
    id: '2.5.3',
    level: 'A',
    titleDe: 'Beschriftung (Label) im Namen',
    titleEn: 'Label in Name',
  },
  { id: '2.5.4', level: 'A', titleDe: 'Bewegungsaktivierung', titleEn: 'Motion Actuation' },
  { id: '3.1.1', level: 'A', titleDe: 'Sprache der Seite', titleEn: 'Language of Page' },
  { id: '3.1.2', level: 'AA', titleDe: 'Sprache von Teilen', titleEn: 'Language of Parts' },
  { id: '3.2.1', level: 'A', titleDe: 'Bei Fokus', titleEn: 'On Focus' },
  { id: '3.2.2', level: 'A', titleDe: 'Bei Eingabe', titleEn: 'On Input' },
  { id: '3.2.3', level: 'AA', titleDe: 'Konsistente Navigation', titleEn: 'Consistent Navigation' },
  {
    id: '3.2.4',
    level: 'AA',
    titleDe: 'Konsistente Erkennung',
    titleEn: 'Consistent Identification',
  },
  { id: '3.3.1', level: 'A', titleDe: 'Fehlererkennung', titleEn: 'Error Identification' },
  {
    id: '3.3.2',
    level: 'A',
    titleDe: 'Beschriftungen (Labels) oder Anweisungen',
    titleEn: 'Labels or Instructions',
  },
  { id: '3.3.3', level: 'AA', titleDe: 'Fehlerempfehlung', titleEn: 'Error Suggestion' },
  {
    id: '3.3.4',
    level: 'AA',
    titleDe: 'Fehlervermeidung (rechtlich, finanziell, Daten)',
    titleEn: 'Error Prevention (Legal, Financial, Data)',
  },
  { id: '4.1.1', level: 'A', titleDe: 'Syntaxanalyse', titleEn: 'Parsing' },
  { id: '4.1.2', level: 'A', titleDe: 'Name, Rolle, Wert', titleEn: 'Name, Role, Value' },
  { id: '4.1.3', level: 'AA', titleDe: 'Statusmeldungen', titleEn: 'Status Messages' },
].map((c) => ({ ...c, en301549: `9.${c.id}` }) as WcagCriterion);

const BY_ID = new Map<string, WcagCriterion>(WCAG_21_AA.map((c) => [c.id, c]));

/** Look up a success criterion by its number, e.g. "1.4.3". */
export function getCriterion(id: string): WcagCriterion | undefined {
  return BY_ID.get(id);
}

/** True if the id is a WCAG 2.1 criterion at level A or AA. */
export function isAaCriterion(id: string): boolean {
  return BY_ID.has(id);
}

/**
 * Parse an axe-core `wcag<digits>` tag into a success-criterion number.
 * The tag encodes principle, guideline and criterion without separators:
 * `wcag143` → "1.4.3", `wcag1410` → "1.4.10".
 *
 * Returns undefined for tags that are not criterion tags (`wcag2a`,
 * `wcag21aa`, `best-practice`, `cat.forms`, …) or that do not resolve to a
 * WCAG 2.1 A/AA criterion.
 */
export function criterionFromAxeTag(tag: string): string | undefined {
  const match = /^wcag(\d)(\d)(\d+)$/.exec(tag);
  if (!match) return undefined;
  const id = `${match[1]}.${match[2]}.${match[3]}`;
  return BY_ID.has(id) ? id : undefined;
}

/** Sort criterion ids numerically (1.4.3 before 1.4.10, not after). */
export function compareCriteria(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
