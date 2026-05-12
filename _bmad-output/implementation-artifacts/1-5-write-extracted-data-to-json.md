# Story 1.5: Write Extracted Data to JSON

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the data pipeline,
I want to write the fully validated extracted data to a local JSON file,
so that the Core Risk Platform can consume the intelligence.

## Acceptance Criteria

1. **Given** a successfully validated pipeline output object containing `extractions` and `summary` **When** the file-system utility is invoked **Then** it must serialize the object to the requested JSON file path.
2. **Given** the output contains director extraction records **When** the JSON is written **Then** all keys must remain `snake_case` and match `PipelineOutputSchema` / `DirectorExtractionSchema` exactly.
3. **Given** the output contains nullable optional fields (`stock_ticker`, `effective_date`, `reason_stated`) **When** the JSON is written **Then** those values must be emitted as explicit `null`, not empty strings or omitted keys.
4. **Given** an invalid output object **When** the file-system utility is invoked **Then** it must reject before writing invalid JSON.
5. **Given** the target output path includes a missing parent directory **When** the utility writes the file **Then** it should create the parent directory and write UTF-8 JSON with deterministic formatting.
6. **Given** `npm test` and `npx tsc --noEmit` are run **When** implementation is complete **Then** all existing tests plus new file-system tests must pass with zero type errors.

## Tasks / Subtasks

