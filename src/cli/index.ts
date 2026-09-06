#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Command, Option } from 'commander';
import { applyDotEnv, loadConfig, type ConfigOverrides } from '../config/config.ts';
import { describePolicy, PolicyError } from '../core/crawl/policy.ts';
import { shopIdFromUrl } from '../core/crawl/url.ts';
import { formatNumberDe } from '../core/report/format.ts';
import { conformanceBand } from '../core/findings/score.ts';
import type { ScanResult } from '../core/types.ts';
import { scanShop } from '../pipeline/scan.ts';
import {
  SCAN_JSON,
  SCREENSHOT_DIR,
  shopOutputDir,
  writeReport,
  type WriteReportOptions,
} from '../pipeline/report.ts';
import { loadStatementAnswers, writeStatement } from '../pipeline/statement.ts';
import { readBaseline, writeBaseline, writeRegressionReport } from '../pipeline/monitor.ts';
import { StatementValidationError } from '../core/statement/model.ts';
import { RdgBoundaryError } from '../core/report/rdg.ts';

/**
 * CLI for one operator running one consulting practice.
 *
 * There is deliberately no `send`, `mail` or `notify` command: the toolkit has
 * no outbound channel (§ 7 Abs. 2 UWG). Everything ends in a file the operator
 * decides what to do with.
 */

applyDotEnv('.env');

const program = new Command()
  .name('bfsg')
  .description(
    'Internes Werkzeug für WCAG-2.1-AA-Prüfungen deutscher Onlineshops. ' +
      'Kein Versand, keine Rechtsberatung — nur Prüfung, Bericht und Erklärung.',
  )
  .version('0.1.0');

const politenessOptions = <T extends Command>(command: T): T =>
  command
    .addOption(new Option('--max-pages <n>', 'Seitenlimit pro Shop').argParser(Number))
    .addOption(new Option('--min-interval <ms>', 'Mindestabstand pro Host in ms').argParser(Number))
    .option('--ignore-robots', 'robots.txt ignorieren (nur mit --override-reason)')
    .option('--override-reason <text>', 'Begründung für unhöfliche Einstellungen');

function overridesFrom(options: Record<string, unknown>): ConfigOverrides {
  return {
    maxPages: options['maxPages'] as number | undefined,
    minInterval: options['minInterval'] as number | undefined,
    ignoreRobots: options['ignoreRobots'] as boolean | undefined,
    overrideReason: options['overrideReason'] as string | undefined,
  };
}

const log = (message: string): void => console.log(message);

// --------------------------------------------------------------------------
politenessOptions(
  program.command('doctor').description('Konfiguration und Höflichkeitseinstellungen prüfen'),
  // doctor accepts the politeness flags too, so a planned override can be
  // validated before it is pointed at somebody's shop.
).action((options: Record<string, unknown>) => {
  const config = loadConfig(process.env, overridesFrom(options));
  console.log('Konfiguration in Ordnung.\n');
  console.log(describePolicy(config.policy));
  console.log(`Datenverzeichnis: ${config.dataDir}`);
  console.log(`Betreiber: ${config.operatorName ?? '(nicht gesetzt)'}`);
  if (config.policy.overrides.length === 0) {
    console.log('\nAlle Höflichkeitsregeln stehen auf den Voreinstellungen.');
  }
});

