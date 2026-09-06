import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseStatementAnswers, type StatementAnswers } from '../core/statement/model.ts';
import { renderStatementHtml } from '../core/statement/render.ts';
import { renderPdfFromFile } from '../adapters/pdf.ts';

export const STATEMENT_HTML = 'barrierefreiheitserklaerung.html';
export const STATEMENT_PDF = 'barrierefreiheitserklaerung.pdf';

export interface WrittenStatement {
  readonly htmlPath: string;
  readonly pdfPath?: string;
  readonly warnings: readonly string[];
  readonly isDraft: boolean;
}

export async function loadStatementAnswers(path: string): Promise<StatementAnswers> {
  return parseStatementAnswers(JSON.parse(await readFile(path, 'utf8')));
}

export async function writeStatement(
  outDir: string,
  answers: StatementAnswers,
  options: { pdf?: boolean } = {},
): Promise<WrittenStatement> {
  await mkdir(outDir, { recursive: true });
  const { html, warnings, isDraft } = renderStatementHtml(answers);

  const htmlPath = join(outDir, STATEMENT_HTML);
  await writeFile(htmlPath, html, 'utf8');
  if (!options.pdf) return { htmlPath, warnings, isDraft };

  const pdfPath = join(outDir, STATEMENT_PDF);
  await renderPdfFromFile(htmlPath, pdfPath, {
    headerText: `Erklärung zur Barrierefreiheit — ${answers.service.name}`,
  });
  return { htmlPath, pdfPath, warnings, isDraft };
}
