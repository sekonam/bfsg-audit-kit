import { describe, expect, it } from 'vitest';
import { renderReportHtml } from '../src/core/report/report.ts';
import {
  assertNoLegalClaims,
  findLegalClaims,
  RdgBoundaryError,
  SCOPE_NOTE_DE,
} from '../src/core/report/rdg.ts';
import { escapeHtml, formatDateTimeDe, formatNumberDe, plural } from '../src/core/report/format.ts';
import { sampleScan } from './helpers/sample-scan.ts';

/** Collapse whitespace so assertions survive template-literal line wrapping. */
const collapse = (html: string): string => html.replace(/\s+/g, ' ');

describe('RDG boundary', () => {
  it('rejects threats of legal consequences', () => {
    for (const text of [
      'Ihnen droht ein Bußgeld von bis zu 100.000 Euro.',
      'Sie riskieren eine Abmahnung durch Mitbewerber.',
      'Ihr Shop ist rechtswidrig.',
      'Sie sind dafür haftbar.',
      'Es drohen Sanktionen der Marktüberwachung.',
    ]) {
      expect(findLegalClaims(text), text).not.toEqual([]);
      expect(() => assertNoLegalClaims(text)).toThrow(RdgBoundaryError);
    }
  });

  it('rejects guarantees of legal compliance just as firmly', () => {
    for (const text of [
      'Damit ist Ihr Shop rechtssicher.',
      'Wir machen Ihren Shop BFSG-konform.',
      'Das Ergebnis ist gesetzeskonform.',
    ]) {
      expect(findLegalClaims(text), text).not.toEqual([]);
    }
  });

  it('accepts factual technical statements', () => {
    for (const text of [
      'Das Eingabefeld hat keine programmatisch verknüpfte Beschriftung.',
      'Der Kontrast beträgt 2,8:1 und unterschreitet damit den geforderten Wert von 4,5:1.',
      'Die Prüfung erfolgte gegen WCAG 2.1 Stufe AA und EN 301 549.',
    ]) {
      expect(findLegalClaims(text), text).toEqual([]);
    }
  });

  it('names what was found and why it is forbidden', () => {
    try {
      assertNoLegalClaims('Es droht ein Bußgeld.', 'Der Testtext');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RdgBoundaryError);
      expect((error as Error).message).toContain('Der Testtext');
      expect((error as Error).message).toContain('Bußgeld');
      expect((error as Error).message).toContain('rechtliche Bewertung');
    }
  });

  it('has a scope note that itself stays inside the boundary', () => {
    const text = `${SCOPE_NOTE_DE.heading} ${SCOPE_NOTE_DE.paragraphs.join(' ')}`;
    expect(findLegalClaims(text)).toEqual([]);
    expect(text).toContain('keine rechtliche Bewertung');
    expect(text).toContain('Rechtsdienstleistungsgesetz');
    expect(text).toContain('57 %');
  });
});

describe('formatting helpers', () => {
  it('escapes every HTML metacharacter', () => {
    expect(escapeHtml('<script>"x" & \'y\'</script>')).toBe(
      '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;',
    );
  });

  it('formats German numbers and dates', () => {
    expect(formatNumberDe(1234.5, 1)).toBe('1.234,5');
    expect(formatDateTimeDe('2026-09-06T08:02:00.000Z')).toMatch(/^06\.09\.2026, \d{2}:\d{2} Uhr$/);
    expect(formatDateTimeDe('kein datum')).toBe('kein datum');
  });

  it('pluralises German nouns', () => {
    expect(plural(1, 'Seite', 'Seiten')).toBe('1 Seite');
    expect(plural(4, 'Seite', 'Seiten')).toBe('4 Seiten');
  });
});

