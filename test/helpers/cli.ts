import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Run the CLI the way an operator does: as a subprocess, from source.
 *
 * Extracted so the command-level tests and the end-to-end operator run drive
 * exactly the same entry point. Calling the pipeline functions in-process would
 * skip argument parsing, config loading, error mapping and exit codes — which
 * is where several of this tool's operational behaviours live.
 */

const run = promisify(execFile);

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CLI_ENTRY = join(REPO_ROOT, 'src', 'cli', 'index.ts');

/**
 * Environment for tests. The politeness override is legitimate here and only
 * here: the target is a fixture server on 127.0.0.1, so a 2 s delay between
 * requests would only slow down the test suite, never a stranger's server.
 */
export const POLITE_TEST_ENV: Readonly<Record<string, string>> = {
  BFSG_CONTACT_URL: 'https://beispiel.de/bot',
  BFSG_OPERATOR_NAME: 'Prüfstelle Muster',
  BFSG_MIN_REQUEST_INTERVAL_MS: '0',
  BFSG_POLITENESS_OVERRIDE_REASON: 'Lokale Test-Fixtures auf 127.0.0.1, kein fremder Server',
};

export interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

export async function runCli(
  args: readonly string[],
  env: Readonly<Record<string, string>> = POLITE_TEST_ENV,
): Promise<CliResult> {
  try {
    const { stdout, stderr } = await run(
      'node',
      ['--experimental-strip-types', CLI_ENTRY, ...args],
      {
        cwd: REPO_ROOT,
        env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ...env },
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}
