import { basename } from 'node:path';
import pLimit from 'p-limit';
import { writePipelineOutput } from './lib/file-system.js';
import { extractDirectorChanges } from './lib/llm-client.js';
import { parsePdfToText } from './lib/pdf-parser.js';
import type { DirectorExtraction, PipelineOutput } from './schemas/director-schema.js';

const CONCURRENCY_LIMIT = 5;

export async function processSinglePdf(pdfPath: string): Promise<DirectorExtraction[]> {
  const text = await parsePdfToText(pdfPath);
  const changes = await extractDirectorChanges(text);
  const filename = basename(pdfPath);

  return changes.map((change) => ({
    source_filename: filename,
    ...change,
  }));
}

export async function runPipeline(pdfPaths: string[], outputFile: string): Promise<void> {
  const limit = pLimit(CONCURRENCY_LIMIT);

  const results = await Promise.all(
    pdfPaths.map((pdfPath) => limit(() => processSinglePdf(pdfPath))),
  );
  const allExtractions = results.flat();

  const output: PipelineOutput = {
    extractions: allExtractions,
    summary: {
      total_documents_processed: pdfPaths.length,
      director_change_documents_identified: results.filter((result) => result.length > 0)
        .length,
      total_director_changes_extracted: allExtractions.length,
      documents_that_failed_processing: [],
    },
  };

  await writePipelineOutput(output, outputFile);
  console.log(
    `Pipeline complete: ${pdfPaths.length} files processed, ${allExtractions.length} extractions written to ${outputFile}`,
  );
}
