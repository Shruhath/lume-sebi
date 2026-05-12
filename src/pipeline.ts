import { basename } from 'node:path';
import pLimit from 'p-limit';
import { writePipelineOutput } from './lib/file-system.js';
import { extractDirectorChanges } from './lib/llm-client.js';
import { parsePdfToText } from './lib/pdf-parser.js';
import type { DirectorExtraction, PipelineOutput } from './schemas/director-schema.js';

const LLM_CONCURRENCY_LIMIT = 5;
const BATCH_CONCURRENCY_LIMIT = 20;

export type ProcessSinglePdfResult =
  | { success: true; filename: string; extractions: DirectorExtraction[] }
  | { success: false; filename: string; error: string };

export async function processSinglePdf(
  pdfPath: string,
  limit?: ReturnType<typeof pLimit>,
): Promise<ProcessSinglePdfResult> {
  const filename = basename(pdfPath);
  console.log(`[Parser] Reading text from ${filename}...`);

  try {
    const text = await parsePdfToText(pdfPath);

    // Skip LLM extraction for empty or whitespace-only documents
    if (!text.trim()) {
      return { success: true, filename, extractions: [] };
    }

    console.log(`[LLM] Requesting extraction for ${filename} (Waiting for slot)...`);
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
  console.log(`[Pipeline] Starting batch of ${pdfPaths.length} files...`);
  const llmLimit = pLimit(LLM_CONCURRENCY_LIMIT);
  const batchLimit = pLimit(BATCH_CONCURRENCY_LIMIT);

  // Use batch limit to prevent OOM/file descriptor exhaustion on large ingestion sets
  const results = await Promise.all(
    pdfPaths.map((pdfPath) => batchLimit(() => processSinglePdf(pdfPath, llmLimit))),
  );

  // Type guards for clean result partitioning
  const isSuccess = (r: ProcessSinglePdfResult): r is Extract<ProcessSinglePdfResult, { success: true }> =>
    r.success;
  const isFailure = (r: ProcessSinglePdfResult): r is Extract<ProcessSinglePdfResult, { success: false }> =>
    !r.success;

  const successes = results.filter(isSuccess);
  const failures = results.filter(isFailure);

  // Log failures to console for diagnostic observability (AC 4 preserves JSON-only DLQ)
  for (const failure of failures) {
    console.warn(`DLQ: Failed to process ${failure.filename}: ${failure.error}`);
  }

  const allExtractions = successes.flatMap((r) => r.extractions);

  const output: PipelineOutput = {
    extractions: allExtractions,
    summary: {
      total_documents_processed: pdfPaths.length,
      director_change_documents_identified: successes.filter((r) => r.extractions.length > 0).length,
      total_director_changes_extracted: allExtractions.length,
      documents_that_failed_processing: failures.map((f) => f.filename),
    },
  };

  console.log(`[Storage] Saving final results to ${outputFile}...`);
  try {
    await writePipelineOutput(output, outputFile);
  } catch (error) {
    throw new Error(`CRITICAL: Failed to write pipeline output to ${outputFile}`, {
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }

  console.log(
    `Pipeline complete: ${pdfPaths.length} files processed (${failures.length} failed), ${allExtractions.length} extractions written to ${outputFile}`,
  );
}
