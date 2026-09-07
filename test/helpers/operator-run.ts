import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { REPORT_HTML, REPORT_PDF, SCAN_JSON, SCREENSHOT_DIR } from '../../src/pipeline/report.ts';
import { STATEMENT_HTML, STATEMENT_PDF } from '../../src/pipeline/statement.ts';
import { BASELINE_JSON, DIFF_JSON, REGRESSION_HTML } from '../../src/pipeline/monitor.ts';
import { startFixtureServer, type FixtureServer } from './server.ts';
import { REPO_ROOT, runCli, type CliResult } from './cli.ts';
import { sampleStatementInput } from './sample-statement.ts';

/**
 * One complete operator run against the local fixture shop.
 *
 * This is the shape of a real engagement, in order:
 *
 *   scan → report --pdf → statement --pdf → statement (ENTWURF) → baseline → monitor
 *
 * It exists because the rest of the suite audits the RETURN VALUE of render
 * functions. Between a correct render function and a correct deliverable sit
 * file writing, screenshot embedding, relative paths, PDF printing and the
 * ENTWURF gate — none of which a string-level test can see. Everything this
 * helper produces is a file on disk, exactly as the customer receives it.
 *
 * Shared with `scripts/demo-screens.ts` so the screenshots a human looks at are
 * of the same artefacts the test suite asserts on, and not of a second,
 * conveniently different code path.
 */

export interface OperatorRun {
  /** Root working directory; everything below lives inside it. */
  readonly root: string;
  /** Origin of the local fixture shop. Always 127.0.0.1. */
  readonly origin: string;
  readonly shopDir: string;
  readonly reportHtml: string;
  readonly reportPdf: string;
  readonly scanJson: string;
  readonly screenshotDir: string;
  readonly baselineJson: string;
  readonly regressionHtml: string;
  readonly diffJson: string;
  /** Statement with `legalReviewConfirmed: true` — no ENTWURF stamp expected. */
  readonly statementHtml: string;
  readonly statementPdf: string;
  /** Statement with `legalReviewConfirmed: false` — ENTWURF stamp expected. */
  readonly draftStatementHtml: string;
  /** Every CLI invocation, in order, for assertions on exit codes and output. */
  readonly steps: readonly { readonly command: string; readonly result: CliResult }[];
  close(): Promise<void>;
}

const SHOP_DIR = 'muster-shop';
const STATEMENT_DIR = 'erklaerung';
const DRAFT_DIR = 'erklaerung-entwurf';

export interface OperatorRunOptions {
  /** Where to work. A temporary directory is created when omitted. */
  readonly root?: string;
  /** Lighthouse is off by default: it triples the run time and adds no file. */
  readonly lighthouse?: boolean;
  readonly shopName?: string;
}

export async function runOperatorFlow(options: OperatorRunOptions = {}): Promise<OperatorRun> {
  const server: FixtureServer = await startFixtureServer(
    join(REPO_ROOT, 'test', 'fixtures', 'shop'),
  );
  const root = options.root ?? (await mkdtemp(join(tmpdir(), 'bfsg-e2e-')));
  await mkdir(root, { recursive: true });

  const shopDir = join(root, SHOP_DIR);
  const statementDir = join(root, STATEMENT_DIR);
  const draftDir = join(root, DRAFT_DIR);
  const shopName = options.shopName ?? 'Musterschuhe GmbH';
  const lighthouseFlag = options.lighthouse ? [] : ['--no-lighthouse'];

  const steps: { command: string; result: CliResult }[] = [];
  const step = async (args: readonly string[]): Promise<CliResult> => {
    const result = await runCli(args);
    steps.push({ command: `bfsg ${args.join(' ')}`, result });
    return result;
  };

  try {
    // The operator fills in the answers once per customer; the shipped template
    // is placeholders only and the schema rejects it, so the run writes a
    // filled copy of the same shape.
    const answers = sampleStatementInput() as Record<string, unknown>;
    const answersPath = join(root, 'erklaerung.json');
    const draftAnswersPath = join(root, 'erklaerung-entwurf.json');
    await writeFile(answersPath, JSON.stringify(answers, null, 2), 'utf8');
    await writeFile(
      draftAnswersPath,
      JSON.stringify(
        {
          ...answers,
          meta: { ...(answers['meta'] as Record<string, unknown>), legalReviewConfirmed: false },
        },
        null,
        2,
      ),
      'utf8',
    );

    await step(['scan', server.origin, '--out', shopDir, ...lighthouseFlag]);
    await step([
      'report',
      join(shopDir, SCAN_JSON),
      '--out',
      shopDir,
      '--shop-name',
      shopName,
      '--pdf',
    ]);
    await step(['statement', answersPath, '--out', statementDir, '--pdf']);
    await step(['statement', draftAnswersPath, '--out', draftDir]);
    await step(['baseline', join(shopDir, SCAN_JSON)]);
    await step([
      'monitor',
      server.origin,
      '--out',
      shopDir,
      '--shop-name',
      shopName,
      ...lighthouseFlag,
    ]);

    return {
      root,
      origin: server.origin,
      shopDir,
      reportHtml: join(shopDir, REPORT_HTML),
      reportPdf: join(shopDir, REPORT_PDF),
      scanJson: join(shopDir, SCAN_JSON),
      screenshotDir: join(shopDir, SCREENSHOT_DIR),
      baselineJson: join(shopDir, BASELINE_JSON),
      regressionHtml: join(shopDir, REGRESSION_HTML),
      diffJson: join(shopDir, DIFF_JSON),
      statementHtml: join(statementDir, STATEMENT_HTML),
      statementPdf: join(statementDir, STATEMENT_PDF),
      draftStatementHtml: join(draftDir, STATEMENT_HTML),
      steps,
      close: async () => {
        await server.close();
        if (!options.root) await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await server.close();
    throw error;
  }
}
