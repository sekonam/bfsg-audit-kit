import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startFixtureServer, type FixtureServer } from './helpers/server.ts';
import { REPO_ROOT, runCli } from './helpers/cli.ts';

/**
 * The CLI is exercised as a subprocess against the LOCAL fixture shop, because
 * that is how it is actually used. In particular this test pins the behaviour
 * that matters most operationally: without BFSG_CONTACT_URL the tool refuses to
 * do anything at all.
 *
 * This file covers the commands one at a time. The full operator sequence,
 * and the FILES it leaves behind, are covered by `operator-e2e.test.ts`.
 */

const cli = runCli;

let server: FixtureServer;
let outDir: string;

beforeAll(async () => {
  server = await startFixtureServer(join(REPO_ROOT, 'test', 'fixtures', 'shop'));
  outDir = await mkdtemp(join(tmpdir(), 'bfsg-cli-'));
}, 60_000);

afterAll(async () => {
  await server?.close();
  await rm(outDir, { recursive: true, force: true });
});

describe('bfsg doctor', () => {
  it('refuses to run without a contact URL', async () => {
    const result = await cli(['doctor'], {});
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('PolicyError');
    expect(result.stderr).toContain('BFSG_CONTACT_URL is required');
  });

  it('prints the politeness settings, including any deviation from the defaults', async () => {
    const result = await cli(['doctor']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('BfsgAuditBot/0.1 (+https://beispiel.de/bot)');
    expect(result.stdout).toContain('robots.txt: wird befolgt');
    expect(result.stdout).toContain('ABWEICHUNGEN');
    expect(result.stdout).toContain('Lokale Test-Fixtures');
  });

  it('refuses to ignore robots.txt without a stated reason', async () => {
    const result = await cli(['doctor', '--ignore-robots'], {
      BFSG_CONTACT_URL: 'https://beispiel.de/bot',
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('less polite than the default');
  });
});

describe('bfsg scan → report → baseline → monitor → rank', () => {
  it('scans the fixture shop and writes a German report', async () => {
    const result = await cli([
      'scan',
      server.origin,
      '--out',
      join(outDir, 'muster'),
      '--no-lighthouse',
    ]);
    expect(result.stderr, result.stderr).not.toContain('Error');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Konformitätskennzahl');
    expect(result.stdout).toContain('Prospect-Score');

    for (const file of ['scan.json', 'bericht.html']) {
      expect((await stat(join(outDir, 'muster', file))).size, file).toBeGreaterThan(0);
    }
  }, 180_000);

  it('stores a baseline and reports no regression when nothing changed', async () => {
    const setBaseline = await cli(['baseline', join(outDir, 'muster', 'scan.json')]);
    expect(setBaseline.code).toBe(0);
    expect((await stat(join(outDir, 'muster', 'baseline.json'))).size).toBeGreaterThan(0);

    const monitor = await cli([
      'monitor',
      server.origin,
      '--out',
      join(outDir, 'muster'),
      '--no-lighthouse',
    ]);
    expect(monitor.code).toBe(0);
    expect(monitor.stdout).toContain('Keine Verschlechterung');
    expect((await stat(join(outDir, 'muster', 'ueberwachungsbericht.html'))).size).toBeGreaterThan(
      0,
    );
  }, 240_000);

  it('ranks stored scans by prospect score', async () => {
    const result = await cli(['rank', outDir]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Prospect');
    expect(result.stdout).toMatch(/127\.0\.0\.1|muster/);
  });
});

describe('bfsg report and monitor guard their inputs', () => {
  it('rejects a scan.json that is not a scan result, instead of rendering it', async () => {
    const bad = join(outDir, 'kaputt.json');
    await writeFile(bad, JSON.stringify({ hello: 'world' }), 'utf8');
    const result = await cli(['report', bad, '--out', outDir]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('ScanFileError');
    expect(result.stderr).toContain('origin fehlt');
  });

  it('explains what to do when there is no baseline yet', async () => {
    const empty = join(outDir, 'leer');
    await mkdir(empty, { recursive: true });
    const result = await cli(['monitor', server.origin, '--out', empty, '--no-lighthouse']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('ScanFileError');
    expect(result.stderr).toContain('bfsg scan');
  });
});

describe('bfsg statement', () => {
  it('rejects the shipped template because it is still full of placeholders', async () => {
    const result = await cli(['statement', 'data/erklaerung.beispiel.json', '--out', outDir]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('StatementValidationError');
    expect(result.stderr).toContain('Platzhalter');
  });
});

describe('the CLI has no way to send anything', () => {
  it('offers no mail, send or notify command', async () => {
    const help = await cli(['--help']);
    expect(help.stdout.toLowerCase()).not.toMatch(/\b(mail|send|versenden|notify)\b/);
    // commander hard-wraps the description, so compare against collapsed text.
    expect(help.stdout.replace(/\s+/g, ' ')).toContain('Kein Versand, keine Rechtsberatung');
  });
});
