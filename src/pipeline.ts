import { basename } from 'node:path';
import pLimit from 'p-limit';
import { writePipelineOutput } from './lib/file-system.js';
import { extractDirectorChanges } from './lib/llm-client.js';
import { parsePdfToText } from './lib/pdf-parser.js';
import type { DirectorExtraction, PipelineOutput } from './schemas/director-schema.js';

const CONCURRENCY_LIMIT = 5;

/**
 * Processes a single PDF: parses text, extracts director changes, and attaches source filename.
 * Note: Throttling is handled at the call site for the LLM extraction specifically.
 */
export async function processSinglePdf(
  pdfPath: string,
  limit?: ReturnType<typeof pLimit>,
): Promise<DirectorExtraction[]> {
  const filename = basename(pdfPath);
  const text = await parsePdfToText(pdfPath);

  // Patch #7: Throttle only the LLM extraction, allowing concurrent local parsing
  const changes = limit
    ? await limit(() => extractDirectorChanges(text))
    : await extractDirectorChanges(text);

  // Patch #1: Move spread to start to prevent source_filename overwrites
  return changes.map((change) => ({
    ...change,
    source_filename: filename,
  }));
}

export async function runPipeline(pdfPaths: string[], outputFile: string): Promise<void> {
  const limit = pLimit(CONCURRENCY_LIMIT);

  // Patch #2 & #3: Fault tolerance and failure tracking
  const results = await Promise.all(
    pdfPaths.map(async (pdfPath) => {
      try {
        const extractions = await processSinglePdf(pdfPath, limit);
        return { pdfPath, extractions, success: true as const };
      } catch (error) {
        return {
          pdfPath,
          error: error instanceof Error ? error.message : String(error),
          success: false as const,
        };
      }
    }),
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
      documents_that_failed_processing: failures.map(
        (f) => `${basename(f.pdfPath)}: ${f.error}`,
      ),
    },
  };

  // Patch #4: Persistence Guard
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