- [x] Task 1: Create JSON file-system writer utility (AC: #1, #2, #3, #4, #5)
  - [x] 1.1 Create `src/lib/file-system.ts`.
  - [x] 1.2 Import `mkdir` and `writeFile` from `node:fs/promises`, `dirname` from `node:path`, and `PipelineOutputSchema` / `PipelineOutput` from `../schemas/director-schema.js`.
  - [x] 1.3 Export `writePipelineOutput(output: PipelineOutput, outputFile: string): Promise<void>`.
  - [x] 1.4 Validate with `PipelineOutputSchema.parse(output)` immediately before serialization; do not trust caller-side typing alone.
  - [x] 1.5 Ensure the parent directory exists with `await mkdir(dirname(outputFile), { recursive: true })`.
  - [x] 1.6 Write `JSON.stringify(validatedOutput, null, 2) + '\n'` using UTF-8.
- [x] Task 2: Add focused tests (AC: #1, #2, #3, #4, #5, #6)
  - [x] 2.1 Create `tests/file-system.test.ts`.
  - [x] 2.2 Use a temporary directory under the OS temp location; clean up after each test with `rm(..., { recursive: true, force: true })`.
  - [x] 2.3 Test writing a valid `PipelineOutput` and reading it back with `JSON.parse`.
  - [x] 2.4 Assert the serialized output preserves exact `snake_case` keys: `source_filename`, `company_name`, `stock_ticker`, `director_name`, `change_type`, `effective_date`, `reason_stated`, `extraction_confidence`, `total_documents_processed`, `director_change_documents_identified`, `total_director_changes_extracted`, `documents_that_failed_processing`.
  - [x] 2.5 Assert nullable fields are written as `null`.
  - [x] 2.6 Assert nested parent directories are created automatically.
  - [x] 2.7 Assert invalid output rejects and does not create the target file.
- [x] Task 3: Verify the implementation (AC: #6)
  - [x] 3.1 Run `npm test`.
  - [x] 3.2 Run `npx tsc --noEmit`.
  - [x] 3.3 Confirm no existing schema, parser, or LLM client tests regress.

### Review Findings

- [x] [Review][Patch] Non-Atomic Write & Corruption Risk [src/lib/file-system.ts:12]
- [x] [Review][Patch] File/Directory Type Collisions [src/lib/file-system.ts:11]
- [x] [Review][Patch] Leaky Test State in `tests/file-system.test.ts` [tests/file-system.test.ts:31]
- [x] [Review][Patch] Lazy Test Assertions [tests/file-system.test.ts:119]
- [x] [Review][Patch] Sloppy Copy-Paste Artifacts [tests/file-system.test.ts:33]
- [x] [Review][Defer] Concurrency & File Locking [src/lib/file-system.ts:12] — deferred, pre-existing
- [x] [Review][Defer] I/O Coupling to Schema [src/lib/file-system.ts:7] — deferred, pre-existing
- [x] [Review][Defer] Error Enrichment [src/lib/file-system.ts:12] — deferred, pre-existing

## Dev Notes

### Scope Boundary

This story creates the JSON writer utility only. It must NOT implement:

- CLI directory scanning or argument changes beyond what already exists (Story 2.1 owns batch input handling).
- `p-limit` concurrency loops or multi-file orchestration (Story 2.2).
- Dead Letter Queue exception trapping (Story 2.3).
- LLM retry/backoff or `AbortController` timeout behavior (Story 2.4).
- Operational summary calculation logic beyond accepting a validated `summary` object (Story 2.5 owns metrics generation).
- Any changes to the LLM prompt or OpenRouter client.

The writer should be deterministic and boring: validate the final object, create the destination directory, write pretty JSON.

### Required Output Contract

Use the existing `PipelineOutputSchema` as the single source of truth. The output object shape is:

```typescript
{
  extractions: DirectorExtraction[];
  summary: {
    total_documents_processed: number;
    director_change_documents_identified: number;
    total_director_changes_extracted: number;
    documents_that_failed_processing: string[];
  };
}
```

Each extraction must include:

```typescript
{
  source_filename: string;
  company_name: string;
  stock_ticker: string | null;
  director_name: string;
  change_type: "appointment" | "resignation" | "removal";
  effective_date: string | null; // YYYY-MM-DD when present
  reason_stated: string | null;
  extraction_confidence: "high" | "medium" | "low";
}
```

Do not transform key names during writing. The schema already defines the correct `snake_case` contract.

### Current Repo State

- `package.json` is ESM with `"type": "module"`.
- TypeScript uses `module: "NodeNext"` and requires `.js` import specifiers in local TypeScript imports.
- Existing source files:
  - `src/schemas/director-schema.ts` exports `DirectorChangeSchema`, `DirectorExtractionSchema`, `ExtractionSummarySchema`, `PipelineOutputSchema`, and inferred types.
  - `src/lib/pdf-parser.ts` parses one PDF path to raw text and preserves primary parser errors over cleanup errors.
  - `src/lib/llm-client.ts` returns `DirectorChange[]` without `source_filename`; the future pipeline will add file provenance before writing.
  - `src/pipeline.ts` is still a stub. Do not turn it into a batch orchestrator in this story.
  - `src/lib/file-system.ts` does not exist yet.
- Existing tests:
  - `tests/schemas.test.ts` verifies schema coercion, enum enforcement, date formatting, summary validation, and full `PipelineOutputSchema`.
  - `tests/pdf-parser.test.ts` verifies the parser with a committed fixture and error behavior.
  - `tests/llm-client.test.ts` verifies mocked Instructor behavior and schema response model configuration.

### Implementation Guidance

Recommended implementation:

```typescript
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PipelineOutputSchema, type PipelineOutput } from '../schemas/director-schema.js';

export async function writePipelineOutput(
  output: PipelineOutput,
  outputFile: string,
): Promise<void> {
  const validatedOutput = PipelineOutputSchema.parse(output);
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(validatedOutput, null, 2)}\n`, 'utf8');
}
```

Rationale:

- Runtime validation catches malformed data even when a caller uses `as PipelineOutput` or passes untyped JSON.
- Formatting with two spaces makes the take-home output easy to inspect.
- A trailing newline keeps generated JSON friendly to CLI tooling and git diffs.
- Parent directory creation keeps `--output ./dist/output.json` or temp test paths from failing for avoidable reasons.

### Testing Guidance

Use real file-system tests rather than mocks. This utility's behavior is the file write.

Suggested imports:

```typescript
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writePipelineOutput } from '../src/lib/file-system.js';
```

Test invalid output by passing a deliberately malformed object through an `unknown as PipelineOutput` cast, then assert the promise rejects and `stat(outputFile)` also rejects. Do not weaken the production function signature to accept `unknown`; keep the API typed for normal callers and rely on runtime schema validation internally.

### Architecture Compliance

- `src/lib/file-system.ts` belongs in `src/lib/` per the architecture's utility boundary.
- The file-system utility should not know about PDFs, LLMs, OpenRouter, `p-limit`, Commander, DLQ construction, or batch progress logging.
- The writer should consume a final output object only; upstream code remains responsible for parsing PDFs, extracting director changes, adding `source_filename`, and computing summary metrics.
- No new dependencies are required. Use Node built-ins and existing Zod schemas.
- Keep code ESM-only. Do not use `require()` or `module.exports`.

### Previous Story Intelligence

From Story 1.4:

- `extractDirectorChanges(text: string)` returns `DirectorChange[]` without `source_filename`; the pipeline later combines each change with its file name to form `DirectorExtraction[]`.
- `src/cli.ts` already imports `dotenv/config` first. Do not move secret loading into lib modules.
- The LLM client intentionally propagates API errors; DLQ handling is deferred to Epic 2.
- Full suite after Story 1.4: 52 tests passing, zero type errors.

From Story 1.3:

- Tests use committed fixtures and real I/O where behavior depends on file handling.
- Preserve primary errors rather than hiding them behind cleanup or wrapper failures.

From Story 1.2:

- Zod remains `3.25.76` in the installed dependency tree for Instructor compatibility. Do not upgrade to Zod v4 for this story even though newer Zod versions exist.
- `.js` import specifiers are required in test files and source imports because the project uses NodeNext.
- Schema coercion for `""`, `"N/A"`, and `"n/a"` to `null` already exists. Do not duplicate it in the writer.

From recent git history:

- `7acd36f feat(llm): implement director event extraction with instructor and gpt-4o-mini`
- `0b4cbaa feat(ingestion): implement local PDF-to-text parser utility`
- `83c2a33 feat(schemas): implement director extraction schemas with zod validation`
- `aa4cab8 build: initialize minimal TypeScript CLI project scaffold`
- Existing commit style is conventional commits: `type(scope): description`.

### Library / Version Reference

Installed versions from `package.json`:

| Package | Installed Version | Story Relevance |
|---|---:|---|
| `zod` | `^3.25.76` | Use existing schemas; do not upgrade. |
| `@instructor-ai/instructor` | `^1.7.0` | Prior story dependency; no changes here. |
| `openai` | `^6.37.0` | Prior story dependency; no changes here. |
| `vitest` | `^4.1.5` | Use for new tests. |
| `typescript` | `^6.0.3` | Verify with `npx tsc --noEmit`. |

External package references checked during story creation:

- npm shows `@instructor-ai/instructor` usage with `Instructor({ client, mode: "TOOLS" })`, matching Story 1.4's implementation.
- npm/package listings indicate Zod has newer major versions than the project uses. This story must retain project compatibility with `@instructor-ai/instructor@1.7.0` and existing Zod v3 schemas instead of upgrading.

### Anti-Patterns to Avoid

- Do not hand-build JSON with string concatenation.
- Do not rename keys to camelCase or change schema fields.
- Do not omit `null` fields to make the JSON smaller.
- Do not write invalid output and rely on downstream consumers to catch it.
- Do not catch and suppress write errors. Let permission/path/disk errors reject so the caller can route them in later DLQ work.
- Do not implement pipeline orchestration inside `file-system.ts`.
- Do not add new dependencies for a simple JSON write.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5] - story statement and acceptance criteria.
- [Source: _bmad-output/planning-artifacts/prd.md#FR16] - final output must be written to a single local JSON file.
- [Source: _bmad-output/planning-artifacts/prd.md#Interface & Schema Specification] - required `extractions` and `summary` JSON shape.
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries] - `src/lib/file-system.ts` owns JSON/PDF read/write utilities.
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Flow] - full array is written through `file-system.ts` to `output.json`.
- [Source: src/schemas/director-schema.ts] - current Zod schema contract and inferred types.
- [Source: _bmad-output/implementation-artifacts/1-4-extract-director-events-via-llm.md] - previous story learnings and current LLM boundary.

## Dev Agent Record

### Agent Model Used

GPT-5

### Implementation Plan

- Add a narrow `src/lib/file-system.ts` writer that validates `PipelineOutput` with the existing Zod schema immediately before serialization.
- Cover the writer with real file-system tests for formatted JSON, `snake_case` keys, explicit nulls, parent directory creation, and invalid-output rejection.
- Keep pipeline orchestration, DLQ construction, metrics calculation, and CLI changes out of scope for this story.

### Debug Log References

- RED: `npm.cmd test -- tests/file-system.test.ts` failed because `../src/lib/file-system.js` did not exist.
- GREEN: `npm.cmd test -- tests/file-system.test.ts` passed after adding `writePipelineOutput`.
- Regression: `npm.cmd test` passed with 57 tests.
- Type check: `npx.cmd tsc --noEmit` passed with zero errors.
- Review patch validation: `npm.cmd test -- tests/file-system.test.ts` passed with 8 tests.
- Review patch regression: `npm.cmd test` passed with 60 tests.
- Review patch type check: `npx.cmd tsc --noEmit` passed with zero errors.

### Completion Notes List

- Created `writePipelineOutput(output, outputFile)` in `src/lib/file-system.ts`.
- The writer validates via `PipelineOutputSchema.parse(output)`, creates missing parent directories, and writes UTF-8 pretty JSON with a trailing newline.
- Added `tests/file-system.test.ts` covering valid writes, exact `snake_case` contract, explicit `null` values, nested directories, and invalid output rejection before file creation.
- Full validation passed: 5 test files, 57 tests, zero TypeScript errors.
- Resolved review patch: writer now serializes to a same-directory temporary file and renames it into place to avoid partial final-file writes.
- Resolved review patch: writer now explicitly rejects output path collisions where the parent path is not a directory or the target path is already a directory.
- Resolved review patch: tests now track all temporary directories, use clearer output-path helpers, assert `Stats.isFile()` directly, and cover collision/atomic-write behavior.
- Review patch validation passed: 5 test files, 60 tests, zero TypeScript errors.

### File List

- `src/lib/file-system.ts` (new)
- `tests/file-system.test.ts` (new)
- `_bmad-output/implementation-artifacts/1-5-write-extracted-data-to-json.md` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

### Change Log

- 2026-05-11: Implemented validated JSON output writer and focused file-system test suite. Story moved to review.
- 2026-05-11: Applied five review patches for atomic writes, path collision handling, and stronger file-system tests.