// --------------------------------------------------------------------------
politenessOptions(
  program
    .command('scan')
    .argument('<url>', 'Startadresse des Shops')
    .description('Shop crawlen, prüfen und das Ergebnis als scan.json speichern')
    .option('--out <dir>', 'Ausgabeverzeichnis (Standard: <Datenverzeichnis>/<Host>)')
    .option('--no-lighthouse', 'Lighthouse überspringen')
    .option('--report', 'Bericht direkt miterzeugen')
    .option('--pdf', 'PDF miterzeugen (impliziert --report)'),
).action(async (url: string, options: Record<string, unknown>) => {
  const config = loadConfig(process.env, overridesFrom(options));
  const outDir = (options['out'] as string) ?? shopOutputDir(config.dataDir, shopIdFromUrl(url));

  const { result, warnings } = await scanShop(url, {
    policy: config.policy,
    lighthouse: options['lighthouse'] !== false,
    screenshotDir: join(outDir, SCREENSHOT_DIR),
    log,
  });

  // The report is written either way — it costs nothing and having it next to
  // scan.json is what makes `rank` and a follow-up call useful. --report/--pdf
  // only decide whether a PDF is printed as well.
  const reportOptions: WriteReportOptions = {
    operatorName: config.operatorName,
    operatorContact: config.operatorEmail,
    pdf: Boolean(options['pdf']),
  };
  const written = await writeReport(outDir, result, reportOptions);

  console.log('');
  console.log(
    `Konformitätskennzahl: ${result.score.conformance}/100 — ${conformanceBand(result.score.conformance)}`,
  );
  console.log(`Prospect-Score:       ${result.score.prospect}/100`);
  console.log(
    `Befunde:              ${result.findings.length} (${result.score.totalInstances} Fundstellen)`,
  );
  console.log(
    `Aufwand geschätzt:    ${result.score.effortHours.low}–${result.score.effortHours.high} h`,
  );
  console.log(`Ausgabe:              ${outDir}`);
  for (const warning of warnings) console.log(`Hinweis: ${warning}`);
  console.log(`Bericht:              ${written.htmlPath}`);
  if (written.pdfPath) console.log(`PDF:                  ${written.pdfPath}`);
});

// --------------------------------------------------------------------------
program
  .command('report')
  .argument('<scan.json>', 'Pfad zu einer gespeicherten Prüfung')
  .description('Deutschen Prüfbericht aus einer gespeicherten Prüfung erzeugen')
  .option('--out <dir>', 'Ausgabeverzeichnis (Standard: Verzeichnis der scan.json)')
  .option('--shop-name <name>', 'Firmenname für die Kopfzeile')
  .option('--pdf', 'zusätzlich ein PDF erzeugen')
  .action(async (scanPath: string, options: Record<string, unknown>) => {
    const config = loadConfig(process.env);
    const scan = JSON.parse(await readFile(scanPath, 'utf8')) as ScanResult;
    const outDir = (options['out'] as string) ?? scanPath.replace(/[^/]+$/, '');
    const written = await writeReport(outDir, scan, {
      shopName: options['shopName'] as string | undefined,
      operatorName: config.operatorName,
      operatorContact: config.operatorEmail,
      pdf: Boolean(options['pdf']),
    });
    console.log(written.htmlPath);
    if (written.pdfPath) console.log(written.pdfPath);
  });

// --------------------------------------------------------------------------
program
  .command('statement')
  .argument('<antworten.json>', 'Angaben für die Erklärung (siehe data/erklaerung.beispiel.json)')
  .description('Barrierefreiheitserklärung nach Anlage 3 BFSGV erzeugen')
  .option('--out <dir>', 'Ausgabeverzeichnis', '.')
  .option('--pdf', 'zusätzlich ein PDF erzeugen')
  .action(async (answersPath: string, options: Record<string, unknown>) => {
    const answers = await loadStatementAnswers(answersPath);
    const written = await writeStatement(options['out'] as string, answers, {
      pdf: Boolean(options['pdf']),
    });
    console.log(written.htmlPath);
    if (written.pdfPath) console.log(written.pdfPath);
    if (written.isDraft) {
      console.log('\nACHTUNG: Ausgabe ist ein ENTWURF (meta.legalReviewConfirmed = false).');
    }
    for (const warning of written.warnings) console.log(`Hinweis: ${warning}`);
  });

