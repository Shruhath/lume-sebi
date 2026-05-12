# Story 2.4: LLM API Resiliency & Exponential Backoff

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an engineer,
I want the LLM client to automatically retry failed requests due to gateway errors or rate limits,
so that transient network blips from OpenRouter don't artificially inflate our failure metrics.

## Acceptance Criteria

1. **Given** the OpenRouter API returns HTTP `429`, `502`, `503`, or `504` **When** `extractDirectorChanges()` calls the LLM **Then** it must retry with exponential backoff up to a maximum of 3 attempts before rejecting to the caller.
2. **Given** OpenRouter returns a `Retry-After` header on a retryable response **When** the LLM client schedules the next attempt **Then** the client must honor that delay when it can read it from the error object; otherwise it must use the local exponential schedule.
3. **Given** the LLM provider hangs or the request exceeds the configured timeout **When** the timeout fires **Then** the request must be aborted or time bounded at 45-60 seconds and eventually reject so `processSinglePdf()` routes the file to the DLQ.
4. **Given** a non-retryable LLM/client failure such as missing credentials, invalid request shape, moderation, insufficient credits, or Zod validation failure **When** `extractDirectorChanges()` receives that error **Then** it must not waste retry attempts and must reject immediately.
5. **Given** all retry attempts are exhausted **When** `processSinglePdf()` catches the final LLM error **Then** the existing Story 2.3 behavior must remain intact: the parent batch continues, the failed filename appears in `summary.documents_that_failed_processing`, and successful files are still written.
6. **Given** `npm test` and `npx tsc --noEmit` are run **When** implementation is complete **Then** all non-token-consuming tests plus new retry/timeout tests must pass with zero type errors.

## Tasks / Subtasks