describe('renderReportHtml', () => {
  const html = renderReportHtml(sampleScan(), {
    shopName: 'Musterschuhe GmbH',
    operatorName: 'Prüfstelle Muster',
    operatorContact: 'kontakt@beispiel.de',
  });

  it('is a German document with a unique title and one main landmark', () => {
    expect(html).toContain('<html lang="de">');
    expect(html).toContain('<title>Barrierefreiheits-Prüfbericht — Musterschuhe GmbH</title>');
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain('id="inhalt"');
    expect(html).toContain('Zum Inhalt springen');
  });

  it('contains no external resource references — it must render offline', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/https?:\/\/(fonts|cdn|unpkg|cdnjs)\./i);
  });

  it('renders the required sections of the service specification', () => {
    for (const heading of [
      'Zusammenfassung',
      'Die fünf kritischen Nutzungswege',
      'Befunde nach Erfolgskriterium',
      'Was diese Prüfung nicht leisten kann',
      'Aufwandsschätzung',
      'Methodik',
      SCOPE_NOTE_DE.heading,
    ]) {
      expect(html, heading).toContain(heading);
    }
  });

  it('groups findings by success criterion with its German title and EN clause', () => {
    expect(html).toContain('3.3.2 Beschriftungen (Labels) oder Anweisungen');
    expect(html).toContain('EN 301 549 9.3.3.2');
    expect(html).toContain('1.4.3 Kontrast (Minimum)');
  });

  it('separates best-practice hints from AA conformance findings', () => {
    expect(html).toContain('Weitere Hinweise (außerhalb WCAG 2.1 AA)');
    expect(html).toContain('kein Erfolgskriterium der Stufe AA');
  });

  it('escapes finding text rather than injecting it as markup', () => {
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('states the scope note in full, verbatim', () => {
    for (const paragraph of SCOPE_NOTE_DE.paragraphs) {
      expect(html).toContain(escapeHtml(paragraph));
    }
  });

  it('says the score is not a conformance certificate', () => {
    expect(html).toContain('Priorisierungshilfe, kein Konformitätsnachweis');
    expect(html).toContain('bleibt die manuelle Prüfung erforderlich');
  });

  it('reports the effort estimate as a range with a caveat', () => {
    expect(html).toMatch(/Stunden<\/strong>/);
    expect(html).toContain('Sie ist kein Angebot');
  });

  it('documents the crawl politeness in the methodology section', () => {
    expect(html).toContain('robots.txt');
    expect(html).toContain('User-Agent');
    // Template literals wrap, so assert against the collapsed text.
    expect(collapse(html)).toContain('ohne Formulareingaben und ohne Bestellvorgang');
    expect(collapse(html)).toContain('zwischen zwei Abrufen lag mindestens eine Wartezeit');
  });

  it('lists journeys the crawl could not reach instead of silently omitting them', () => {
    const scan = sampleScan();
    const partial = {
      ...scan,
      crawl: { ...scan.crawl, pages: scan.crawl.pages.filter((p) => p.journey !== 'checkout') },
    };
    const partialHtml = renderReportHtml(partial);
    expect(partialHtml).toContain('Nicht erreicht');
    expect(partialHtml).toContain('Kasse / Bestellabschluss');
  });

  it('handles a clean shop without claiming it is accessible', () => {
    const clean = renderReportHtml(sampleScan({ findings: [] }));
    expect(clean).toContain('keine automatisch erkennbaren Verstöße');
    expect(clean).toContain('bleibt die manuelle Prüfung erforderlich');
  });

  it('refuses to render a report containing a legal claim', () => {
    const scan = sampleScan();
    const poisoned = {
      ...scan,
      findings: [
        {
          ...scan.findings[0]!,
          remediationDe: 'Beheben Sie das, sonst droht ein Bußgeld.',
        },
      ],
    };
    expect(() => renderReportHtml(poisoned)).toThrow(RdgBoundaryError);
  });
});

/**
 * Regression tests from the independent code review. Each reproduced a real
 * defect before the fix.
 */
