# Story 2.5: Operational Metrics Summary Generation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an engineering manager,
I want the final output to include a summary of the batch run's performance,
so that I can monitor success rates and review exactly which documents failed in the DLQ.

## Acceptance Criteria

1. **Given** the batch loop has resolved all per-file work **When** `runPipeline(pdfPaths, outputFile)` builds the final payload **Then** the serialized JSON must include a top-level `summary` object.
2. **Given** any batch size including zero files **When** the summary is generated **Then** `summary.total_documents_processed` must equal the number of input PDF paths attempted.
3. **Given** successful files may return zero or more director changes **When** the summary is generated **Then** `summary.director_change_documents_identified` must count successful documents with at least one extracted director change, not the number of changes.
4. **Given** successful files may return multiple director changes **When** the summary is generated **Then** `summary.total_director_changes_extracted` must equal the total flattened extraction count.
5. **Given** one or more per-file failures from parsing, LLM retry exhaustion, timeout, or Zod validation **When** the final JSON is written **Then** `summary.documents_that_failed_processing` must contain the exact failed PDF basenames only.
6. **Given** the final output is written **When** `writePipelineOutput()` validates the object **Then** the `summary` object must pass `ExtractionSummarySchema` as part of `PipelineOutputSchema` before serialization.
7. **Given** `npm test` and `npx tsc --noEmit` are run **When** implementation is complete **Then** all non-token-consuming tests plus new/updated summary tests must pass with zero type errors.

## Tasks / Subtasks

