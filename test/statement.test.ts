import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseStatementAnswers,
  statementWarnings,
  StatementValidationError,
} from '../src/core/statement/model.ts';
import {
  providerNameLine,
  renderStatementHtml,
  STATEMENT_SECTIONS,
} from '../src/core/statement/render.ts';
import { RdgBoundaryError } from '../src/core/report/rdg.ts';
import { sampleStatement, sampleStatementInput } from './helpers/sample-statement.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('statement answers validation', () => {
  it('accepts a fully filled set of answers', () => {
    expect(() => parseStatementAnswers(sampleStatementInput())).not.toThrow();
  });

  it('rejects the shipped template, because it is all placeholders', async () => {
    const template = JSON.parse(
      await readFile(join(REPO_ROOT, 'data', 'erklaerung.beispiel.json'), 'utf8'),
    );
    expect(() => parseStatementAnswers(template)).toThrow(StatementValidationError);
    try {
      parseStatementAnswers(template);
    } catch (error) {
      const issues = (error as StatementValidationError).issues.join('\n');
      expect(issues).toMatch(/Platzhalter/);
      expect(issues).toMatch(/authority/);
    }
  });

  it('requires the market surveillance authority — element 5 of Anlage 3', () => {
    const input = sampleStatementInput() as Record<string, unknown>;
    delete input.authority;
    expect(() => parseStatementAnswers(input)).toThrow(StatementValidationError);
  });

  it('requires a verification date for the authority details', () => {
    const input = sampleStatementInput() as any;
    input.authority.verifiedOn = 'irgendwann';
    expect(() => parseStatementAnswers(input)).toThrow(/JJJJ-MM-TT/);
  });

  it('rejects a service description too short to explain anything', () => {
    const input = sampleStatementInput() as any;
    input.service.description = 'Wir verkaufen Schuhe.';
    expect(() => parseStatementAnswers(input)).toThrow(/80 Zeichen/);
  });

  it('requires at least one measure and one usage note', () => {
    const noMeasures = sampleStatementInput() as any;
    noMeasures.conformance.measures = [];
    expect(() => parseStatementAnswers(noMeasures)).toThrow(/Maßnahme/);

    const noNotes = sampleStatementInput() as any;
    noNotes.service.understandingNotes = [];
    expect(() => parseStatementAnswers(noNotes)).toThrow(/Erläuterung/);
  });

  it('rejects an invalid e-mail or URL rather than rendering it', () => {
    const badEmail = sampleStatementInput() as any;
    badEmail.feedback.email = 'keine-email';
    expect(() => parseStatementAnswers(badEmail)).toThrow(/E-Mail/);

    const badUrl = sampleStatementInput() as any;
    badUrl.authority.url = 'behoerde.example';
    expect(() => parseStatementAnswers(badUrl)).toThrow(/URL/);
  });
});

describe('statement warnings', () => {
  it('warns when the authority details have not been re-checked for over a year', () => {
    const answers = sampleStatement();
    const warnings = statementWarnings(answers, new Date('2028-01-01T00:00:00Z'));
    expect(warnings.join('\n')).toMatch(/Marktüberwachungsbehörde/);
    expect(warnings.join('\n')).toMatch(/älter als ein Jahr/);
  });

  it('warns while the wording has not been reviewed by a lawyer', () => {
    const answers = { ...sampleStatement() };
    answers.meta = { ...answers.meta, legalReviewConfirmed: false };
    expect(statementWarnings(answers).join('\n')).toMatch(/anwaltlich geprüft/);
  });

  it('warns when the status is not "vollständig" but no barriers are listed', () => {
    const answers = sampleStatement();
    answers.conformance = { ...answers.conformance, knownBarriers: [] };
    expect(statementWarnings(answers).join('\n')).toMatch(/keine bekannten Barrieren/);
  });

  it('is silent for a complete, current, reviewed statement', () => {
    expect(statementWarnings(sampleStatement(), new Date('2026-09-06T00:00:00Z'))).toEqual([]);
  });
});