- [x] Task 1: Add failing LLM retry tests in `tests/llm-client.test.ts` (AC: #1, #2, #3, #4, #6)
  - [x] 1.1 Use fake timers or an injectable sleep helper so retry tests do not wait real seconds.
  - [x] 1.2 Test `429`, `502`, `503`, and `504` errors retry until a later successful response and return the successful `changes`.
  - [x] 1.3 Test retry exhaustion: three total attempts, then reject with the final error.
  - [x] 1.4 Test a readable `Retry-After` value is preferred over the exponential delay when present.
  - [x] 1.5 Test non-retryable errors reject after one call: missing API key, `400`, `401`, `402`, `403`, and schema/Zod validation errors.
  - [x] 1.6 Test timeout configuration is passed to the OpenAI/Instructor request layer, or test an abortable wrapper if the implementation uses `AbortController`.
- [x] Task 2: Implement retry policy inside `src/lib/llm-client.ts` only (AC: #1, #2, #3, #4)
  - [x] 2.1 Keep `getClient()` as the single OpenRouter/Instructor client factory; do not move OpenRouter calls into `src/pipeline.ts`.
  - [x] 2.2 Add local retry constants: `MAX_LLM_ATTEMPTS = 3`, `LLM_TIMEOUT_MS` within 45-60 seconds, and a small exponential delay schedule suitable for tests.
  - [x] 2.3 Add a narrow `isRetryableLlmError(error)` helper that recognizes status/code `429`, `502`, `503`, and `504`; include `408` only if implementation treats SDK timeout/network timeout as retryable and tests prove the final timeout still DLQs.
  - [x] 2.4 Add a `getRetryAfterMs(error)` helper that can read common SDK/header shapes without throwing if metadata is absent.
  - [x] 2.5 Wrap `client.chat.completions.create(...)` in a retry loop; retry only retryable errors while `attempt < MAX_LLM_ATTEMPTS`.
  - [x] 2.6 Pass the timeout through the OpenAI SDK request options if compatible with Instructor; otherwise enforce a local `AbortController`/race wrapper around the LLM call.
- [x] Task 3: Preserve DLQ and batch orchestration behavior (AC: #5)
  - [x] 3.1 Do not change `ProcessSinglePdfResult`, `runPipeline(pdfPaths, outputFile)`, or `summary.documents_that_failed_processing` shape.
  - [x] 3.2 Keep `processSinglePdf()` as the file-level catch boundary; LLM retry exhaustion should be caught there and converted to `{ success: false, filename, error }`.
  - [x] 3.3 Keep `LLM_CONCURRENCY_LIMIT = 5` and the existing `p-limit` usage so retries do not bypass outbound concurrency throttling.
  - [x] 3.4 Add or extend one pipeline regression test showing an exhausted retry still produces a filename-only DLQ entry while other files succeed.
- [x] Task 4: Guard against over-engineering and incorrect retry scope (AC: #1, #4)
  - [x] 4.1 Do not add BullMQ, Redis, queue workers, `p-queue`, `p-retry`, or any new dependency unless a testable repo-local reason is documented.
  - [x] 4.2 Do not retry Zod validation failures from Instructor response parsing; repeated invalid structured output is a data-quality failure for DLQ, not an API gateway transient.
  - [x] 4.3 Do not retry missing `OPENROUTER_API_KEY`; this is configuration failure and must remain explicit.
  - [x] 4.4 Log retry attempts with minimal diagnostic context only; never log API keys or raw full PDF text.
- [x] Task 5: Verify implementation (AC: #6)
  - [x] 5.1 Run focused tests: `npm.cmd exec -- vitest run tests/llm-client.test.ts tests/pipeline.test.ts`.
  - [x] 5.2 Run the non-token-consuming regression suite used by prior stories; avoid `tests/e2e-poc.test.ts` unless explicitly requested because it may call OpenRouter.
  - [x] 5.3 Run `npx.cmd tsc --noEmit`.
  - [x] 5.4 Update this story's Dev Agent Record with commands, results, completion notes, and file list.

## Dev Notes

### Scope Boundary

This story implements API-level resilience for the LLM client. It must live at the extraction boundary in `src/lib/llm-client.ts`, because that is the only module that knows about OpenRouter, Instructor, and the OpenAI SDK.

This story must NOT implement:

- New queue infrastructure, persistent DLQ storage, BullMQ/Redis, or worker processes.
- Expanded operational metrics beyond the current summary fields; that is Story 2.5.
- Changes to PDF parsing, Zod output schema fields, CLI arguments, or final JSON output shape.
- Retries around corrupted PDFs or local file-system failures; those are not transient OpenRouter failures.

### Current Repo State

- `package.json` is ESM with `"type": "module"` and NodeNext-style `.js` import specifiers.
- Runtime dependencies already include `@instructor-ai/instructor`, `openai`, `p-limit`, `zod`, `pdf-parse`, `dotenv`, and `commander`; do not add retry libraries by default.
- `src/lib/llm-client.ts` currently creates an OpenAI client with `baseURL: 'https://openrouter.ai/api/v1'`, wraps it with Instructor in `TOOLS` mode, and calls `client.chat.completions.create(...)` once.
- `extractDirectorChanges(text)` currently propagates API errors directly. That was correct before Story 2.4; this story changes only retryable transient failures.
- `tests/llm-client.test.ts` already mocks `openai` and `@instructor-ai/instructor` and asserts prompt/model/response_model behavior. Extend this file instead of creating live API tests.
- `src/pipeline.ts` already converts any `extractDirectorChanges()` rejection into `{ success: false, filename, error }` inside `processSinglePdf()`.
- `src/pipeline.ts` currently uses `LLM_CONCURRENCY_LIMIT = 5` and `BATCH_CONCURRENCY_LIMIT = 20`; do not remove either limit.

### Implementation Guidance

Recommended shape in `src/lib/llm-client.ts`:

```typescript
const MAX_LLM_ATTEMPTS = 3;
const LLM_TIMEOUT_MS = 45_000;
const BASE_RETRY_DELAY_MS = 500;

function getErrorStatus(error: unknown): number | undefined {
  // Read common OpenAI/OpenRouter/SDK shapes: error.status, error.code, error.error.code.
}

function isRetryableLlmError(error: unknown): boolean {
  return [429, 502, 503, 504].includes(getErrorStatus(error) ?? 0);
}
```

Keep the public API unchanged:

```typescript
export async function extractDirectorChanges(text: string): Promise<DirectorChange[]> {
  const client = getClient();
  // retry loop wraps only the Instructor/OpenAI request
}
```

Delay handling:

- Attempt count means total tries, not retries. `MAX_LLM_ATTEMPTS = 3` means first call plus at most two retries.
- Prefer `Retry-After` when available and parseable. Treat numeric values as seconds per the HTTP header. If absent or invalid, use exponential delay such as `500ms`, `1000ms`, then fail after the third attempt.
- Keep delay helper injectable or fake-timer friendly so tests stay fast and deterministic.

Timeout handling:

- The OpenAI Node SDK supports request `timeout` options and has a 10-minute default, which is too high for this PRD. Configure 45-60 seconds either at OpenAI client construction or per request if Instructor forwards request options correctly.
- If using `AbortController`, ensure timeout cleanup happens in `finally` so timers do not leak across batch runs.
- Timeouts must reject, and after retries are exhausted the error must flow to `processSinglePdf()` for DLQ conversion.

Retry classification:

- Retry: `429`, `502`, `503`, `504`, and SDK timeout/network errors only if tests prove they are bounded by `MAX_LLM_ATTEMPTS`.
- Do not retry: `400`, `401`, `402`, `403`, missing API key, invalid prompt/request shape, Zod validation failures, or Instructor response-model parsing errors.

### Architecture Compliance

- `src/lib/llm-client.ts` remains the API boundary and completely encapsulates Instructor, OpenAI SDK, and OpenRouter gateway behavior.
- `src/pipeline.ts` remains the orchestration and DLQ boundary. It should not inspect HTTP status codes or retry API calls.
- `src/lib/pdf-parser.ts` remains a raw-text parser and must not know about LLM retries or DLQ.
- `src/schemas/director-schema.ts` remains unchanged unless a separate story changes output shape.
- Tests stay in root `tests/`, not colocated under `src/`.
- Files remain kebab-case; utility functions remain camelCase.

### Previous Story Intelligence

From Story 2.3:

- Per-file failures are already caught in `processSinglePdf()` and returned as a discriminated union. Preserve this boundary.
- `documents_that_failed_processing` must contain exact failed PDF basenames only, with no error-message suffixes.
- Final `writePipelineOutput()` failure is batch-level and should still throw; do not route output persistence failure to the per-file DLQ.
- `source_filename` is set by `processSinglePdf()` after spreading each LLM result. Do not move filename assignment into `llm-client.ts`.
- `tests/e2e-poc.test.ts` may consume OpenRouter tokens; prefer focused mocked tests unless live E2E is explicitly requested.

Recent git history:

- `5c90395 fix(pipeline): harden DLQ and optimize batch ingestion` changed `src/pipeline.ts` to add batch limiting and stronger DLQ logging.
- `944a37b feat(pipeline): add per-file DLQ exception trapping` added Story 2.3 DLQ tests and result-object handling.
- `112108f fix(pipeline): harden batch orchestration and optimize throttling` preserved LLM-only throttling and output persistence failure behavior.

### Latest Technical Information

- OpenRouter documents `429` as rate limited, `502` as model/provider down or invalid provider response, and `503` as no available provider. OpenRouter may include a standard `Retry-After` header on `429` and `503`; SDKs may already honor it, but this story requires explicit, tested behavior aligned to the PRD. [Source: https://openrouter.ai/docs/api/reference/errors-and-debugging#retry-after-header]
- OpenRouter also documents `408` request timeout. Treat it cautiously: retry only if the implementation classifies it as a transient SDK/network timeout and tests verify bounded attempts. [Source: https://openrouter.ai/docs/api/reference/errors-and-debugging#error-codes]
- The official OpenAI Node SDK retries connection errors, `408`, `409`, `429`, and `>=500` errors by default, with configurable `maxRetries`; it also supports configurable request timeouts and defaults to 10 minutes. The PRD requires a stricter 45-60 second timeout and maximum 3 attempts, so set explicit options rather than relying on defaults. [Source: https://github.com/openai/openai-node#retries]
- The OpenAI SDK timeout option throws an API timeout error when exceeded; timed-out requests can be retried by the SDK unless `maxRetries` is configured. Avoid multiplying hidden SDK retries with the story-level retry loop. [Source: https://github.com/openai/openai-node#timeouts]

### Anti-Patterns to Avoid

- Do NOT retry every thrown error; retry only clearly transient OpenRouter/API gateway failures.
- Do NOT combine SDK default retries with another 3-attempt wrapper in a way that creates more than 3 real request attempts. Configure SDK `maxRetries` deliberately or document why the wrapper is the single source of retry truth.
- Do NOT sleep real seconds in unit tests.
- Do NOT log raw extracted PDF text or prompt content during retries.
- Do NOT add new dependencies for a small retry loop.
- Do NOT change `extractDirectorChanges()` callers or return type.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4] - story statement and acceptance criteria.
- [Source: _bmad-output/planning-artifacts/epics.md#FR14] - detect OpenRouter rate limits and apply exponential backoff.
- [Source: _bmad-output/planning-artifacts/epics.md#FR15] - detect OpenRouter gateway errors and retry.
- [Source: _bmad-output/planning-artifacts/prd.md#NFR2] - maximum 3 retry attempts for `429` and `502/503/504`.
- [Source: _bmad-output/planning-artifacts/prd.md#NFR3] - strict 45-60 second API timeout via abort/time-bound request.
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] - OpenRouter via Instructor/OpenAI SDK, 45-second timeout, custom backoff.
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries] - `src/lib/llm-client.ts` owns the external API boundary.
- [Source: _bmad-output/implementation-artifacts/2-3-dead-letter-queue-dlq-exception-trapping.md#Previous Story Intelligence] - DLQ behavior and retry scope boundary.
- [Source: src/lib/llm-client.ts] - current implementation to modify.
- [Source: tests/llm-client.test.ts] - existing mocked LLM tests to extend.
- [Source: src/pipeline.ts] - existing DLQ catch boundary to preserve.

## Dev Agent Record

### Agent Model Used

GPT-5

### Implementation Plan

- Add failing mocked LLM-client tests for retryable OpenRouter statuses, retry exhaustion, Retry-After handling, non-retryable failures, and timeout/retry client configuration.
- Implement an explicit retry loop inside `src/lib/llm-client.ts` with SDK retries disabled, a 45-second timeout, 3 total attempts, and retry classification limited to `429`, `502`, `503`, and `504`.
- Preserve pipeline/DLQ boundaries by leaving `src/pipeline.ts` behavior unchanged and adding a regression test for exhausted LLM failures.
- Run focused tests, non-token-consuming regression tests, and TypeScript validation.

### Debug Log References

- `npm.cmd exec -- vitest run tests/llm-client.test.ts tests/pipeline.test.ts` failed before implementation: 7 failing LLM tests confirmed missing retry behavior, Retry-After handling, and explicit OpenAI timeout/retry config.
- `npm.cmd exec -- vitest run tests/llm-client.test.ts tests/pipeline.test.ts` passed after implementation: 2 files, 34 tests.
- `npm.cmd exec -- vitest run tests/smoke.test.ts tests/schemas.test.ts tests/pdf-parser.test.ts tests/llm-client.test.ts tests/file-system.test.ts tests/cli.test.ts tests/pipeline.test.ts` passed: 7 files, 94 tests.
- `npx.cmd tsc --noEmit` passed with zero type errors.

### Completion Notes List

- Added explicit OpenRouter/Instructor retry handling in `src/lib/llm-client.ts` for HTTP `429`, `502`, `503`, and `504`, capped at 3 total attempts.
- Configured the OpenAI SDK client with `maxRetries: 0` and a 45-second timeout so the story-level retry loop is the single source of retry behavior.
- Honored parseable `Retry-After` seconds from SDK/header-shaped errors, falling back to local exponential delays.
- Preserved non-retryable errors, missing API key behavior, and Zod/Instructor validation failures as immediate rejections.
- Preserved Story 2.3 DLQ behavior; exhausted LLM failures are still converted to filename-only DLQ entries by `processSinglePdf()`.

### File List

- `src/lib/llm-client.ts`
- `tests/llm-client.test.ts`
- `tests/pipeline.test.ts`
- `_bmad-output/implementation-artifacts/2-4-llm-api-resiliency-exponential-backoff.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-05-12: Implemented LLM API retry/backoff and timeout bounds with mocked retry coverage; moved story to review.
