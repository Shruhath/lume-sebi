# Story 2.1: CLI Batch Argument Ingestion

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an engineer,
I want the pipeline to accept a directory path via CLI arguments,
so that I can point it at any folder of PDF filings to begin batch processing.

## Acceptance Criteria

1. **Given** the CLI command `npx tsx src/cli.ts --input ./pdfs --output ./output.json` **When** the script is executed **Then** it must successfully read the directory and load all `.pdf` file paths into an array for processing.
2. **Given** the `--input` argument points to a non-existent path **When** the script is executed **Then** it must exit with a non-zero exit code and print a clear error message to stderr.
3. **Given** the `--input` argument points to a file (not a directory) **When** the script is executed **Then** it must exit with a non-zero exit code and print a clear error message to stderr.
4. **Given** the `--input` directory exists but contains zero `.pdf` files **When** the script is executed **Then** it must exit with a non-zero exit code and print a warning to stderr.
5. **Given** the `--input` directory contains a mix of `.pdf` and non-PDF files **When** the script is executed **Then** it must load only `.pdf` file paths (case-insensitive extension match) and ignore other file types.
6. **Given** `npm test` and `npx tsc --noEmit` are run **When** implementation is complete **Then** all existing tests plus new CLI tests must pass with zero type errors.

## Tasks / Subtasks

