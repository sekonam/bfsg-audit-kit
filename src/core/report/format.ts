import type { Severity } from '../types.ts';

/** HTML escaping. Every value interpolated into a template goes through this. */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** German date, e.g. "5. September 2026". */
export function formatDateDe(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** German date and time, for the scan timestamp. */
export function formatDateTimeDe(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)}, ${new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)} Uhr`;
}

/** German number with a comma decimal separator. */
export function formatNumberDe(value: number, digits = 0): string {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function severityLabelDe(severity: Severity): string {
  const labels: Record<Severity, string> = {
    critical: 'kritisch',
    serious: 'schwerwiegend',
    moderate: 'mittel',
    minor: 'gering',
  };
  return labels[severity];
}

/**
 * What the severity means for a shopper, in one sentence. Severity words alone
 * are jargon; a merchant acts on the consequence.
 */
export function severityMeaningDe(severity: Severity): string {
  const meanings: Record<Severity, string> = {
    critical: 'Die Funktion ist für betroffene Nutzende nicht verwendbar.',
    serious: 'Die Nutzung ist erheblich erschwert; Umwege sind nötig.',
    moderate: 'Die Nutzung ist möglich, aber unnötig mühsam.',
    minor: 'Geringe Beeinträchtigung, sollte bei Gelegenheit behoben werden.',
  };
  return meanings[severity];
}

/** German plural helper: `plural(1, 'Seite', 'Seiten')` → "1 Seite". */
export function plural(count: number, one: string, many: string): string {
  return `${formatNumberDe(count)} ${count === 1 ? one : many}`;
}
