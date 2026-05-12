# Story 2.3: Dead Letter Queue (DLQ) Exception Trapping

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a compliance officer,
I want the system to catch file-level failures and route them to a DLQ instead of crashing,
so that a single corrupted PDF doesn't destroy an entire weekend's batch run.

## Acceptance Criteria

1. **Given** a batch containing a corrupted PDF **When** `processSinglePdf()` is executed on that file **Then** the failure must be caught within a `try/catch` block in `processSinglePdf()`.
2. **Given** a PDF whose LLM extraction fails Zod validation or throws an API/client error **When** `processSinglePdf()` is executed on that file **Then** the error must be converted into a failed per-file result, not thrown to the parent batch loop.
3. **Given** any per-file parsing, extraction, or validation failure **When** `runPipeline()` resolves the batch **Then** the parent batch loop must still process every other file and write output for successful files.
4. **Given** one or more per-file failures **When** `writePipelineOutput()` is called **Then** `summary.documents_that_failed_processing` must contain the exact failed PDF basenames only, with no error-message suffixes.
5. **Given** `npm test` and `npx tsc --noEmit` are run **When** implementation is complete **Then** all non-token-consuming tests plus new DLQ tests must pass with zero type errors.

## Tasks / Subtasks

- [x] Task 1: Add failing DLQ tests in `tests/pipeline.test.ts` (AC: #1, #2, #3, #4, #5)
  - [x] 1.1 Test `processSinglePdf('/tmp/corrupted.pdf')` when `parsePdfToText` rejects: assert it resolves to a failed result containing `source_filename` or `filename` equal to `corrupted.pdf`.
  - [x] 1.2 Test `processSinglePdf('/tmp/zod-failure.pdf')` when `extractDirectorChanges` rejects: assert it resolves to a failed result and does not reject.
  - [x] 1.3 Test `runPipeline()` with mixed success and failure: assert all files are attempted, successful extractions are preserved, and output is still written.
  - [x] 1.4 Test `documents_that_failed_processing` contains `['bad.pdf']` rather than `['bad.pdf: <error>']`.
  - [x] 1.5 Keep the existing LLM concurrency test: peak `extractDirectorChanges` concurrency must remain `<= 5`.
- [x] Task 2: Refactor `processSinglePdf` to own the per-file `try/catch` (AC: #1, #2)
  - [x] 2.1 Define a local exported discriminated union in `src/pipeline.ts`, for example `ProcessSinglePdfResult = { success: true; filename: string; extractions: DirectorExtraction[] } | { success: false; filename: string; error: string }`.
  - [x] 2.2 Wrap parsing, extraction, and source filename mapping in one `try/catch` inside `processSinglePdf`.
  - [x] 2.3 On success, return `{ success: true, filename, extractions }`.
  - [x] 2.4 On failure, return `{ success: false, filename, error }` and do not throw.
  - [x] 2.5 Preserve `source_filename` by spreading `change` first and setting `source_filename: filename` last.
- [x] Task 3: Simplify `runPipeline` around settled per-file results (AC: #3, #4)
  - [x] 3.1 Keep `const limit = pLimit(CONCURRENCY_LIMIT)` and pass it to `processSinglePdf` so only `extractDirectorChanges` is throttled.
  - [x] 3.2 Use `Promise.all(pdfPaths.map((pdfPath) => processSinglePdf(pdfPath, limit)))`; per-file failures should not reject because `processSinglePdf` owns them.
  - [x] 3.3 Build `successes`, `failures`, and `allExtractions` from the returned discriminated union.
  - [x] 3.4 Set `documents_that_failed_processing` to `failures.map((f) => f.filename)`.
  - [x] 3.5 Keep the output persistence guard around `writePipelineOutput`; persistence failure is a batch-level failure and should still throw.
- [x] Task 4: Clean implementation details introduced by review patching (AC: #5)
  - [x] 4.1 Remove production comments that reference patch numbers in `src/pipeline.ts`; keep only comments that explain durable behavior.
  - [x] 4.2 Do not add new dependencies or move orchestration out of `src/pipeline.ts`.
  - [x] 4.3 Do not implement LLM retry/backoff or `AbortController` timeout; that is Story 2.4.
- [x] Task 5: Verify implementation (AC: #5)
  - [x] 5.1 Run `npm test` or the non-token-consuming focused suite if `tests/e2e-poc.test.ts` would call OpenRouter.
  - [x] 5.2 Run `npx tsc --noEmit`.
  - [x] 5.3 Update the Dev Agent Record with commands and results.

### Review Findings

- [x] [Review][Decision] Loss of Diagnostic Error Context — Should we log the captured error messages for observability, even if they aren't included in the JSON output (as per AC 4)? (Resolved: Log to console)
- [x] [Review][Patch] TypeScript Type Narrowing failure in runPipeline [src/pipeline.ts:49]
- [x] [Review][Patch] Resource Exhaustion / Scalability Risk [src/pipeline.ts:46]
- [x] [Review][Patch] Empty/Whitespace PDF handling [src/pipeline.ts:22]
- [x] [Review][Patch] Loss of Stack Traces on Persistence Failure [src/pipeline.ts:70]
- [x] [Review][Defer] Duplicate Basename Collision [src/pipeline.ts:16] — deferred, pre-existing

## Dev Notes

### Scope Boundary

This story formalizes file-level DLQ exception trapping. It must catch failures from PDF parsing, LLM extraction, and Zod/Instructor validation at the single-file boundary.

This story must NOT implement:

- HTTP retry or exponential backoff for `429`, `502`, `503`, or `504` responses. That is Story 2.4.
- `AbortController` request timeout handling. That is Story 2.4.
- Expanded operational metrics beyond the existing summary fields. That is Story 2.5.
- New queue infrastructure, persistent DLQ storage, or a separate worker system.

### Current Repo State

- `package.json` is ESM with `"type": "module"`.
- TypeScript uses NodeNext-style local imports with `.js` specifiers.
- `src/pipeline.ts` currently has `CONCURRENCY_LIMIT = 5`, `processSinglePdf(pdfPath, limit?)`, and `runPipeline(pdfPaths, outputFile)`.
- Current code already catches per-file errors in `runPipeline`, but Story 2.3 AC requires the `try/catch` inside `processSinglePdf()`.
- Current code writes `documents_that_failed_processing` as strings like `"bad.pdf: error message"`. The PRD and story require exact failed filenames only.
- `tests/pipeline.test.ts` currently covers success paths, flattening, summary counts, output write shape, and LLM concurrency. It does not cover DLQ failure paths.
- `writePipelineOutput` validates the final `PipelineOutput` through `PipelineOutputSchema.parse()` before atomically writing a temp file and renaming it.

### Implementation Guidance

Use a discriminated result type so failure handling is explicit and type-safe:

```typescript
export type ProcessSinglePdfResult =
  | { success: true; filename: string; extractions: DirectorExtraction[] }
  | { success: false; filename: string; error: string };
```

Target shape for `processSinglePdf`:

```typescript
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
      extractions: changes.map((change) => ({ ...change, source_filename: filename })),
    };
  } catch (error) {
    return {
      success: false,
      filename,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

Target behavior for `runPipeline`:

- Await all `processSinglePdf` calls via `Promise.all`; individual corrupt files should not reject.
- Compute `director_change_documents_identified` only from successful files with one or more extractions.
- Set `documents_that_failed_processing` to exact basenames only.
- Keep `writePipelineOutput` errors as fatal; a failed final output write means the batch artifact was not produced.

### Architecture Compliance

- `src/pipeline.ts` remains the orchestration boundary. It stitches `pdf-parser.ts`, `llm-client.ts`, and `file-system.ts`; extraction logic stays in `src/lib/llm-client.ts`.
- `src/lib/pdf-parser.ts` only returns raw text and should not know about DLQ.
- `src/lib/llm-client.ts` remains responsible for Instructor/OpenRouter extraction and Zod response validation. It should not know about filenames or DLQ arrays.
- JSON output must continue to use `snake_case`, especially `documents_that_failed_processing`.
- No schema change is required for this story; `documents_that_failed_processing` is already `z.array(z.string())`.

### Previous Story Intelligence

From Story 2.2:

- `runPipeline(pdfPaths, outputFile)` is already the public orchestration signature used by `src/cli.ts`; do not change it.
- `p-limit@7.3.0` is already installed and imported as `import pLimit from 'p-limit';`.
- The reviewed implementation moved throttling to the LLM extraction call so local PDF parsing is not artificially serialized behind API concurrency. Preserve that behavior.
- `source_filename` must be set after spreading `change` so malformed or unexpected LLM data cannot overwrite the real filename.
- `tests/e2e-poc.test.ts` may consume OpenRouter tokens; prefer the focused non-E2E suite unless the user explicitly asks for live E2E.

Recent git history:

- `112108f fix(pipeline): harden batch orchestration and optimize throttling` modified `src/pipeline.ts`, Story 2.2, and `sprint-status.yaml`.
- `2d847c1 feat(pipeline): add chunked concurrency batch loop` introduced the initial `p-limit` pipeline work.

### Latest Technical Information

- `p-limit` is still the correct local dependency for this story: its default export returns a `limit` function that runs async functions with bounded concurrency; the `concurrency` minimum is `1`. Use the already installed version and do not introduce `p-queue` or `p-map`. [Source: https://github.com/sindresorhus/p-limit#api]
- Vitest mocks remain appropriate for these tests. Use `vi.fn`, `vi.mock`, `vi.mocked`, and `mockImplementation` to simulate parser and LLM failures; clear mocks between tests to avoid leaked call state. [Source: https://vitest.dev/guide/mocking]

### Anti-Patterns to Avoid

- Do NOT leave per-file failure trapping only in `runPipeline`; the AC names `processSinglePdf()`.
- Do NOT put error messages in `documents_that_failed_processing`; the summary array is for exact failed filenames.
- Do NOT change `documents_that_failed_processing` to objects unless the schema and downstream contract are intentionally changed in a separate story.
- Do NOT use `Promise.allSettled` as the primary design if `processSinglePdf` already returns success/failure results; it makes failure ownership less clear.
- Do NOT catch and suppress `writePipelineOutput` failures. Final artifact persistence is not a per-file DLQ case.
- Do NOT add retries in this story; retry behavior belongs to `llm-client.ts` in Story 2.4.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3] - story statement and acceptance criteria.
- [Source: _bmad-output/planning-artifacts/prd.md#FR12] - trap file-level exceptions without halting the batch process.
- [Source: _bmad-output/planning-artifacts/prd.md#FR13] - capture exact failed filenames in the Dead Letter Queue.
- [Source: _bmad-output/planning-artifacts/prd.md#NFR1] - no single file failure may crash the parent Node.js process.
- [Source: _bmad-output/planning-artifacts/architecture.md#Process Patterns] - DLQ pattern requires catch, minimal warning, failed indicator, and orchestrator DLQ population.
- [Source: _bmad-output/planning-artifacts/architecture.md#Component Boundaries] - orchestration stays in `src/pipeline.ts`.
- [Source: _bmad-output/implementation-artifacts/2-2-chunked-concurrency-batch-loop.md#Previous Story Intelligence] - current pipeline signature, ESM conventions, and p-limit behavior.
- [Source: src/pipeline.ts] - current implementation to modify.
- [Source: tests/pipeline.test.ts] - existing pipeline tests to extend.
- [Source: src/schemas/director-schema.ts] - `PipelineOutput` and DLQ summary schema.
- [Source: src/lib/file-system.ts] - final output validation and atomic write behavior.

## Dev Agent Record

### Agent Model Used

GPT-5

### Implementation Plan

- Add failing pipeline tests for `processSinglePdf` parser and extraction failures, plus mixed batch DLQ output.
- Refactor `processSinglePdf` to return a discriminated success/failure result and own the per-file `try/catch`.
- Simplify `runPipeline` to aggregate success/failure results and write filename-only DLQ entries.
- Run focused pipeline tests, non-token-consuming regression tests, and TypeScript validation.

### Debug Log References

- `npm.cmd exec -- vitest run tests/pipeline.test.ts` failed before implementation: 5 failed tests confirming missing result wrapper, local error trap, and filename-only DLQ behavior.
- `npm.cmd exec -- vitest run tests/pipeline.test.ts` passed after implementation: 1 file, 9 tests.
- `npm.cmd exec -- vitest run tests/smoke.test.ts tests/schemas.test.ts tests/pdf-parser.test.ts tests/llm-client.test.ts tests/file-system.test.ts tests/cli.test.ts tests/pipeline.test.ts` passed: 7 files, 81 tests.
- `npx.cmd tsc --noEmit` passed with zero type errors.

### Completion Notes List

- Added DLQ tests covering parser failure, LLM/Zod failure, mixed success/failure batch continuation, and filename-only `documents_that_failed_processing`.
- Refactored `processSinglePdf` to return `ProcessSinglePdfResult` and catch per-file parsing/extraction errors without rejecting the parent batch.
- Updated `runPipeline` to aggregate discriminated results, preserve successful extractions, and write exact failed basenames to the DLQ summary.
- Preserved LLM-only `p-limit` throttling at concurrency 5 and kept final output write failures fatal.

### File List

- `src/pipeline.ts`
- `tests/pipeline.test.ts`
- `_bmad-output/implementation-artifacts/2-3-dead-letter-queue-dlq-exception-trapping.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-05-12: Implemented DLQ exception trapping with per-file result objects, filename-only DLQ summary entries, and regression coverage; moved story to review.
