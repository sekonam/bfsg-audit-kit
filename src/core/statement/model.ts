import { z } from 'zod';

/**
 * Answers required to produce a Barrierefreiheitserklärung (accessibility
 * statement) with the elements Anlage 3 of the BFSGV requires for services:
 *
 *   1. the applicable accessibility requirements,
 *   2. a description of the service in an accessible form,
 *   3. the explanations needed to understand how the service is provided,
 *   4. a description of how the requirements are met, and
 *   5. contact details for the competent market surveillance authority.
 *
 * Two design decisions that matter more than the schema itself:
 *
 * - **The authority's contact details are not hard-coded.** They are operator
 *   input carrying a `verifiedOn` date, because a wrong authority address in a
 *   legally required statement is a real defect and authority details change.
 *   `data/erklaerung.beispiel.json` ships placeholders; the schema rejects them.
 *
 * - **Nothing here is legal advice, and the wording has not been reviewed by a
 *   lawyer.** Until `legalReviewConfirmed` is set to true by the operator, every
 *   rendered statement carries a visible ENTWURF banner. See docs/RUNBOOK.md.
 */

const PLACEHOLDER = /(bitte\s+(ausfüllen|prüfen|eintragen)|^todo\b|xxx+|^<.*>$|^\.\.\.$)/i;

const filled = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} darf nicht leer sein`)
    .refine((v) => !PLACEHOLDER.test(v), {
      message: `${label} enthält noch einen Platzhalter — bitte durch echte Angaben ersetzen`,
    });

/** A required, non-placeholder string that must also be a valid e-mail / URL. */
const filledEmail = (label: string) =>
  filled(label).pipe(z.string().email('Keine gültige E-Mail-Adresse'));
const filledUrl = (label: string) => filled(label).pipe(z.string().url('Keine gültige URL'));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss im Format JJJJ-MM-TT angegeben werden');

export const AddressSchema = z.object({
  street: filled('Straße'),
  postalCode: filled('Postleitzahl'),
  city: filled('Ort'),
  country: z.string().trim().default('Deutschland'),
});

export const ProviderSchema = z.object({
  name: filled('Name des Anbieters'),
  legalForm: z.string().trim().optional(),
  address: AddressSchema,
  email: filledEmail('E-Mail-Adresse des Anbieters'),
  phone: z.string().trim().optional(),
  website: filledUrl('Website'),
});

export const ServiceSchema = z.object({
  name: filled('Bezeichnung der Dienstleistung'),
  url: filledUrl('Adresse der Dienstleistung'),
  /** Element 2: description of the service, in plain, accessible German. */
  description: filled('Beschreibung der Dienstleistung').pipe(
    z
      .string()
      .min(80, 'Die Beschreibung sollte die Dienstleistung wirklich erklären (≥ 80 Zeichen)'),
  ),
  /** Element 3: what a user needs to know in order to use it. */
  understandingNotes: z
    .array(filled('Erläuterung'))
    .min(1, 'Mindestens eine Erläuterung zur Nutzung ist erforderlich'),
});

export const KnownBarrierSchema = z.object({
  description: filled('Beschreibung der Barriere'),
  reason: filled('Begründung'),
  alternative: z.string().trim().optional(),
  plannedFix: z.string().trim().optional(),
});

export const ConformanceSchema = z.object({
  /** Element 1: which requirements apply. */
  standard: z.string().trim().default('EN 301 549 (Kapitel 9) / WCAG 2.1 Stufe AA'),
  status: z.enum(['vollstaendig', 'teilweise', 'nicht']),
  /** Element 4: how the requirements are met. */
  measures: z.array(filled('Maßnahme')).min(1, 'Mindestens eine Maßnahme muss beschrieben sein'),
  knownBarriers: z.array(KnownBarrierSchema).default([]),
});

export const FeedbackSchema = z.object({
  contactName: z.string().trim().optional(),
  email: filledEmail('Kontakt-E-Mail für Barrieremeldungen'),
  phone: z.string().trim().optional(),
  formUrl: z.string().trim().url('Keine gültige URL').optional(),
  responseTimeDays: z.number().int().positive().default(14),
});

export const AuthoritySchema = z.object({
  name: filled('Name der Marktüberwachungsbehörde'),
  address: AddressSchema,
  email: z.string().trim().email('Keine gültige E-Mail-Adresse').optional(),
  phone: z.string().trim().optional(),
  url: filledUrl('Website der Marktüberwachungsbehörde'),
  /**
   * When the operator last checked these details against the authority's own
   * page. Required: authority contact data changes and a stale address in a
   * legally required statement is a defect.
   */
  verifiedOn: isoDate,
});

export const MetaSchema = z.object({
  createdOn: isoDate,
  lastReviewedOn: isoDate,
  basis: z.enum(['selbstbewertung', 'externe-pruefung']),
  /**
   * Set true only after a German lawyer has reviewed the template wording.
   * While false, the statement renders with a visible ENTWURF banner.
   */
  legalReviewConfirmed: z.boolean().default(false),
});

export const StatementAnswersSchema = z.object({
  provider: ProviderSchema,
  service: ServiceSchema,
  conformance: ConformanceSchema,
  feedback: FeedbackSchema,
  authority: AuthoritySchema,
  meta: MetaSchema,
});

export type StatementAnswers = z.infer<typeof StatementAnswersSchema>;
export type KnownBarrier = z.infer<typeof KnownBarrierSchema>;

export class StatementValidationError extends Error {
  override readonly name = 'StatementValidationError';
  readonly issues: readonly string[];

  // Explicit assignment rather than a parameter property: Node's
  // --experimental-strip-types cannot erase parameter properties, and the CLI
  // is run straight from source during development.
  constructor(issues: readonly string[]) {
    super(
      `Die Angaben für die Barrierefreiheitserklärung sind unvollständig:\n${issues
        .map((i) => `  - ${i}`)
        .join('\n')}`,
    );
    this.issues = issues;
  }
}

/** Parse and validate answers, throwing a readable German error. */
export function parseStatementAnswers(input: unknown): StatementAnswers {
  const result = StatementAnswersSchema.safeParse(input);
  if (!result.success) {
    throw new StatementValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(Wurzel)'}: ${issue.message}`),
    );
  }
  return result.data;
}