describe('escaping and URL safety — findings from review', () => {
  it('never emits a javascript: or data: href, however the value arrived', () => {
    const scan = sampleScan();
    const poisoned = {
      ...scan,
      origin: 'javascript:alert(document.domain)',
      findings: [
        {
          ...scan.findings[0]!,
          helpUrl: 'javascript:alert(1)',
          instances: [
            {
              url: 'data:text/html,<script>alert(1)</script>',
              journey: 'home' as const,
              selector: '#a',
              snippet: '<input>',
            },
          ],
        },
      ],
    };
    const html = renderReportHtml(poisoned);
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toMatch(/href="data:/i);
    // The value is still shown as text so the operator can see what was in the
    // scan; it is only the attribute that is made inert.
    expect(html).toContain('javascript:alert(document.domain)');
    expect(html).toMatch(/href="#"/);
  });

  it('does not fall over on a scan.json with an unparseable origin', () => {
    const scan = sampleScan();
    expect(() => renderReportHtml({ ...scan, origin: 'nicht-mal-eine-url' })).not.toThrow();
  });

  it('renders a report for a shop whose own markup contains a legal word', () => {
    // "Haftung" is an ordinary German footer link. Checking the raw HTML made
    // such a shop unreportable: the scan exited 1 with no report at all.
    const scan = sampleScan();
    const withFooterLink = {
      ...scan,
      findings: [
        {
          ...scan.findings[0]!,
          instances: [
            {
              url: 'https://muster-shop.de/',
              journey: 'home' as const,
              selector: 'footer a',
              snippet: '<a href="/haftung">Haftung</a>',
            },
          ],
        },
      ],
    };
    expect(() => renderReportHtml(withFooterLink)).not.toThrow();
    expect(renderReportHtml(withFooterLink)).toContain('/haftung');
  });

  it('still refuses a legal claim in text this codebase authored', () => {
    const scan = sampleScan();
    expect(() =>
      renderReportHtml({
        ...scan,
        findings: [{ ...scan.findings[0]!, remediationDe: 'Sonst droht ein Bußgeld.' }],
      }),
    ).toThrow(RdgBoundaryError);
  });

  it('keeps the scorecard and the severity table telling the same story', () => {
    const scan = sampleScan();
    const html = renderReportHtml(scan);
    const instances = scan.score.bySeverity.reduce((n, b) => n + b.instances, 0);
    expect(scan.score.totalInstances).toBe(instances);
    expect(html).toContain(`${instances}</span>`);
  });
});

describe('scrollable tables are reachable and named', () => {
  const html = renderReportHtml(sampleScan());

  it('makes every scroll container keyboard-focusable and labelled', () => {
    // A container with overflow-x: auto that no keyboard user can focus is
    // unreachable content (WCAG 2.1.1). The report failed axe's
    // `scrollable-region-focusable` at 375 px while passing at 1280 px, because
    // the tables only overflow on a phone and every a11y test ran at desktop
    // width. Pinned here so the wrapper cannot be re-introduced bare.
    const wrappers = html.match(/<div class="table-scroll"[^>]*>/g) ?? [];
    expect(wrappers.length).toBeGreaterThan(2);
    for (const wrapper of wrappers) {
      expect(wrapper, wrapper).toContain('tabindex="0"');
      expect(wrapper, wrapper).toContain('role="region"');
      expect(wrapper, wrapper).toMatch(/aria-label="[^"]+"/);
    }
  });
});

describe('robots-disallowed addresses never reach the report', () => {
  it('reports the count and not the list', () => {
    const html = collapse(
      renderReportHtml(
        sampleScan({
          crawl: {
            ...sampleScan().crawl,
            robotsExcluded: 3,
            skipped: [{ url: 'https://muster-shop.de/intern/admin', reason: 'nur zur Sicherheit' }],
          },
        }),
      ),
    );
    expect(html).toContain('3 Adressen wurden');
    expect(html).toContain('durch <code>robots.txt</code> ausgeschlossen');
    expect(html).toContain('sind hier bewusst nicht aufgeführt');
  });

  it('says nothing about exclusions when there were none', () => {
    const html = collapse(
      renderReportHtml(sampleScan({ crawl: { ...sampleScan().crawl, robotsExcluded: 0 } })),
    );
    expect(html).not.toContain('bewusst nicht aufgeführt');
  });

  it('uses the singular for exactly one', () => {
    const html = collapse(
      renderReportHtml(sampleScan({ crawl: { ...sampleScan().crawl, robotsExcluded: 1 } })),
    );
    expect(html).toContain('Eine Adresse wurde');
  });
});
