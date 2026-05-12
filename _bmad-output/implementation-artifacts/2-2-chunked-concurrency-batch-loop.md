# Story 2.2: Chunked Concurrency Batch Loop

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a data engineer,
I want the system to process the files concurrently but artificially throttle to a maximum of 5 simultaneous requests,
so that the batch runs quickly without instantly triggering OpenRouter rate limits.

## Acceptance Criteria

1. **Given** an array of 49 file paths **When** the orchestrator loop (`pipeline.ts`) begins **Then** it must use `p-limit` to ensure no more than 5 files are being processed by the LLM at the exact same millisecond.
2. **Given** 49 file paths **When** the batch loop completes **Then** it must resolve all promises before concluding the batch run.
3. **Given** each PDF file path **When** `processSinglePdf` is invoked **Then** it must: parse the PDF to text via `parsePdfToText`, extract director changes via `extractDirectorChanges`, and return `DirectorExtraction[]` with `source_filename` set to `path.basename(pdfPath)`.
4. **Given** all file processing completes successfully **When** the batch concludes **Then** `runPipeline` must call `writePipelineOutput` with the aggregated extractions and a basic summary containing correct counts for `total_documents_processed`, `director_change_documents_identified`, `total_director_changes_extracted`, and an empty `documents_that_failed_processing` array.
5. **Given** `npm test` and `npx tsc --noEmit` are run **When** implementation is complete **Then** all existing tests plus new pipeline tests must pass with zero type errors.

## Tasks / Subtasks

