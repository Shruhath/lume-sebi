# Story 1.2: Define Director Extraction Zod Schemas

Status: done

## Story

As a risk analyst,
I want the system to strictly validate the data structures using Zod with null-coercion,
so that I am guaranteed to receive clean data perfectly aligned with Sapiensu's upstream database.

## Acceptance Criteria

1. **Given** the Sapiensu JSON specification **When** the `src/schemas/director-schema.ts` file is created **Then** it must define a schema that coerces empty strings (`""` or `"N/A"`) to `null` for optional fields (`stock_ticker`, `effective_date`, `reason_stated`).
2. **Given** the schema file exists **When** enum fields are validated **Then** `change_type` must be strictly enforced as enum `["appointment", "resignation", "removal"]` **And** `extraction_confidence` must be strictly enforced as enum `["high", "medium", "low"]`.
3. **Given** the schema file exists **When** `npm test` is run **Then** a Vitest test suite in `tests/schemas.test.ts` must successfully validate the coercion logic, enum enforcement, date format validation, and both valid and invalid input cases.

## Tasks / Subtasks

- [x] Task 1: Define null-coercion preprocess helpers (AC: #1)
  - [x] 1.1 Create `z.preprocess()` helper that coerces `""`, `"N/A"`, `"n/a"` → `null`
  - [x] 1.2 Create date-specific coercion helper that also validates `YYYY-MM-DD` format
- [x] Task 2: Define DirectorChangeSchema (AC: #1, #2)
  - [x] 2.1 Define all 7 fields with correct types, coercion, and `.describe()` annotations
  - [x] 2.2 Export inferred TypeScript type `DirectorChange`
- [x] Task 3: Define DirectorExtractionSchema (AC: #1)
  - [x] 3.1 Extend DirectorChangeSchema by adding `source_filename: z.string()` for final output rows
  - [x] 3.2 Export inferred TypeScript type `DirectorExtraction`
- [x] Task 4: Define ExtractionSummarySchema (AC: #1)
  - [x] 4.1 Define summary metrics: `total_documents_processed`, `director_change_documents_identified`, `total_director_changes_extracted`, `documents_that_failed_processing`
  - [x] 4.2 Export inferred TypeScript type `ExtractionSummary`
- [x] Task 5: Define PipelineOutputSchema (AC: #1)
  - [x] 5.1 Compose `{ extractions: DirectorExtractionSchema[], summary: ExtractionSummarySchema }`
  - [x] 5.2 Export inferred TypeScript type `PipelineOutput`
- [x] Task 6: Write Vitest test suite (AC: #3)
  - [x] 6.1 Create `tests/schemas.test.ts`
  - [x] 6.2 Test empty string `""` → `null` coercion for `stock_ticker`, `effective_date`, `reason_stated`
  - [x] 6.3 Test `"N/A"` → `null` coercion for same fields
  - [x] 6.4 Test valid enum values accepted for `change_type` and `extraction_confidence`
  - [x] 6.5 Test invalid enum values rejected
  - [x] 6.6 Test `YYYY-MM-DD` date format enforcement on `effective_date`
  - [x] 6.7 Test invalid date formats rejected (e.g., `"May 2026"`, `"2026/05/11"`)
  - [x] 6.8 Test valid complete DirectorChange object passes
  - [x] 6.9 Test required fields (company_name, director_name) are enforced (missing → error)
  - [x] 6.10 Test ExtractionSummarySchema validates correct structure
  - [x] 6.11 Test PipelineOutputSchema validates complete output
  - [x] 6.12 Run `npm test` and confirm all tests pass

## Dev Notes

### Critical: Zod Version is v3, NOT v4

The architecture doc specifies Zod v4.4.3, but the project has `zod@3.25.76` installed. This happened because `@instructor-ai/instructor@1.7.0` has a peer dependency on `zod-stream@3.0.0` which requires Zod v3. **Use Zod v3 API exclusively.** All needed features (`.transform()`, `.preprocess()`, `.nullable()`, `.describe()`, enums) are fully available in v3.

```typescript
import { z } from 'zod';  // This imports Zod v3 API
```

### Schema Architecture: Four Schemas, Two Purposes

The file must define schemas for two distinct purposes:

**1. LLM Response Model (Instructor):** `DirectorChangeSchema` — what the LLM extracts per director change event. Does NOT include `source_filename` because the LLM doesn't know the filename; the pipeline injects it afterward. This schema will be used as Instructor's `response_model` in Story 1.4.

**2. Final Output Validation:** `DirectorExtractionSchema`, `ExtractionSummarySchema`, `PipelineOutputSchema` — validate the complete `output.json` structure after the pipeline adds metadata.

```
Data flow (Story 1.4 context):
  PDF text → Instructor(DirectorChangeSchema) → LLM returns DirectorChange[]
  Pipeline adds source_filename → DirectorExtraction[]
  Pipeline computes summary → ExtractionSummary
  Final: PipelineOutputSchema.parse({ extractions, summary }) → output.json
```

### Null Coercion Pattern (Mandatory)

Use `z.preprocess()` to coerce BEFORE validation. This is critical because `.transform()` runs AFTER parsing, so `"N/A"` on a date field would fail the regex before coercion. The correct pattern:

```typescript
const coercibleNullableString = () => z.preprocess(
  (val) => (val === "" || val === "N/A" || val === "n/a") ? null : val,
  z.string().nullable()
);

const coercibleNullableDate = () => z.preprocess(
  (val) => (val === "" || val === "N/A" || val === "n/a") ? null : val,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format").nullable()
);
```

### Instructor Compatibility: `.describe()` is Required

Instructor uses Zod's `.describe()` annotations to generate the LLM function call definition. Every field in `DirectorChangeSchema` MUST have a `.describe()` that tells the LLM what to extract. These descriptions directly affect extraction quality.

```typescript
// Instructor reads .describe() to build the function schema for the LLM
company_name: z.string().describe("The full legal name of the company"),
```

### Exact Field Specification (from PRD)

**DirectorChangeSchema** (7 fields — LLM response model):

| Field | Zod Type | Coercion | Notes |
|-------|----------|----------|-------|
| `company_name` | `z.string()` | No | Required. Full legal company name |
| `stock_ticker` | coercibleNullableString | `""` / `"N/A"` → `null` | BSE/NSE ticker symbol, null if not found |
| `director_name` | `z.string()` | No | Required. Full name of the director |
| `change_type` | `z.enum(["appointment", "resignation", "removal"])` | No | Strict enum, no other values |
| `effective_date` | coercibleNullableDate | `""` / `"N/A"` → `null` | YYYY-MM-DD or null |
| `reason_stated` | coercibleNullableString | `""` / `"N/A"` → `null` | Reason from filing, null if none |
| `extraction_confidence` | `z.enum(["high", "medium", "low"])` | No | Based on text clarity |

**DirectorExtractionSchema** (8 fields — output row):
- All of DirectorChangeSchema fields PLUS:
- `source_filename`: `z.string()` — the PDF filename, injected by pipeline

**ExtractionSummarySchema** (4 fields):

| Field | Zod Type | Notes |
|-------|----------|-------|
| `total_documents_processed` | `z.number().int().nonnegative()` | Total PDFs attempted |
| `director_change_documents_identified` | `z.number().int().nonnegative()` | PDFs with at least one change |
| `total_director_changes_extracted` | `z.number().int().nonnegative()` | Sum of all changes |
| `documents_that_failed_processing` | `z.array(z.string())` | The DLQ filenames |

**PipelineOutputSchema:**
- `extractions`: `z.array(DirectorExtractionSchema)`
- `summary`: `ExtractionSummarySchema`

### JSON Output Key Convention

All schema field names MUST use `snake_case` to match the Sapiensu upstream database specification. TypeScript inferred types will also use snake_case (e.g., `DirectorChange["company_name"]`).

### Naming Conventions (Mandatory)

- **File:** `src/schemas/director-schema.ts` (kebab-case)
- **Schema exports:** `DirectorChangeSchema`, `DirectorExtractionSchema`, `ExtractionSummarySchema`, `PipelineOutputSchema` (PascalCase + Schema suffix)
- **Type exports:** `DirectorChange`, `DirectorExtraction`, `ExtractionSummary`, `PipelineOutput` (PascalCase, no suffix)
- **Test file:** `tests/schemas.test.ts`

### Testing Pattern (from Story 1.1)

Tests use Vitest with `globals: true` — `describe`, `it`, `expect` are globally available (no import needed from vitest). BUT the existing smoke test imports them explicitly, so follow that pattern for consistency:

```typescript
import { describe, it, expect } from 'vitest';
```

Use `import '../src/schemas/director-schema.js'` with `.js` extension per NodeNext module resolution. Test file is at `tests/schemas.test.ts` (root-level tests/ directory, NOT co-located).

### Previous Story Intelligence (Story 1.1)

- ESM project with `"type": "module"` in package.json — all imports must use ESM syntax
- NodeNext module resolution: imports must use `.js` extension even for `.ts` files
- Vitest configured with `globals: true` and `setupFiles: ['./tests/setup.ts']`
- Review finding addressed: `.gitignore` now has `!tests/fixtures/*.pdf` negation for Story 1.3

### Anti-Patterns to Avoid

- **DO NOT** use Zod v4 API (e.g., `z.globalRegistry`) — project runs Zod v3.25.76
- **DO NOT** use `.transform()` for coercion where `.preprocess()` is needed — transforms run after validation, so `"N/A"` would fail a regex check before being coerced
- **DO NOT** include `source_filename` in `DirectorChangeSchema` — the LLM doesn't know filenames; the pipeline adds them
- **DO NOT** use CommonJS syntax (`require`/`module.exports`)
- **DO NOT** add PDF parsing, LLM calls, or file I/O logic — this story is schemas and tests only
- **DO NOT** use `z.object().extend()` if you can use spread or `z.object({ ...SchemaA.shape, extraField: ... })` — both work in Zod v3, pick the clearest approach
- **DO NOT** put test files in `src/` — tests live in `tests/` at root

### Project Structure Notes

- Schema file goes in existing empty `src/schemas/` directory (created in Story 1.1)
- Test file goes in existing `tests/` directory alongside `smoke.test.ts`
- No new directories needed
- Alignment with architecture: `src/schemas/director-schema.ts` matches architecture spec exactly

### References

- [Source: _bmad-output/planning-artifacts/prd.md#Interface & Schema Specification] — exact output JSON schema
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — Zod isolation mandate
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns] — snake_case JSON, PascalCase schemas
- [Source: _bmad-output/planning-artifacts/architecture.md#Format Patterns] — null coercion and date format requirements
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2] — acceptance criteria
- [Source: _bmad-output/implementation-artifacts/1-1-initialize-minimal-typescript-cli-project.md#Completion Notes] — Zod v3.25.76 resolved, ESM config
- [Source: node_modules/@instructor-ai/instructor/README.md] — response_model uses `{ schema: ZodSchema, name: "Name" }` pattern

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6-thinking)

### Debug Log References

No issues encountered during implementation.

### Completion Notes List

- Created `src/schemas/director-schema.ts` with four schemas: `DirectorChangeSchema` (LLM response model, 7 fields), `DirectorExtractionSchema` (output row with `source_filename`), `ExtractionSummarySchema` (DLQ + metrics), and `PipelineOutputSchema` (complete output wrapper)
- Null coercion uses `z.preprocess()` to coerce `""`, `"N/A"`, `"n/a"` → `null` BEFORE validation, preventing regex failures on date fields
- Date validation enforces strict `YYYY-MM-DD` via regex on `effective_date`
- All `.describe()` annotations added to `DirectorChangeSchema` fields for Instructor compatibility in Story 1.4
- `DirectorExtractionSchema` extends `DirectorChangeSchema` via spread of `.shape` to add `source_filename`
- Uses Zod v3 API exclusively (project has `zod@3.25.76`)
- Test suite: 33 new tests across 5 describe blocks covering coercion, enums, date format, required fields, summary, and pipeline output validation
- Full regression: 35 tests pass (2 smoke + 33 schema), 0 failures, 376ms

### Review Findings

- [x] [Review][Defer] Date regex accepts semantically invalid dates [src/schemas/director-schema.ts:10] — deferred, pre-existing. Regex `/^\d{4}-\d{2}-\d{2}$/` validates format but not calendar validity (e.g., `"2026-13-45"` passes). Spec requires format validation only; calendar validation is an enhancement for a future story.
- [x] [Review][Defer] Required string fields accept empty/whitespace-only strings [src/schemas/director-schema.ts:14,16,26] — deferred, pre-existing. `company_name`, `director_name`, and `source_filename` use `z.string()` without `.min(1)`, so `""` or `"   "` would pass. Spec defines these as `z.string()` without minimum length constraints; adding `.min(1)` is an enhancement.

### File List

- src/schemas/director-schema.ts (new)
- tests/schemas.test.ts (new)