- [x] Task 1: Refactor `cli.ts` to async `main()` function (AC: #1, #2, #3, #4)
  - [x] 1.1 Wrap existing Commander setup and all new logic inside an `async function main(): Promise<void>`.
  - [x] 1.2 Call `main()` at module scope and attach `.catch()` to log errors and exit with code 1.
  - [x] 1.3 Keep `import 'dotenv/config'` as the first import.
- [x] Task 2: Add directory validation and PDF discovery (AC: #1, #2, #3, #4, #5)
  - [x] 2.1 After `program.parse()`, validate `opts.input` exists using `stat()` from `node:fs/promises`.
  - [x] 2.2 Validate `opts.input` is a directory with `stats.isDirectory()`.
  - [x] 2.3 Read directory contents with `readdir()` and filter to `.pdf` extension (case-insensitive: `.pdf`, `.PDF`, `.Pdf`).
  - [x] 2.4 Build full file paths using `path.resolve(opts.input, filename)` for each matched PDF.
  - [x] 2.5 If zero PDFs found, print warning to stderr and exit with code 1.
  - [x] 2.6 Log the count of discovered PDF files to stdout (e.g., `Found 49 PDF files in ./pdfs`).
- [x] Task 3: Update `pipeline.ts` signature and wire CLI (AC: #1)
  - [x] 3.1 Change `runPipeline` signature from `(inputDir: string, outputFile: string)` to `(pdfPaths: string[], outputFile: string)`.
  - [x] 3.2 Keep `runPipeline` as a stub that logs the count of received paths. Do NOT implement batch orchestration (Story 2.2).
  - [x] 3.3 In `cli.ts`, import `runPipeline` from `./pipeline.js` and call it with the discovered PDF paths and `opts.output`.
- [x] Task 4: Add focused CLI tests (AC: #1, #2, #3, #4, #5, #6)
  - [x] 4.1 Create `tests/cli.test.ts`.
  - [x] 4.2 Test: valid directory with PDFs returns the correct array of absolute `.pdf` paths.
  - [x] 4.3 Test: non-existent directory throws/rejects with a clear error.
  - [x] 4.4 Test: path pointing to a file (not directory) throws/rejects with a clear error.
  - [x] 4.5 Test: empty directory (no PDFs) throws/rejects with a clear warning.
  - [x] 4.6 Test: mixed file types only returns `.pdf` files.
  - [x] 4.7 Test: case-insensitive `.PDF` extension matching.
  - [x] 4.8 Use temp directories with real files; clean up after each test.
- [x] Task 5: Verify implementation (AC: #6)
  - [x] 5.1 Run `npm test`.
  - [x] 5.2 Run `npx tsc --noEmit`.
  - [x] 5.3 Confirm no existing tests regress (schemas, pdf-parser, llm-client, file-system, e2e-poc).

### Review Findings

- [x] [Review][Patch] Directory entries named `.pdf` are accepted as PDF files [src/cli.ts:20]
- [x] [Review][Patch] CLI exit code and stderr behavior are not tested through the executable path [tests/cli.test.ts:38]
- [x] [Review][Patch] Empty-directory stderr does not clearly print a warning [src/cli.ts:25]
- [x] [Review][Patch] Non-ENOENT filesystem errors are reported as missing directories [src/cli.ts:10]
- [x] [Review][Patch] Unrelated `e2e-output.json` drift is included in the story diff [e2e-output.json:4]

## Dev Notes

### Scope Boundary

This story implements CLI argument validation and PDF file discovery ONLY. It must NOT implement:

- `p-limit` concurrency loops or chunked batch processing (Story 2.2).
- Dead Letter Queue exception trapping (Story 2.3).
- LLM retry/backoff or `AbortController` timeout behavior (Story 2.4).
- Operational summary metrics calculation (Story 2.5).
- Any changes to the LLM prompt, Instructor client, or Zod schemas.

The pipeline stub remains a stub. This story wires CLI arguments to the pipeline entry point, passes it a resolved array of PDF paths, and validates the input directory.

### Current Repo State

- `package.json` is ESM with `"type": "module"`.
- TypeScript uses `module: "NodeNext"` and requires `.js` import specifiers in local imports.
- `tsconfig.json` excludes `tests/` — Vitest handles test transpilation independently.
- Existing source files:
  - `src/cli.ts` — has Commander setup with `--input <dir>` (required) and `--output <file>` (default `./output.json`). Currently just logs options. Executes `program.parse()` at module scope.
  - `src/pipeline.ts` — stub: `runPipeline(inputDir: string, outputFile: string)` that logs a message.
  - `src/schemas/director-schema.ts` — Zod schemas and types, unchanged by this story.
  - `src/lib/pdf-parser.ts` — PDF-to-text parser, unchanged by this story.
  - `src/lib/llm-client.ts` — Instructor LLM client, unchanged by this story.
  - `src/lib/file-system.ts` — validated JSON writer, unchanged by this story.
- Existing test files: `tests/schemas.test.ts`, `tests/pdf-parser.test.ts`, `tests/llm-client.test.ts`, `tests/file-system.test.ts`, `tests/e2e-poc.test.ts`, `tests/smoke.test.ts`.
- Current test count: 60 tests across 5 active test files, zero type errors.

### Deferred Work Resolution

The deferred work log flags: "CLI executes side effects at module scope — refactor to `main()` function when CLI gains real logic." This story is where that refactoring happens. Wrap all CLI logic in `async function main()` and call it at the bottom of the file.

### Implementation Guidance

**`src/cli.ts` refactored structure:**

```typescript
import 'dotenv/config';
import { Command } from 'commander';
import { readdir, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { runPipeline } from './pipeline.js';

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('lume-sebi')
    .description('Director Change ETL Pipeline — extracts board director events from regulatory PDFs')
    .requiredOption('--input <dir>', 'Input directory containing PDF files')
    .option('--output <file>', 'Output JSON file path', './output.json');

  program.parse();
  const opts = program.opts<{ input: string; output: string }>();

  // Validate input directory exists and is a directory
  // Read directory, filter .pdf (case-insensitive), build absolute paths
  // Validate at least one PDF found
  // Call runPipeline(pdfPaths, opts.output)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

**`src/pipeline.ts` updated signature:**

```typescript
export async function runPipeline(pdfPaths: string[], outputFile: string): Promise<void> {
  console.log(`Pipeline stub: received ${pdfPaths.length} PDF paths -> ${outputFile}`);
}
```

**Testing approach:** Extract the directory validation and PDF discovery into a testable helper function (e.g., `discoverPdfFiles(inputDir: string): Promise<string[]>`) exported from `cli.ts` or a new utility. This avoids testing the full Commander parse flow and focuses on the directory scanning logic. Tests must use real temporary directories with real files (even empty `.pdf` files) — no mocking `fs`.

**PDF extension matching:** Use case-insensitive comparison: `extname(filename).toLowerCase() === '.pdf'`.

**Error output:** Use `console.error()` for errors/warnings (writes to stderr). Use `process.exit(1)` for non-zero exit on validation failures. Throw typed errors from the helper function; let `main().catch()` handle exit codes.

### Testing Guidance

```typescript
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverPdfFiles } from '../src/cli.js'; // or wherever the helper lives
```

Create temp directories with `mkdtemp(join(tmpdir(), 'cli-test-'))`. Create empty `.pdf` files with `writeFile(join(dir, 'test.pdf'), '')`. Clean up in `afterEach`.

### Architecture Compliance

- `src/cli.ts` remains the sole entry point and argument parser per the architecture.
- `src/pipeline.ts` remains the orchestration boundary. The CLI hands off a resolved array of paths — it does not loop over files itself.
- No new dependencies required. Use only Node built-ins (`node:fs/promises`, `node:path`) and the existing `commander` package.
- Keep code ESM-only. Use `.js` import specifiers for local imports.
- File naming: `kebab-case` per architecture conventions.
- Function naming: `camelCase` per architecture conventions.

### Previous Story Intelligence

From Story 1.5:

- `writePipelineOutput` validates via `PipelineOutputSchema.parse()`, creates missing parent dirs, and writes atomic UTF-8 JSON. No changes needed for this story.
- Review patches added atomic writes (temp file + rename) and path collision detection.
- Full test count after 1.5: 60 tests, zero type errors.

From Story 1.4:

- `extractDirectorChanges(text)` returns `DirectorChange[]` without `source_filename`. The pipeline adds file provenance.
- `dotenv/config` must remain the first import in `cli.ts`.
- LLM client intentionally propagates API errors; DLQ handling is deferred to Story 2.3.

From Story 1.2:

- Zod remains `3.25.76` — do not upgrade.
- `.js` import specifiers required for all local imports.

From git history:

- Commit style: conventional commits `type(scope): description`.
- Latest commit `eb7c600` added the e2e-poc test showing the full data flow pattern.

### Library / Version Reference

| Package | Installed Version | Story Relevance |
|---|---:|---|
| `commander` | `^14.0.3` | Already set up in `cli.ts`. Add validation logic after `program.parse()`. |
| `p-limit` | `^7.3.0` | Do NOT use in this story. Story 2.2 owns concurrency. |
| `vitest` | `^4.1.5` | Use for new tests. |
| `typescript` | `^6.0.3` | Verify with `npx tsc --noEmit`. |

### Anti-Patterns to Avoid

- Do not implement batch processing, concurrency, or `p-limit` usage — that's Story 2.2.
- Do not implement `try/catch` DLQ trapping around file processing — that's Story 2.3.
- Do not implement LLM retry logic or `AbortController` — that's Story 2.4.
- Do not implement metrics/summary generation — that's Story 2.5.
- Do not read or parse PDF contents — only discover PDF file paths.
- Do not use synchronous `fs` methods (`readdirSync`, `statSync`).
- Do not use glob libraries for simple directory listing — `readdir` + filter is sufficient.
- Do not leave `program.parse()` executing side effects at module scope — wrap in `main()`.
- Do not use `require()` or `module.exports`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1] — story statement and acceptance criteria.
- [Source: _bmad-output/planning-artifacts/prd.md#FR1] — ingest a directory of local PDF files via CLI arguments.
- [Source: _bmad-output/planning-artifacts/architecture.md#Code Organization] — `src/cli.ts` is entry point, `src/pipeline.ts` is orchestrator.
- [Source: _bmad-output/planning-artifacts/architecture.md#Component Boundaries] — orchestration boundary in `pipeline.ts`.
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Flow] — CLI -> pipeline -> parser -> LLM -> writer.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — refactor `cli.ts` to `main()` function.
- [Source: _bmad-output/implementation-artifacts/1-5-write-extracted-data-to-json.md#Dev Notes] — current repo state, ESM conventions, test count.
- [Source: src/cli.ts] — current Commander setup with `--input` and `--output`.
- [Source: src/pipeline.ts] — current stub signature.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Implementation Plan

- Refactor `cli.ts` from module-scope side effects to async `main()` with error handling.
- Extract `discoverPdfFiles(inputDir)` as a testable exported helper in `cli.ts` that validates the directory and returns absolute `.pdf` paths.
- Update `pipeline.ts` signature to accept `string[]` instead of `string`.
- Wire `discoverPdfFiles` → `runPipeline` inside `main()`.
- Write focused tests for `discoverPdfFiles` using real temp directories.
- Run full regression suite + type check.

### Debug Log References

- GREEN: `npm test -- tests/cli.test.ts` — 8 tests passed.
- Initial import error: importing `cli.ts` triggered module-level `main()` + `program.parse()`, causing Commander to fail on missing `--input`. Fixed with `import.meta.url` entry-point guard.
- GREEN (post-fix): `npm test -- tests/cli.test.ts` — 8 tests passed, zero unhandled errors.
- Regression: `npm test` — 7 test files, 69 tests passed (60 existing + 8 new CLI + 1 e2e-poc).
- Type check: `npx tsc --noEmit` — zero errors.

### Completion Notes List

- Refactored `src/cli.ts` from module-scope side effects to async `main()` with entry-point guard using `import.meta.url` comparison. Resolves deferred work item from Epic 1 code review.
- Extracted `discoverPdfFiles(inputDir: string): Promise<string[]>` as a testable exported helper that validates the input directory exists and is a directory, reads entries, filters `.pdf` (case-insensitive), and returns absolute paths.
- Updated `runPipeline` signature in `src/pipeline.ts` from `(inputDir, outputFile)` to `(pdfPaths[], outputFile)`. Remains a stub per scope boundary.
- Wired `main()` to call `discoverPdfFiles` → log count → `runPipeline`.
- Created `tests/cli.test.ts` with 8 tests covering: valid dir, non-existent dir, file-not-dir, empty dir, no-PDFs dir, mixed types, case-insensitive extension, non-recursive behavior.
- Full suite: 7 files, 69 tests, zero type errors, zero regressions.

### File List

- `src/cli.ts` (modified)
- `src/pipeline.ts` (modified)
- `tests/cli.test.ts` (new)
- `_bmad-output/implementation-artifacts/2-1-cli-batch-argument-ingestion.md` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

### Change Log

- 2026-05-11: Implemented CLI batch argument ingestion — refactored cli.ts to main(), added discoverPdfFiles helper, updated pipeline.ts signature, added 8 CLI tests. Story moved to review.