- [x] Task 1: Implement `processSinglePdf` in `src/pipeline.ts` (AC: #3)
  - [x] 1.1 Import `parsePdfToText` from `./lib/pdf-parser.js`, `extractDirectorChanges` from `./lib/llm-client.js`, `basename` from `node:path`.
  - [x] 1.2 Export `async function processSinglePdf(pdfPath: string): Promise<DirectorExtraction[]>`.
  - [x] 1.3 Inside: call `parsePdfToText(pdfPath)` to get raw text.
  - [x] 1.4 Call `extractDirectorChanges(text)` to get `DirectorChange[]`.
  - [x] 1.5 Map each `DirectorChange` to `DirectorExtraction` by spreading and prepending `source_filename: basename(pdfPath)`.
  - [x] 1.6 Return the `DirectorExtraction[]`.
- [x] Task 2: Implement `p-limit` batch loop in `runPipeline` (AC: #1, #2, #4)
  - [x] 2.1 Import `pLimit` from `p-limit`, `writePipelineOutput` from `./lib/file-system.js`, types from `./schemas/director-schema.js`.
  - [x] 2.2 Replace the stub body: create `const limit = pLimit(5)`.
  - [x] 2.3 Map `pdfPaths` through `limit(() => processSinglePdf(pdfPath))` and await with `Promise.all`.
  - [x] 2.4 Flatten results into `allExtractions: DirectorExtraction[]` using `.flat()`.
  - [x] 2.5 Compute summary: `total_documents_processed = pdfPaths.length`, `director_change_documents_identified = results.filter(r => r.length > 0).length`, `total_director_changes_extracted = allExtractions.length`, `documents_that_failed_processing = []`.
  - [x] 2.6 Call `writePipelineOutput({ extractions: allExtractions, summary }, outputFile)`.
  - [x] 2.7 Log batch completion message to stdout.
- [x] Task 3: Add pipeline unit tests (AC: #1, #2, #3, #5)
  - [x] 3.1 Create `tests/pipeline.test.ts`.
  - [x] 3.2 Test: `processSinglePdf` calls `parsePdfToText` then `extractDirectorChanges` and returns `DirectorExtraction[]` with correct `source_filename`. Use `vi.mock` to mock `../src/lib/pdf-parser.js` and `../src/lib/llm-client.js`.
  - [x] 3.3 Test: `processSinglePdf` returns empty array when LLM returns no changes.
  - [x] 3.4 Test: `runPipeline` limits concurrency to 5 — use a mock `processSinglePdf` that tracks active/peak concurrent calls. Verify peak never exceeds 5 for a batch of 10+ files.
  - [x] 3.5 Test: `runPipeline` collects and flattens results from all files correctly.
  - [x] 3.6 Test: `runPipeline` computes correct summary counts (total processed, director change docs, total changes, empty DLQ).
  - [x] 3.7 Test: `runPipeline` calls `writePipelineOutput` with correctly shaped `PipelineOutput`.
- [x] Task 4: Verify implementation (AC: #5)
  - [x] 4.1 Run `npm test`. but dont consume openrouter tokens (maybe becuase of e2e-poc.text.ts json - so exculde it and run)
  - [x] 4.2 Run `npx tsc --noEmit`.
  - [x] 4.3 Confirm zero regressions across all existing test files (schemas, pdf-parser, llm-client, file-system, cli, e2e-poc, smoke).

### Review Findings

- [x] [Review][Patch] Spread Order Hazard: `source_filename` is defined before the `...change` spread in `processSinglePdf`. [src/pipeline.ts:16]
- [x] [Review][Patch] Total Batch Fragility: A single malformed PDF or API error will crash the entire `Promise.all`. [src/pipeline.ts:27]
- [x] [Review][Patch] Empty Summary Fraud: `documents_that_failed_processing` is hardcoded to `[]` even if the pipeline crashes. [src/pipeline.ts:39]
- [x] [Review][Patch] Missing Persistence Guard: `writePipelineOutput` failure isn't caught. [src/pipeline.ts:43]
- [x] [Review][Patch] Path Traceability: `basename(pdfPath)` can lead to collisions if multiple directories contain files with the same name. [src/pipeline.ts:13]
- [x] [Review][Patch] Memory Bloat Risk: Collecting all extractions into a massive array before writing. [src/pipeline.ts:31]
- [x] [Review][Patch] Sub-optimal LLM Throttling: `pLimit` throttles local parsing alongside network-bound LLM calls. [src/pipeline.ts:28]
- [x] [Review][Defer] Operational Progress Logging [src/pipeline.ts:44] — deferred, pre-existing (Story 2.5 scope)
- [x] [Review][Defer] ESM .js Extensions [src/pipeline.ts:3] — deferred, pre-existing (Project convention)

## Dev Notes

### Scope Boundary

This story implements the `p-limit` concurrency batch loop and `processSinglePdf` wiring ONLY. It must NOT implement:

- `try/catch` DLQ exception trapping inside `processSinglePdf` (Story 2.3). Errors propagate as rejected promises.
- LLM retry/backoff or `AbortController` timeout (Story 2.4).
- Console-logged operational metrics or enhanced summary generation (Story 2.5).
- Any changes to `llm-client.ts`, `pdf-parser.ts`, `file-system.ts`, or `director-schema.ts`.
- Any changes to `cli.ts`.

If `processSinglePdf` throws (corrupt PDF, API error), the entire batch will fail via `Promise.all` rejection. This is expected — Story 2.3 adds the fault tolerance layer.

### Current Repo State

- `package.json` is ESM with `"type": "module"`.
- TypeScript uses `module: "NodeNext"` — requires `.js` import specifiers for local imports.
- `tsconfig.json` excludes `tests/` — Vitest handles test transpilation independently.
- `p-limit@7.3.0` is already installed. ESM-only package. Import: `import pLimit from 'p-limit';`.
- `src/pipeline.ts` is a 3-line stub: `export async function runPipeline(pdfPaths: string[], outputFile: string): Promise<void>`.
- `src/cli.ts` calls `runPipeline(pdfPaths, opts.output)` — no signature change needed.
- Current test count: 7 test files, 69 tests, zero type errors.

### Implementation Guidance

**`src/pipeline.ts` target structure:**

```typescript
import { basename } from 'node:path';
import pLimit from 'p-limit';
import { parsePdfToText } from './lib/pdf-parser.js';
import { extractDirectorChanges } from './lib/llm-client.js';
import { writePipelineOutput } from './lib/file-system.js';
import type { DirectorExtraction, PipelineOutput } from './schemas/director-schema.js';

export async function processSinglePdf(pdfPath: string): Promise<DirectorExtraction[]> {
  const filename = basename(pdfPath);
  const text = await parsePdfToText(pdfPath);
  const changes = await extractDirectorChanges(text);
  return changes.map(change => ({ source_filename: filename, ...change }));
}

export async function runPipeline(pdfPaths: string[], outputFile: string): Promise<void> {
  const limit = pLimit(5);

  const results = await Promise.all(
    pdfPaths.map(pdfPath => limit(() => processSinglePdf(pdfPath)))
  );

  const allExtractions = results.flat();

  const output: PipelineOutput = {
    extractions: allExtractions,
    summary: {
      total_documents_processed: pdfPaths.length,
      director_change_documents_identified: results.filter(r => r.length > 0).length,
      total_director_changes_extracted: allExtractions.length,
      documents_that_failed_processing: [],
    },
  };

  await writePipelineOutput(output, outputFile);
  console.log(`Pipeline complete: ${pdfPaths.length} files processed, ${allExtractions.length} extractions written to ${outputFile}`);
}
```

**Testing approach — `vi.mock` for external dependencies:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processSinglePdf, runPipeline } from '../src/pipeline.js';

vi.mock('../src/lib/pdf-parser.js', () => ({
  parsePdfToText: vi.fn(),
}));

vi.mock('../src/lib/llm-client.js', () => ({
  extractDirectorChanges: vi.fn(),
}));

vi.mock('../src/lib/file-system.js', () => ({
  writePipelineOutput: vi.fn(),
}));
```

Use `vi.mocked()` to type and control mock return values per test. For the concurrency test, have the mocked `processSinglePdf` track `activeCount` via a counter incremented before a small `setTimeout` delay and decremented after, asserting `peakConcurrent <= 5`.

**Concurrency test pattern:**

```typescript
it('limits concurrency to 5', async () => {
  let active = 0;
  let peak = 0;

  // Mock processSinglePdf at module level or reimport
  const mockProcess = vi.fn(async (_path: string) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(r => setTimeout(r, 50));
    active--;
    return [];
  });

  // ... invoke runPipeline with 15 paths, verify peak <= 5
});
```

Note: To test `runPipeline` concurrency, you may need to mock `processSinglePdf` at a higher level or refactor to accept it as a parameter. The simplest approach is to mock the downstream dependencies (`parsePdfToText` and `extractDirectorChanges`) with small delays, letting the real `processSinglePdf` run, and tracking concurrency in the mocked `extractDirectorChanges`.

### Architecture Compliance

- `src/pipeline.ts` remains the sole orchestration boundary per the architecture. It stitches together `pdf-parser.ts`, `llm-client.ts`, and `file-system.ts`.
- `processSinglePdf` lives in `pipeline.ts` (not a separate file) — it's the orchestration logic, not a utility.
- No new dependencies required. `p-limit@7.3.0` is already installed.
- Keep code ESM-only. Use `.js` import specifiers for local imports.
- File naming: `kebab-case`. Function naming: `camelCase`. JSON output: `snake_case`.
- `writePipelineOutput` validates output against `PipelineOutputSchema.parse()` before writing — no separate validation needed in pipeline.

### Previous Story Intelligence

From Story 2.1:

- `discoverPdfFiles(inputDir)` returns absolute PDF paths. `runPipeline` receives these paths directly — no path resolution needed inside pipeline.
- `cli.ts` uses `import.meta.url` entry-point guard so importing it in tests doesn't trigger `main()`.
- `runPipeline` signature is already `(pdfPaths: string[], outputFile: string): Promise<void>` — no change needed.
- Full suite after 2.1: 7 files, 69 tests, zero type errors.

From E2E POC test (`tests/e2e-poc.test.ts`):

- The POC demonstrates the exact data flow this story implements: `parsePdfToText → extractDirectorChanges → map to DirectorExtraction → writePipelineOutput`.
- The POC uses a sequential `for` loop — this story replaces that with `p-limit` concurrent execution.
- The POC's `DirectorExtraction` mapping pattern: `{ source_filename: basename(pdfPath), ...change }` — reuse exactly.
- The POC computes `director_change_documents_identified` by counting results with `length > 0` — reuse this logic.

From deferred work:

- Concurrency & File Locking note: concurrent calls to `writePipelineOutput` for the same path could cause race conditions. NOT applicable here — `writePipelineOutput` is called once after all promises resolve.

### Library / Version Reference

| Package | Installed Version | Story Relevance |
|---|---:|---|
| `p-limit` | `7.3.0` | Core dependency. `import pLimit from 'p-limit'; const limit = pLimit(5);`. ESM-only. |
| `vitest` | `^4.1.5` | Use `vi.mock`, `vi.fn`, `vi.mocked` for dependency mocking. |
| `typescript` | `^6.0.3` | Verify with `npx tsc --noEmit`. |
| `zod` | `^3.25.76` | Do NOT upgrade. Schema validation via `writePipelineOutput` is unchanged. |

### Anti-Patterns to Avoid

- Do NOT add `try/catch` inside `processSinglePdf` — DLQ exception trapping is Story 2.3.
- Do NOT use `Promise.allSettled` — that implies error handling which is Story 2.3's scope. Use `Promise.all`.
- Do NOT implement retry logic or `AbortController` — that's Story 2.4.
- Do NOT add console progress logging like "Processed 5/49..." — operational metrics are Story 2.5.
- Do NOT modify `llm-client.ts`, `pdf-parser.ts`, `file-system.ts`, or `director-schema.ts`.
- Do NOT use `require()` or CJS patterns — ESM only.
- Do NOT create a separate file for `processSinglePdf` — it belongs in `pipeline.ts` as orchestration logic.
- Do NOT use raw `Promise.all(files.map(f => processSinglePdf(f)))` without `p-limit` — this would fire all 49 requests simultaneously.
- Do NOT hardcode the concurrency limit inline — use a named constant or clear `pLimit(5)` call for readability.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2] — story statement and acceptance criteria.
- [Source: _bmad-output/planning-artifacts/prd.md#FR2] — process concurrently in limited batches.
- [Source: _bmad-output/planning-artifacts/prd.md#NFR4] — limit concurrency to max 5 simultaneous requests.
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — `p-limit` throttling to exactly 5 concurrent promises.
- [Source: _bmad-output/planning-artifacts/architecture.md#Component Boundaries] — orchestration boundary in `pipeline.ts`.
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Flow] — PDF → parser → LLM → validated JSON → output.
- [Source: _bmad-output/planning-artifacts/architecture.md#Pattern Examples] — DLQ good/bad patterns (for awareness, not implementation in this story).
- [Source: _bmad-output/implementation-artifacts/2-1-cli-batch-argument-ingestion.md#Dev Notes] — current repo state, ESM conventions, pipeline signature.
- [Source: tests/e2e-poc.test.ts] — reference data flow pattern for processSinglePdf implementation.
- [Source: src/pipeline.ts] — current 3-line stub to replace.
- [Source: src/schemas/director-schema.ts] — `DirectorExtraction`, `PipelineOutput`, `PipelineOutputSchema` types used.
- [Source: src/lib/file-system.ts] — `writePipelineOutput` validates and writes atomically.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — concurrency/file-locking note (not applicable here).

## Dev Agent Record

### Agent Model Used

GPT-5

### Implementation Plan

- Add failing pipeline unit tests for `processSinglePdf`, the limited batch loop, output aggregation, and summary shape.
- Implement `processSinglePdf` and `runPipeline` in `src/pipeline.ts` using `p-limit` with concurrency 5 and a single final `writePipelineOutput` call.
- Run focused and non-E2E regression tests plus TypeScript validation.

### Debug Log References

- `npm.cmd exec -- vitest run tests/pipeline.test.ts` failed before implementation: 6 failed tests against the stub.
- `npm.cmd exec -- vitest run tests/pipeline.test.ts` passed after implementation: 1 file, 6 tests.
- `npm.cmd exec -- vitest run tests/smoke.test.ts tests/schemas.test.ts tests/pdf-parser.test.ts tests/llm-client.test.ts tests/file-system.test.ts tests/cli.test.ts tests/pipeline.test.ts` passed: 7 files, 78 tests.
- `npm.cmd exec -- tsc --noEmit` passed with zero type errors.

### Completion Notes List

- Implemented `processSinglePdf` to parse each PDF, extract director changes, and attach `source_filename` from `basename(pdfPath)`.
- Implemented `runPipeline` with `p-limit` concurrency 5, `Promise.all` completion, flattened extractions, summary counts, and one validated output write.
- Added unit tests for single-PDF processing, empty extraction handling, concurrency limit, flattened output, summary counts, and `writePipelineOutput` shape.
- Excluded `tests/e2e-poc.test.ts` from the regression run to avoid OpenRouter token usage as requested in Task 4.1.

### File List

- `src/pipeline.ts`
- `tests/pipeline.test.ts`
- `_bmad-output/implementation-artifacts/2-2-chunked-concurrency-batch-loop.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-05-12: Implemented chunked concurrency batch loop and pipeline unit tests; moved story to review.
