import 'dotenv/config';
import { Command } from 'commander';
import { readdir, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from './pipeline.js';

function getErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

export async function discoverPdfFiles(inputDir: string): Promise<string[]> {
  let stats;
  try {
    stats = await stat(inputDir);
  } catch (error) {
    if (getErrorCode(error) !== 'ENOENT') {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to access input directory: ${inputDir}. ${detail}`);
    }

    throw new Error(`Input directory does not exist: ${inputDir}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`Input path is not a directory: ${inputDir}`);
  }

  const entries = await readdir(inputDir, { withFileTypes: true });
  const pdfPaths = entries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.pdf')
    .map((entry) => resolve(inputDir, entry.name));

  if (pdfPaths.length === 0) {
    throw new Error(`Warning: No PDF files found in directory: ${inputDir}`);
  }

  return pdfPaths;
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('lume-sebi')
    .description('Director Change ETL Pipeline — extracts board director events from regulatory PDFs')
    .requiredOption('--input <dir>', 'Input directory containing PDF files')
    .option('--output <file>', 'Output JSON file path', './output.json');

  program.parse();

  const opts = program.opts<{ input: string; output: string }>();

  const pdfPaths = await discoverPdfFiles(opts.input);
  console.log(`Found ${pdfPaths.length} PDF files in ${opts.input}`);

  await runPipeline(pdfPaths, opts.output);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