- [x] Task 1: Add or tighten summary schema tests in `tests/schemas.test.ts` (AC: #2, #3, #4, #5, #6, #7)
  - [x] 1.1 Prove `ExtractionSummarySchema` accepts the exact required keys: `total_documents_processed`, `director_change_documents_identified`, `total_director_changes_extracted`, and `documents_that_failed_processing`.
  - [x] 1.2 Prove all numeric metrics reject negative and non-integer values, not only `total_documents_processed`.
  - [x] 1.3 Prove `documents_that_failed_processing` rejects non-string entries.
  - [x] 1.4 Prove `PipelineOutputSchema` rejects output without `summary` and accepts empty `extractions` with a valid summary.
- [x] Task 2: Add or tighten pipeline summary tests in `tests/pipeline.test.ts` (AC: #1, #2, #3, #4, #5, #7)
  - [x] 2.1 Test mixed results: one file with two changes, one success with zero changes, one success with one change, and one failure.
  - [x] 2.2 Assert `total_documents_processed` equals every input path attempted, including failed files.
  - [x] 2.3 Assert `director_change_documents_identified` counts documents with `extractions.length > 0`.
  - [x] 2.4 Assert `total_director_changes_extracted` equals the flattened extraction array length.
  - [x] 2.5 Assert `documents_that_failed_processing` contains exact basenames only, with no error text or path prefixes.
  - [x] 2.6 Add a zero-input regression test if absent: empty input writes `extractions: []` and all summary counts as `0`.
- [x] Task 3: Implement or harden summary generation in `src/pipeline.ts` only (AC: #1, #2, #3, #4, #5)
  - [x] 3.1 Reuse the existing `ProcessSinglePdfResult` success/failure partition; do not reprocess files or call LLM code from summary logic.
  - [x] 3.2 Keep summary calculation after `Promise.all(...)` resolves so metrics represent the complete batch.
  - [x] 3.3 Preserve current public signatures: `processSinglePdf(pdfPath, limit?)` and `runPipeline(pdfPaths, outputFile)`.
  - [x] 3.4 Keep `documents_that_failed_processing` as `failures.map((f) => f.filename)`; do not include diagnostic errors in JSON.
  - [x] 3.5 Keep diagnostic failure messages in console output only, with no API keys or raw PDF text.
- [x] Task 4: Preserve schema and output boundaries (AC: #6)
  - [x] 4.1 Keep `ExtractionSummarySchema` in `src/schemas/director-schema.ts`; do not create a second summary schema.
  - [x] 4.2 Keep final validation inside `writePipelineOutput()` via `PipelineOutputSchema.parse(output)`.
  - [x] 4.3 Keep final JSON key names in `snake_case` exactly as defined by the PRD.
  - [x] 4.4 Do not change director extraction fields, CLI arguments, LLM prompt behavior, retry policy, or DLQ semantics.
- [x] Task 5: Verify implementation (AC: #7)
  - [x] 5.1 Run focused tests: `npm.cmd exec -- vitest run tests/schemas.test.ts tests/pipeline.test.ts tests/file-system.test.ts`.
  - [x] 5.2 Run the non-token-consuming regression suite: `npm.cmd exec -- vitest run tests/smoke.test.ts tests/schemas.test.ts tests/pdf-parser.test.ts tests/llm-client.test.ts tests/file-system.test.ts tests/cli.test.ts tests/pipeline.test.ts`.
  - [x] 5.3 Run `npx.cmd tsc --noEmit`.
  - [x] 5.4 Update this story's Dev Agent Record with commands, results, completion notes, and file list.

### Review Findings

- [x] [Review][Defer] DLQ information loss (Filename collisions) [src/pipeline.ts] — deferred, pre-existing
- [x] [Review][Defer] Race condition in pipeline tests [tests/pipeline.test.ts] — deferred, pre-existing

## Dev Notes

### Scope Boundary

This story finalizes the operational metrics contract for the local batch output. The intended implementation is small and should mostly harden existing code paths.

This story must NOT implement:

- New CLI flags, dashboards, Slack alerts, persistent metrics storage, or external observability services.
- New queue infrastructure, BullMQ/Redis, worker processes, or durable DLQ tables.
- LLM retry/backoff changes; those belong to Story 2.4 and already live in `src/lib/llm-client.ts`.
- Changes to the director extraction schema fields or LLM prompt.
- Error messages inside `summary.documents_that_failed_processing`; the PRD requires filenames.

### Current Repo State

- `src/pipeline.ts` already builds a `PipelineOutput` object with `extractions` and `summary`.
- `summary.total_documents_processed` is currently calculated from `pdfPaths.length`.
- `summary.director_change_documents_identified` is currently calculated from successful per-file results where `extractions.length > 0`.
- `summary.total_director_changes_extracted` is currently calculated from `allExtractions.length`.
- `summary.documents_that_failed_processing` is currently calculated from failed result basenames.
- `src/lib/file-system.ts` validates final output with `PipelineOutputSchema.parse(output)` before writing formatted JSON through a temp-file rename.
- `src/schemas/director-schema.ts` already contains `ExtractionSummarySchema` and `PipelineOutputSchema`.
- `tests/pipeline.test.ts`, `tests/schemas.test.ts`, and `tests/file-system.test.ts` already cover parts of this behavior. Expect this story to add edge coverage and close gaps rather than rewrite the pipeline.

### Implementation Guidance

Target summary shape:

```typescript
summary: {
  total_documents_processed: pdfPaths.length,
  director_change_documents_identified: successes.filter((r) => r.extractions.length > 0).length,
  total_director_changes_extracted: allExtractions.length,
  documents_that_failed_processing: failures.map((f) => f.filename),
}
```

Keep this calculation in `runPipeline()` after the batch resolves. Do not move it into `writePipelineOutput()`; the file-system layer owns validation and persistence, not business metrics.

Zero-input behavior should be deterministic:

```json
{
  "extractions": [],
  "summary": {
    "total_documents_processed": 0,
    "director_change_documents_identified": 0,
    "total_director_changes_extracted": 0,
    "documents_that_failed_processing": []
  }
}
```

### Architecture Compliance

- `src/pipeline.ts` remains the orchestration boundary and owns summary calculation.
- `src/lib/file-system.ts` remains the persistence boundary and owns final schema validation plus atomic write behavior.
- `src/schemas/director-schema.ts` remains the schema boundary; reuse `ExtractionSummarySchema`.
- Tests stay in root `tests/`, not colocated under `src/`.
- Local imports must keep NodeNext `.js` specifiers.
- JSON output must use `snake_case` keys exactly; do not introduce camelCase aliases.

### Previous Story Intelligence

From Story 2.4:

- LLM retry exhaustion rejects from `extractDirectorChanges()` and is converted to a failed per-file result by `processSinglePdf()`.
- The OpenAI SDK client is configured with explicit retry/timeout behavior; Story 2.5 should not change `src/lib/llm-client.ts`.
- `tests/e2e-poc.test.ts` may call OpenRouter and consume tokens; avoid it unless explicitly requested.

From Story 2.3:

- `processSinglePdf()` owns the per-file `try/catch` and returns a discriminated union.
- `documents_that_failed_processing` must contain exact failed PDF basenames only.
- Final `writePipelineOutput()` failure is batch-level and should still throw.
- `source_filename` is assigned after spreading each LLM result so malformed LLM data cannot overwrite the true basename.
- Duplicate basenames from different directories are a known deferred risk; do not solve it in this story unless the output contract changes.

Recent git history:

- `97d4d13 feat(llm): implement API resilience` patched Story 2.4 retry behavior and review findings.
- `fed8a64 feat(llm): add retry backoff, timeout bounds, and OpenRouter resiliency` added explicit retry tests and LLM timeout bounds.
- `5c90395 fix(pipeline): harden DLQ and optimize batch ingestion` strengthened batch limiting and DLQ behavior.

### Latest Technical Information

- Zod `.parse()` is the right final validation mechanism here because it returns typed data for valid input and throws on invalid input; `writePipelineOutput()` should keep using it to prevent invalid files from being serialized. [Source: https://zod.dev/?id=basic-usage]
- `p-limit` remains the correct concurrency primitive for this pipeline. Its default export returns a `limit` function, and concurrency has a minimum of `1`; no richer queue package is needed for summary generation. [Source: https://github.com/sindresorhus/p-limit#api]
- Vitest `vi.fn`, `vi.mock`, and `vi.mocked` remain appropriate for these tests. Clear mocks between tests to avoid leaked call state. [Source: https://vitest.dev/guide/mocking]

### Anti-Patterns to Avoid

- Do NOT compute `director_change_documents_identified` from `allExtractions.length`; one document with two changes still counts as one identified document.
- Do NOT exclude failed files from `total_documents_processed`; attempted failed files are part of operational throughput.
- Do NOT include full paths in `documents_that_failed_processing`; use basenames to preserve the existing DLQ contract.
- Do NOT include error messages in `documents_that_failed_processing`; diagnostic context belongs in console logs or a future metrics story.
- Do NOT create a parallel `SummarySchema` or validate only the summary while bypassing `PipelineOutputSchema`.
- Do NOT loosen schema validation to allow floats, negative counts, or non-string DLQ entries.
- Do NOT add dependencies for metrics calculation.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5] - story statement and acceptance criteria.
- [Source: _bmad-output/planning-artifacts/prd.md#FR17] - required operational summary metrics.
- [Source: _bmad-output/planning-artifacts/prd.md#Interface & Schema Specification] - exact output schema including `summary`.
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Flow] - final validated JSON output after batch completion.
- [Source: _bmad-output/planning-artifacts/architecture.md#Requirements to Structure Mapping] - metrics generation belongs at end of `src/pipeline.ts`.
- [Source: _bmad-output/implementation-artifacts/2-4-llm-api-resiliency-exponential-backoff.md#Previous Story Intelligence] - retry exhaustion flows into DLQ through `processSinglePdf()`.
- [Source: _bmad-output/implementation-artifacts/2-3-dead-letter-queue-dlq-exception-trapping.md#Previous Story Intelligence] - filename-only DLQ and per-file result ownership.
- [Source: src/pipeline.ts] - current summary generation and orchestration.
- [Source: src/schemas/director-schema.ts] - `ExtractionSummarySchema` and `PipelineOutputSchema`.
- [Source: src/lib/file-system.ts] - final output validation and atomic serialization.
- [Source: tests/pipeline.test.ts] - existing pipeline summary and DLQ tests to extend.
- [Source: tests/schemas.test.ts] - existing schema tests to extend.
- [Source: tests/file-system.test.ts] - exact output key and serialization tests.

## Dev Agent Record

### Agent Model Used

GPT-5

### Implementation Plan

- Add schema regressions proving every summary count rejects negative and non-integer values, and DLQ entries must be strings.
- Add pipeline regressions for mixed success/empty/failure batches and zero-input batches.
- Preserve the existing `src/pipeline.ts` summary implementation because the strengthened tests verify it already satisfies Story 2.5.
- Run focused tests, the non-token-consuming regression suite, and TypeScript validation.

### Debug Log References

- `npm.cmd exec -- vitest run tests/schemas.test.ts tests/pipeline.test.ts tests/file-system.test.ts` passed after test additions: 3 files, 54 tests.
- `npm.cmd exec -- vitest run tests/smoke.test.ts tests/schemas.test.ts tests/pdf-parser.test.ts tests/llm-client.test.ts tests/file-system.test.ts tests/cli.test.ts tests/pipeline.test.ts` passed: 7 files, 92 tests.
- `npx.cmd tsc --noEmit` passed with zero type errors.

### Completion Notes List

- Added summary schema guardrails covering all numeric metric fields and non-string DLQ entries.
- Added pipeline regression coverage for mixed batches: multi-change success, zero-change success, single-change success, and failed document basenames.
- Added zero-input batch coverage proving deterministic `0` counts and empty arrays.
- Confirmed existing `src/pipeline.ts`, `src/lib/file-system.ts`, and `src/schemas/director-schema.ts` already preserve the required implementation boundaries; no production code changes were needed.

### File List

- `tests/schemas.test.ts`
- `tests/pipeline.test.ts`
- `_bmad-output/implementation-artifacts/2-5-operational-metrics-summary-generation.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-05-12: Story context created and marked ready-for-dev.
- 2026-05-12: Implemented Story 2.5 validation coverage for operational summary metrics; moved story to review.
