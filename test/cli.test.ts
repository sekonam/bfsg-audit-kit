import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { startFixtureServer, type FixtureServer } from './helpers/server.ts';

/**
 * The CLI is exercised as a subprocess against the LOCAL fixture shop, because
 * that is how it is actually used. In particular this test pins the behaviour
 * that matters most operationally: without BFSG_CONTACT_URL the tool refuses to
 * do anything at all.
 */

const run = promisify(execFile);
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO_ROOT, 'src', 'cli', 'index.ts');

const POLITE_TEST_ENV = {
  BFSG_CONTACT_URL: 'https://beispiel.de/bot',
  BFSG_OPERATOR_NAME: 'Prüfstelle Muster',
  BFSG_MIN_REQUEST_INTERVAL_MS: '0',
  BFSG_POLITENESS_OVERRIDE_REASON: 'Lokale Test-Fixtures auf 127.0.0.1, kein fremder Server',
};

async function cli(
  args: string[],
  env: Record<string, string> = POLITE_TEST_ENV,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await run('node', ['--experimental-strip-types', CLI, ...args], {
      cwd: REPO_ROOT,
      env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ...env },
      maxBuffer: 20 * 1024 * 1024,
    });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}

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
      '--report',
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