const AUTHORITY_MAX_AGE_DAYS = 365;

/**
 * Non-fatal warnings. These do not block generation but must be surfaced to the
 * operator — a statement can be formally complete and still be stale.
 */
export function statementWarnings(answers: StatementAnswers, today = new Date()): string[] {
  const warnings: string[] = [];
  const ageDays = (iso: string): number =>
    (today.getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000;

  if (ageDays(answers.authority.verifiedOn) > AUTHORITY_MAX_AGE_DAYS) {
    warnings.push(
      `Die Angaben zur Marktüberwachungsbehörde wurden zuletzt am ${answers.authority.verifiedOn} geprüft (älter als ein Jahr). Bitte gegen die Website der Behörde abgleichen.`,
    );
  }
  if (ageDays(answers.meta.lastReviewedOn) > AUTHORITY_MAX_AGE_DAYS) {
    warnings.push(
      `Die Erklärung wurde zuletzt am ${answers.meta.lastReviewedOn} überprüft. Eine jährliche Überprüfung wird empfohlen.`,
    );
  }
  if (!answers.meta.legalReviewConfirmed) {
    warnings.push(
      'Die Formulierung wurde noch nicht anwaltlich geprüft. Die Erklärung wird als ENTWURF ausgegeben.',
    );
  }
  if (
    answers.conformance.status !== 'vollstaendig' &&
    answers.conformance.knownBarriers.length === 0
  ) {
    warnings.push(
      'Der Status ist nicht „vollständig", es sind aber keine bekannten Barrieren aufgeführt. Anlage 3 erwartet an dieser Stelle konkrete Angaben.',
    );
  }
  return warnings;
}