describe('renderStatementHtml', () => {
  const { html, isDraft } = renderStatementHtml(sampleStatement());

  it('renders every element Anlage 3 requires, in order', () => {
    const order = [
      STATEMENT_SECTIONS.scope,
      STATEMENT_SECTIONS.requirements,
      STATEMENT_SECTIONS.description,
      STATEMENT_SECTIONS.usage,
      STATEMENT_SECTIONS.howMet,
      STATEMENT_SECTIONS.barriers,
      STATEMENT_SECTIONS.feedback,
      STATEMENT_SECTIONS.authority,
      STATEMENT_SECTIONS.meta,
    ];
    let cursor = -1;
    for (const id of order) {
      const at = html.indexOf(`id="${id}"`);
      expect(at, id).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('names the applicable requirements (element 1)', () => {
    expect(html).toContain('Barrierefreiheitsstärkungsgesetz');
    expect(html).toContain('EN 301 549');
    expect(html).toContain('WCAG 2.1 Stufe AA');
  });

  it('describes the service and how to use it (elements 2 and 3)', () => {
    expect(html).toContain('verkaufen wir Schuhe');
    expect(html).toContain('ohne Kundenkonto bestellen');
  });

  it('describes how the requirements are met (element 4)', () => {
    expect(html).toContain('mit der Tastatur erreichbar');
    expect(html).toContain('Kontrastverhältnis von mindestens 4,5:1');
  });

  it('gives the market surveillance authority with a checked-on date (element 5)', () => {
    expect(html).toContain('Marktüberwachungsbehörde');
    expect(html).toContain('behoerde.example');
    expect(html).toContain('zuletzt geprüft am 1. September 2026');
  });

  it('lists known barriers with reason and alternative', () => {
    expect(html).toContain('nicht tastaturbedienbar');
    expect(html).toContain('Drittanbieters');
    expect(html).toContain('Alle Filialadressen stehen als Text');
  });

  it('provides a working feedback channel', () => {
    expect(html).toContain('mailto:barrierefreiheit@musterschuhe.example');
    expect(html).toContain('innerhalb von 14 Tagen');
  });

  it('has no draft banner once the wording is confirmed as reviewed', () => {
    expect(isDraft).toBe(false);
    expect(html).not.toContain('ENTWURF');
  });

  it('stamps ENTWURF on every statement whose wording is not yet lawyer-reviewed', () => {
    const answers = sampleStatement();
    answers.meta = { ...answers.meta, legalReviewConfirmed: false };
    const draft = renderStatementHtml(answers);
    expect(draft.isDraft).toBe(true);
    expect(draft.html).toContain('ENTWURF — noch nicht veröffentlichen');
    expect(draft.html).toContain('anwaltlich geprüft');
  });

  it('escapes operator-supplied text', () => {
    const answers = sampleStatement();
    answers.provider = { ...answers.provider, name: '<img src=x onerror=alert(1)>' };
    const { html: escaped } = renderStatementHtml(answers);
    expect(escaped).not.toContain('<img src=x');
    expect(escaped).toContain('&lt;img src=x');
  });

  it('refuses to promise legal compliance, even if the operator writes it', () => {
    const answers = sampleStatement();
    answers.conformance = {
      ...answers.conformance,
      measures: ['Unser Shop ist damit rechtssicher und BFSG-konform.'],
    };
    expect(() => renderStatementHtml(answers)).toThrow(RdgBoundaryError);
  });
});

describe('statement URL and phone safety — findings from review', () => {
  it('rejects a javascript: URL, which zod .url() accepts as valid', () => {
    for (const field of ['service.url', 'authority.url', 'provider.website'] as const) {
      const input = sampleStatementInput() as any;
      const [group, key] = field.split('.') as [string, string];
      input[group][key] = 'javascript:alert(document.domain)';
      expect(() => parseStatementAnswers(input), field).toThrow(/http:\/\/ oder https:\/\//);
    }
  });

  it('rejects a data: URL in the feedback form link', () => {
    const input = sampleStatementInput() as any;
    input.feedback.formUrl = 'data:text/html,<script>alert(1)</script>';
    expect(() => parseStatementAnswers(input)).toThrow(/http:\/\/ oder https:\/\//);
  });

  it('rejects a phone number carrying anything but dialling characters', () => {
    const input = sampleStatementInput() as any;
    input.provider.phone = 'javascript:alert(1)';
    expect(() => parseStatementAnswers(input)).toThrow(/unzulässige Zeichen/);
  });

  it('emits no javascript: href even if a value slipped past validation', () => {
    // Defence in depth: the renderer sanitises the scheme independently of the
    // schema, because the document is published under the customer's origin.
    const answers = sampleStatement();
    answers.service = { ...answers.service, url: 'javascript:alert(1)' };
    const { html } = renderStatementHtml(answers);
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).toMatch(/href="#"/);
  });
});

describe('providerNameLine', () => {
  const provider = (name: string, legalForm?: string) => {
    const { legalForm: _ignored, ...rest } = sampleStatement().provider;
    return { ...rest, name, ...(legalForm ? { legalForm } : {}) } as never;
  };

  it('does not repeat a legal form the name already carries', () => {
    // Merchants type their registered name into the name field and the legal
    // form into the legal-form field, because both are asked for. Appending
    // unconditionally printed "Musterschuhe GmbH (GmbH)" at the top of a
    // legally required public statement.
    expect(providerNameLine(provider('Musterschuhe GmbH', 'GmbH'))).toBe('Musterschuhe GmbH');
    expect(providerNameLine(provider('Muster AG', 'AG'))).toBe('Muster AG');
    expect(providerNameLine(provider('Muster GmbH & Co. KG', 'GmbH & Co. KG'))).toBe(
      'Muster GmbH & Co. KG',
    );
    // A form ending in punctuation has no \b after it, which is most of the
    // German ones: e.K., e.V., mbH.
    expect(providerNameLine(provider('Muster e.K.', 'e.K.'))).toBe('Muster e.K.');
    expect(providerNameLine(provider('Musterverein e.V.', 'e.V.'))).toBe('Musterverein e.V.');
  });

  it('appends it when the name does not', () => {
    expect(providerNameLine(provider('Musterschuhe', 'GmbH'))).toBe('Musterschuhe (GmbH)');
  });

  it('omits it entirely when none was given', () => {
    expect(providerNameLine(provider('Musterschuhe'))).toBe('Musterschuhe');
  });

  it('does not match a legal form buried inside a word', () => {
    expect(providerNameLine(provider('AGENTUR Muster', 'AG'))).toBe('AGENTUR Muster (AG)');
    expect(providerNameLine(provider('Muster GmbH', 'mbH'))).toBe('Muster GmbH (mbH)');
  });

  it('handles legal forms full of regex metacharacters', () => {
    // These are why the function does not build a RegExp out of operator input.
    // The parentheses became a capture group, so the commonest German form was
    // duplicated by the very code written to stop that.
    expect(
      providerNameLine(provider('Muster UG (haftungsbeschränkt)', 'UG (haftungsbeschränkt)')),
    ).toBe('Muster UG (haftungsbeschränkt)');
    // `.` matched any character, so a name that merely looked similar swallowed
    // the legal form out of a legally required statement.
    expect(providerNameLine(provider('Muster eXK.', 'e.K.'))).toBe('Muster eXK. (e.K.)');
    expect(providerNameLine(provider('Muster e+K', 'e.K'))).toBe('Muster e+K (e.K)');
  });

  it('does not throw on operator input that is not a valid regular expression', () => {
    // `legalForm` is a free-text field with no syntax validation. An unbalanced
    // bracket used to throw SyntaxError, which the CLI does not catch — so
    // `bfsg statement` died with a raw Node stack trace.
    for (const form of ['UG (haftungsbeschränkt', 'Muster [', 'a\\', '*', '(?<']) {
      expect(() => providerNameLine(provider('Musterfirma', form)), form).not.toThrow();
      expect(providerNameLine(provider('Musterfirma', form))).toBe(`Musterfirma (${form})`);
    }
  });

  it('finds the form on a later occurrence when the first one is buried', () => {
    expect(providerNameLine(provider('AGENTUR Muster AG', 'AG'))).toBe('AGENTUR Muster AG');
  });
});