// --------------------------------------------------------------------------
program
  .command('baseline')
  .argument('<scan.json>', 'Prüfung, die als Vergleichsgrundlage dienen soll')
  .description('Eine Prüfung als Vergleichsgrundlage für die Überwachung festlegen')
  .action(async (scanPath: string) => {
    const scan = JSON.parse(await readFile(scanPath, 'utf8')) as ScanResult;
    const outDir = scanPath.replace(/[^/]+$/, '') || '.';
    console.log(await writeBaseline(outDir, scan));
  });

// --------------------------------------------------------------------------
politenessOptions(
  program
    .command('monitor')
    .argument('<url>', 'Startadresse des Shops')
    .description('Erneut prüfen, mit der Vergleichsgrundlage abgleichen, Bericht schreiben')
    .option('--out <dir>', 'Ausgabeverzeichnis')
    .option('--no-lighthouse', 'Lighthouse überspringen')
    .option('--shop-name <name>', 'Firmenname für die Kopfzeile'),
).action(async (url: string, options: Record<string, unknown>) => {
  const config = loadConfig(process.env, overridesFrom(options));
  const outDir = (options['out'] as string) ?? shopOutputDir(config.dataDir, shopIdFromUrl(url));

  const baseline = await readBaseline(outDir);
  const { result } = await scanShop(url, {
    policy: config.policy,
    lighthouse: options['lighthouse'] !== false,
    screenshotDir: join(outDir, SCREENSHOT_DIR),
    log,
  });
  await writeReport(outDir, result, { operatorName: config.operatorName });

  const { diff, htmlPath } = await writeRegressionReport(outDir, baseline, result, {
    shopName: options['shopName'] as string | undefined,
    operatorName: config.operatorName,
  });

  console.log('');
  console.log(
    diff.hasRegression
      ? `VERSCHLECHTERUNG: ${diff.newFindings.length} neu, ${diff.worsened.length} zugenommen, Kennzahl ${diff.conformanceBefore} → ${diff.conformanceAfter}`
      : `Keine Verschlechterung. Kennzahl ${diff.conformanceBefore} → ${diff.conformanceAfter}`,
  );
  console.log(htmlPath);
  // A non-zero exit lets a cron job notice a regression without an email channel.
  if (diff.hasRegression) process.exitCode = 2;
});

// --------------------------------------------------------------------------
program
  .command('rank')
  .argument('[dir]', 'Verzeichnis mit Prüfungen', undefined)
  .description('Gespeicherte Prüfungen nach Prospect-Score sortiert auflisten')
  .action(async (dir: string | undefined) => {
    const config = loadConfig(process.env);
    const root = dir ?? config.dataDir;
    const entries = await readdir(root, { withFileTypes: true });

    const rows: { shop: string; prospect: number; conformance: number; effort: string }[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const scan = JSON.parse(
          await readFile(join(root, entry.name, SCAN_JSON), 'utf8'),
        ) as ScanResult;
        rows.push({
          shop: scan.shopId,
          prospect: scan.score.prospect,
          conformance: scan.score.conformance,
          effort: `${scan.score.effortHours.low}–${scan.score.effortHours.high} h`,
        });
      } catch {
        // A directory without a scan.json is simply not a scanned shop.
      }
    }

    rows.sort((a, b) => b.prospect - a.prospect);
    if (rows.length === 0) {
      console.log(`Keine Prüfungen in ${root} gefunden.`);
      return;
    }
    console.log('Prospect  Kennzahl  Aufwand      Shop');
    for (const row of rows) {
      console.log(
        `${formatNumberDe(row.prospect).padStart(8)}  ${formatNumberDe(row.conformance).padStart(8)}  ${row.effort.padEnd(11)}  ${row.shop}`,
      );
    }
  });

// --------------------------------------------------------------------------
async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (
      error instanceof PolicyError ||
      error instanceof StatementValidationError ||
      error instanceof RdgBoundaryError
    ) {
      console.error(`\n${error.name}: ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

await main();
