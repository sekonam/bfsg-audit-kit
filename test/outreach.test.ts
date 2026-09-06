import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLegalClaims } from '../src/core/report/rdg.ts';

/**
 * The outreach drafts are checked by the same rule as the generated documents.
 *
 * They are prose, so the check has to separate two kinds of text:
 *   - what would be SAID to a recipient — block quotes and fenced letter text;
 *   - the guidance ABOUT what may not be said, which necessarily names the
 *     forbidden words in order to forbid them.
 *
 * Only the first kind is scanned. Guidance lines are the bullet points and any
 * line carrying the ⚠️ marker.
 */

const OUTREACH_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'outreach');

/** Lines that would actually be said or sent: block quotes and fenced blocks. */
function customerFacingText(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (!line.startsWith('>')) continue;
    // Guidance, not speech: the warning block and its bullet list.
    if (line.includes('⚠️')) continue;
    if (/^>\s*[-*]/.test(line)) continue;
    if (/^>\s{2,}/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n');
}

async function outreachFiles(): Promise<string[]> {
  const entries = await readdir(OUTREACH_DIR);
  return entries.filter((name) => name.endsWith('.md'));
}

describe('outreach drafts', () => {
  it('ships a telephone script and a postal letter, and nothing else', async () => {
    expect((await outreachFiles()).sort()).toEqual(['brief-vorlage.md', 'telefon-skript.md']);
  });

  it('is marked as a draft for human review at the very top of each file', async () => {
    for (const name of await outreachFiles()) {
      const text = await readFile(join(OUTREACH_DIR, name), 'utf8');
      const head = text.slice(0, 600);
      expect(head, name).toMatch(/ENTWURF/);
      expect(head, name).toMatch(/PRÜFEN LASSEN|MENSCHLICHE PRÜFUNG/);
    }
  });

  it('says nothing to a recipient that crosses the RDG boundary', async () => {
    for (const name of await outreachFiles()) {
      const text = await readFile(join(OUTREACH_DIR, name), 'utf8');
      const spoken = customerFacingText(text);
      expect(spoken.length, `${name}: no customer-facing text found`).toBeGreaterThan(400);
      const claims = findLegalClaims(spoken);
      expect(
        claims,
        `${name} would say: ${claims.map((c) => `"${c.text}" (${c.why})`).join(', ')}`,
      ).toEqual([]);
    }
  });

  it('states the no-cold-email rule in both drafts', async () => {
    for (const name of await outreachFiles()) {
      const text = await readFile(join(OUTREACH_DIR, name), 'utf8');
      expect(text, name).toMatch(/§ 7 Abs\. 2 UWG/);
      expect(text.replace(/\s+/g, ' '), name).toMatch(
        /keine B2B-Ausnahme|kennt keine B2B-Ausnahme/,
      );
    }
  });

  it('carries the Art. 14 GDPR notice, which outbound plans usually skip', async () => {
    for (const name of await outreachFiles()) {
      const text = await readFile(join(OUTREACH_DIR, name), 'utf8');
      expect(text, name).toMatch(/Art\. 14 DSGVO/);
    }
    const letter = await readFile(join(OUTREACH_DIR, 'brief-vorlage.md'), 'utf8');
    expect(letter).toMatch(/Art\. 6 Abs\. 1 lit\. f DSGVO/);
    expect(letter).toMatch(/Art\. 21 DSGVO/);
  });

  it('points the operator away from the competitor directory', async () => {
    for (const name of await outreachFiles()) {
      const text = await readFile(join(OUTREACH_DIR, name), 'utf8');
      expect(text, name).toMatch(/barrierefreie-agenturen\.de/);
      expect(text.replace(/\s+/g, ' '), name).toMatch(/Wettbewerber, keine Kunden/);
    }
  });

  it('tells the operator to honour an objection immediately', async () => {
    const script = await readFile(join(OUTREACH_DIR, 'telefon-skript.md'), 'utf8');
    expect(script.replace(/\s+/g, ' ')).toMatch(/Sperrliste/);
    expect(script.replace(/\s+/g, ' ')).toMatch(/Kein zweiter Versuch/);
  });
});

describe('GDPR paperwork', () => {
  it('documents the Art. 30 record and the Art. 6(1)(f) balancing test', async () => {
    const docs = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
    const art30 = await readFile(join(docs, 'GDPR-ART30.md'), 'utf8');
    expect(art30).toMatch(/Art\. 6 Abs\. 1 lit\. f DSGVO/);
    expect(art30).toMatch(/Interessenabwägung/);
    expect(art30).toMatch(/Löschfristen/);
    expect(art30).toMatch(/keine Funktion zum Versenden von E-Mails/);

    const art14 = await readFile(join(docs, 'GDPR-ART14-NOTICE.md'), 'utf8');
    expect(art14).toMatch(/Art\. 14 DSGVO/);
    expect(art14).toMatch(/einen Monat/);
    expect(art14).toMatch(/Widerspruch/);
  });
});
