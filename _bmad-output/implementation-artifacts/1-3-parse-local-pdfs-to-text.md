# Story 1.3: Parse Local PDFs to Text

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the data pipeline,
I want to read a specific PDF file and extract its raw textual content,
so that I have the raw data ready to send to the LLM for analysis.

## Acceptance Criteria

1. **Given** a golden PDF fixture in `tests/fixtures/` **When** the `pdf-parser.ts` utility is invoked **Then** it should successfully return the raw text content of the document.
2. **Given** the project uses `pdf-parse@2.4.5` **When** PDF text is extracted **Then** the implementation must use the v2 `PDFParse` class API, not the old v1 default function API.
3. **Given** the parser utility exists **When** `npm test` is run **Then** Vitest tests must verify successful text extraction from a committed fixture PDF and prove parser errors are not swallowed.

## Tasks / Subtasks

- [x] Task 1: Create the PDF parser utility (AC: #1, #2)
  - [x] 1.1 Create `src/lib/pdf-parser.ts`.
  - [x] 1.2 Export `parsePdfToText(filePath: string): Promise<string>`.
  - [x] 1.3 Read local PDF bytes with `node:fs/promises` and pass the buffer to `new PDFParse({ data: buffer })`.
  - [x] 1.4 Call `await parser.getText()` and return `result.text`.
  - [x] 1.5 Ensure `await parser.destroy()` runs in a `finally` block after the parser is created.
- [x] Task 2: Add a golden PDF fixture (AC: #1)
  - [x] 2.1 Add a small valid fixture PDF under `tests/fixtures/`, for example `tests/fixtures/director-appointment.pdf`.
  - [x] 2.2 The fixture text must contain deterministic wording the test can assert, such as a company name and director appointment phrase.
  - [x] 2.3 Do not add production PDFs or generated output files to the repo.
- [x] Task 3: Add parser tests (AC: #1, #3)
  - [x] 3.1 Create `tests/pdf-parser.test.ts`.
  - [x] 3.2 Import the parser with NodeNext-compatible `.js` specifier: `../src/lib/pdf-parser.js`.
  - [x] 3.3 Resolve the fixture path without relying on the current working directory.
  - [x] 3.4 Assert the returned text contains the deterministic fixture phrases.
  - [x] 3.5 Add a negative test for a missing or invalid PDF path and assert the promise rejects.
  - [x] 3.6 Run `npm test` and confirm all tests pass.

### Review Findings

- [x] [Review][Decision][Defer] Empty or whitespace-only extracted text policy is deferred to later pipeline/DLQ stories. Story 1.3 and the architecture define `pdf-parser.ts` as the raw ingestion boundary, so this utility should return parser raw text and allow orchestration to decide whether empty text is a failed document.
- [x] [Review][Decision][Defer] File-size and parse-time guards are deferred to batch/DLQ orchestration. Story 1.3 has no thresholds or timeout behavior, while PRD NFR3 defines timeout behavior for LLM/provider hangs and later stories own file-level DLQ trapping.
- [x] [Review][Patch] Replaced fragile hand-written PDF fixture with a structurally valid generated PDF containing `xref`, `trailer`, and `startxref`. [tests/fixtures/director-appointment.pdf:1]
- [x] [Review][Patch] Preserved the primary parse error if `parser.destroy()` also rejects during cleanup, with regression coverage. [src/lib/pdf-parser.ts:7]

## Dev Notes

### Scope Boundary

This story is only the local PDF-to-text utility. It must not implement CLI directory ingestion, batch orchestration, DLQ routing, LLM extraction, Zod validation, or JSON output writing. Later stories will compose those pieces.

The parser utility should allow errors from `readFile()`, malformed PDFs, or `PDFParse#getText()` to reject naturally. Do not catch and convert them here; Story 2.3 owns file-level DLQ trapping in `processSinglePdf()`.

### Current Repo State

- `package.json` is ESM with `"type": "module"`.
- TypeScript uses `module` and `moduleResolution` set to `NodeNext`.
- Tests live in root-level `tests/`, not under `src/`.
- Existing source files:
  - `src/cli.ts` is a Commander stub.
  - `src/pipeline.ts` is a pipeline stub.
  - `src/schemas/director-schema.ts` contains completed Story 1.2 schemas.
- `tests/fixtures/` exists but is currently empty.
- `.gitignore` ignores `*.pdf` globally but includes `!tests/fixtures/*.pdf`, so committed fixture PDFs under `tests/fixtures/` are allowed.

### Required Parser API

Use this public API shape unless implementation reveals a strong reason to deviate:

```typescript
export async function parsePdfToText(filePath: string): Promise<string> {
  // implementation
}
```

The returned value should be the parser's raw text string, not an LLM-ready cleaned or summarized version. Tests may normalize whitespace before assertions, but the utility should not remove content aggressively.

### pdf-parse v2 Usage

The installed package is `pdf-parse@2.4.5`. It is not the legacy `pdf(buffer)` API from v1. Use the v2 class API:

```typescript
import { readFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';

export async function parsePdfToText(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
```

`pdf-parse@2.4.5` declares Node support for `>=20.16.0 <21 || >=22.3.0`; the local runtime observed during story creation is Node `v24.12.0`, which satisfies the package engine requirement.

### Test Guidance

Use Vitest, matching existing test style:

```typescript
import { describe, it, expect } from 'vitest';
```

Because the project uses NodeNext, imports from test files to TypeScript source must use `.js` extensions, for example:

```typescript
import { parsePdfToText } from '../src/lib/pdf-parser.js';
```

For robust fixture path resolution in ESM tests, prefer `fileURLToPath(import.meta.url)` plus `node:path`:

```typescript
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures', 'director-appointment.pdf');
```

The negative test should assert rejection and should not require DLQ behavior:

```typescript
await expect(parsePdfToText(join(__dirname, 'fixtures', 'missing.pdf'))).rejects.toThrow();
```

### Previous Story Intelligence

Story 1.2 established these constraints:

- Use ESM syntax only; do not use `require()` or `module.exports`.
- Keep file names kebab-case.
- Keep tests in `tests/`.
- Run the full regression with `npm test`.
- Zod remains v3.25.76 because of Instructor dependency compatibility, but this story should not touch schemas.
- Story 1.2 deferred two schema enhancements: semantic date validity and non-empty required strings. Do not include those unrelated schema changes in this parser story.

Story 1.1 established:

- `vitest.config.ts` uses `globals: true` and `setupFiles: ['./tests/setup.ts']`.
- `tsconfig.json` excludes tests from `tsc`, so tests are executed through Vitest/tsx rather than emitted by TypeScript.
- `tests/fixtures/` was intentionally scaffolded for golden PDFs.

### Architecture Compliance

- `src/lib/pdf-parser.ts` is the ingestion boundary. It only converts PDF bytes to raw text.
- It must have no dependency on `src/schemas/director-schema.ts`.
- It must have no dependency on `src/pipeline.ts`, `src/cli.ts`, OpenRouter, Instructor, or `p-limit`.
- It should remain stateless and safe to call repeatedly for future batch processing.

### Anti-Patterns to Avoid

- **DO NOT** use `import pdf from 'pdf-parse'` and call `pdf(buffer)`; that is the old v1 API and will not match the installed v2 package.
- **DO NOT** parse directories in this story; Story 2.1 handles CLI batch argument ingestion.
- **DO NOT** add OCR, screenshots, image extraction, table extraction, or PDF metadata parsing.
- **DO NOT** silently return `""` on parser failure; errors must reject so the future DLQ can record the filename.
- **DO NOT** add LLM prompt logic or director-event classification.
- **DO NOT** make tests depend on external network PDFs.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3] - story statement and acceptance criterion.
- [Source: _bmad-output/planning-artifacts/prd.md#Functional Requirements] - FR3 requires parsing raw text content from PDF documents.
- [Source: _bmad-output/planning-artifacts/architecture.md#Component Boundaries] - `pdf-parser.ts` only returns raw text and has no Zod or LLM knowledge.
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries] - parser belongs in `src/lib/pdf-parser.ts`; tests belong in `tests/`.
- [Source: _bmad-output/implementation-artifacts/1-2-define-director-extraction-zod-schemas.md#Previous Story Intelligence] - ESM, NodeNext, `.js` import specifiers, and fixture `.gitignore` note.
- [Source: node_modules/pdf-parse/README.md#Getting Started with v2] - v2 uses `PDFParse` class and `getText()`.
- [Source: node_modules/pdf-parse/package.json] - installed `pdf-parse@2.4.5`, ESM exports, and Node engine requirements.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npm.cmd test -- tests/pdf-parser.test.ts` - red phase failed before implementation because `src/lib/pdf-parser.ts` did not exist.
- `npm.cmd test -- tests/pdf-parser.test.ts` - parser tests passed after implementation and fixture assertion correction.
- `npm.cmd test` - full regression passed: 3 test files, 39 tests.
- `npx.cmd tsc --noEmit` - initially failed until `tsconfig.json` loaded Node types; passed after config update.

### Completion Notes List

- Added `src/lib/pdf-parser.ts` with `parsePdfToText(filePath)` using `readFile`, `new PDFParse({ data })`, `getText()`, and `destroy()` in a `finally` block.
- Added a committed golden PDF fixture with deterministic director appointment text.
- Added parser tests for successful local PDF text extraction, missing PDF rejection, invalid PDF rejection, and fixture header validation.
- Added `types: ["node"]` to `tsconfig.json` so source files using `node:` imports pass TypeScript checking.
- Addressed review findings: regenerated the fixture as a structurally valid PDF, preserved primary parser errors over cleanup errors, and deferred parser-policy guardrails to later DLQ/batch stories.
- Verified all acceptance criteria with full Vitest regression and TypeScript checking.

### File List

- src/lib/pdf-parser.ts (new)
- tests/pdf-parser.test.ts (new)
- tests/fixtures/director-appointment.pdf (new)
- tests/fixtures/not-a-pdf.txt (new)
- tsconfig.json (modified)

## Change Log

- 2026-05-11: Implemented local PDF-to-text parser utility, golden PDF fixture, parser tests, and Node type-check configuration.
