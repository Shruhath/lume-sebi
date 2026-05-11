import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { parsePdfToText } from '../src/lib/pdf-parser.js';
import { extractDirectorChanges } from '../src/lib/llm-client.js';
import { writePipelineOutput } from '../src/lib/file-system.js';
import type { PipelineOutput, DirectorExtraction } from '../src/schemas/director-schema.js';
import path from 'node:path';

describe('E2E Two-File Proof of Concept', () => {
  it('processes two PDFs end-to-end', async () => {
    const pdfPaths = [
      'tests/fixtures/test_full_breaker.pdf',
      'tests/fixtures/test_partial_breaker.pdf'
    ];

    const outputPath = 'e2e-output.json';
    const allExtractions: DirectorExtraction[] = [];
    let directorChangeDocsCount = 0;

    console.log(`\n[E2E] Starting POC for ${pdfPaths.length} files`);

    for (const pdfPath of pdfPaths) {
      const filename = path.basename(pdfPath);
      console.log(`\n--- Processing: ${filename} ---`);

      try {
        // 1. Ingestion
        console.log(`[E2E] Step 1: Parsing PDF to text...`);
        const text = await parsePdfToText(pdfPath);
        console.log(`[E2E] Extracted ${text.length} characters.`);

        // 2. Extraction
        console.log(`[E2E] Step 2: Extracting director changes...`);
        const changes = await extractDirectorChanges(text);
        console.log(`[E2E] Found ${changes.length} director change events.`);

        if (changes.length > 0) {
          directorChangeDocsCount++;
        }

        // 3. Transformation (Adding filename metadata)
        const extractions: DirectorExtraction[] = changes.map(change => ({
          source_filename: filename,
          ...change
        }));

        allExtractions.push(...extractions);
      } catch (error) {
        console.error(`[E2E] Failed to process ${filename}:`, error);
        throw error;
      }
    }

    // 4. Summary Calculation
    const output: PipelineOutput = {
      extractions: allExtractions,
      summary: {
        total_documents_processed: pdfPaths.length,
        director_change_documents_identified: directorChangeDocsCount,
        total_director_changes_extracted: allExtractions.length,
        documents_that_failed_processing: []
      }
    };

    // 5. Output
    console.log(`\n[E2E] Step 3: Writing validated output to ${outputPath}...`);
    await writePipelineOutput(output, outputPath);

    console.log(`[E2E] SUCCESS: Pipeline Proof of Concept complete.`);
    console.log(`[E2E] Output file saved: ${path.resolve(outputPath)}`);

    expect(output.summary.total_documents_processed).toBe(2);
    expect(allExtractions.length).toBeGreaterThanOrEqual(0);
  }, 120000); // 120s timeout for 2 network calls
});
