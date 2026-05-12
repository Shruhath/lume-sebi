import { basename } from 'node:path';
import pLimit from 'p-limit';
import { writePipelineOutput } from './lib/file-system.js';
import { extractDirectorChanges } from './lib/llm-client.js';
import { parsePdfToText } from './lib/pdf-parser.js';
import type { DirectorExtraction, PipelineOutput } from './schemas/director-schema.js';

const CONCURRENCY_LIMIT = 5;

export type ProcessSinglePdfResult =
  | { success: true; filename: string; extractions: DirectorExtraction[] }
  | { success: false; filename: string; error: string };

export async function processSinglePdf(
  pdfPath: string,
  limit?: ReturnType<typeof pLimit>,
): Promise<ProcessSinglePdfResult> {
  const filename = basename(pdfPath);

  try {
    const text = await parsePdfToText(pdfPath);
    const changes = limit
      ? await limit(() => extractDirectorChanges(text))
      : await extractDirectorChanges(text);

    return {
      success: true,
      filename,
      extractions: changes.map((change) => ({
        ...change,
        source_filename: filename,
      })),
    };
  } catch (error) {
    return {
      success: false,
      filename,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runPipeline(pdfPaths: string[], outputFile: string): Promise<void> {
  const limit = pLimit(CONCURRENCY_LIMIT);

  const results = await Promise.all(
    pdfPaths.map((pdfPath) => processSinglePdf(pdfPath, limit)),
  );

  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);

  const allExtractions = successes.flatMap((r) => r.extractions || []);

  const output: PipelineOutput = {
    extractions: allExtractions,
    summary: {
      total_documents_processed: pdfPaths.length,
      director_change_documents_identified: successes.filter(
        (r) => (r.extractions?.length ?? 0) > 0,
      ).length,
      total_director_changes_extracted: allExtractions.length,
      documents_that_failed_processing: failures.map((f) => f.filename),
    },
  };

  try {
    await writePipelineOutput(output, outputFile);
  } catch (error) {
    console.error(`CRITICAL: Failed to write pipeline output to ${outputFile}:`, error);
    throw error;
  }

  console.log(
    `Pipeline complete: ${pdfPaths.length} files processed (${failures.length} failed), ${allExtractions.length} extractions written to ${outputFile}`,
  );
}
