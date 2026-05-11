---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments: [
  '_bmad-output/planning-artifacts/prd.md',
  '_bmad-output/brainstorming/brainstorming-session-2026-05-10-00-51-30.md',
  'mydocs/1-context.md',
  'mydocs/2-faqs.md',
  'mydocs/3-types-of-questions-they-ask.md',
  'mydocs/4-Sapiensu_Take_Home_Exercise.md',
  'mydocs/5-howtoanswer.md',
  'mydocs/6-etl-data-ingestion-deep-dive.md',
  'mydocs/7-how-to-log.md',
  'mydocs/8-prompt-logs.md',
  'mydocs/9-implementation-plan.md',
  'mydocs/10-why-llms.md',
  'mydocs/11-architecture-decisions.md',
  'mydocs/12-brainstroming-agent.md',
  'mydocs/13-the-crazy-good-plan-for-microservices.md',
  'mydocs/14-brainstrom-cheatsheet.md',
  'mydocs/15-PM-agent.md',
  'mydocs/16-agent-plan-explained.md',
  'mydocs/17-zod-instructor-vitest-deep-dive.md',
  'mydocs/18-edge-cases-and-metrics.md',
  'mydocs/19-hardened-llm-prompt.md',
  'mydocs/20-llm-latency-report.md'
]
workflowType: 'architecture'
project_name: 'lume-sebi'
user_name: 'shruhath'
date: '2026-05-10'
lastStep: 8
status: 'complete'
completedAt: '2026-05-10'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
- **Ingestion & Orchestration:** CLI-triggered batch processing of unstructured PDF regulatory filings.
- **AI Extraction Layer:** Use of Instructor to enforce structured JSON LLM outputs for classifying and extracting board director events (appointments, resignations, removals), specifically ignoring senior management changes like CFOs.
- **Validation:** Strict coercion and type validation via Zod, ensuring exact alignment with upstream Sapiensu schemas.
- **Resilience:** Catch file-level and API-level errors (rate limits, timeouts) using exponential backoff and routing to a Dead Letter Queue (DLQ).
- **Observability:** Generate operational summary metrics including success, failure (DLQ), and confidence scores.

**Non-Functional Requirements:**
- **Fault Tolerance:** 100% completion rate for the batch loop regardless of individual file or API gateway failures. No single file failure crashes the process.
- **Concurrency Control:** Chunked concurrency limited to 5 simultaneous requests to manage LLM TTFT (Time To First Token) latency and API limits.
- **Scalability & Evolution:** Stateless execution loop allowing batch size scaling, combined with Modular Schema Isolation (Zod schemas stored separately) to accommodate future pipeline adjustments.

**Scale & Complexity:**
- Primary domain: Backend Data Pipeline / CLI Tool
- Complexity level: High (Data ambiguity, strict API fault tolerance, TDD focus)
- Estimated architectural components: 4 core modules (Ingestion/Parser, LLM Client/Instructor, Validation/Zod, Executor/DLQ)

### Technical Constraints & Dependencies

- **Latency:** LLM Time to First Token (TTFT) and Time Per Output Token (TPOT) dictate that we cannot use unbounded `Promise.all()`. We must limit concurrency using tools like `p-limit`.
- **Dependencies:** Node.js, TypeScript, `instructor`, `zod`, `vitest` for TDD, and a lightweight PDF parser (like `pdf-parse`).
- **External Integration:** OpenRouter API is the critical dependency. It requires robust HTTP 429/502 handling via exponential backoff and AbortController timeouts.

### Cross-Cutting Concerns Identified

- **Error Trapping & DLQ:** Every file execution block must be isolated so failures populate the DLQ metrics without throwing uncaught exceptions.
- **Data Provenance:** Confidence scoring and maintaining the relationship between the extracted event and the source filename are mandatory for compliance auditing.

## Starter Template Evaluation

### Primary Technology Domain

CLI Tool / Data Pipeline (Node.js/TypeScript) based on project requirements analysis.

### Starter Options Considered

1. **Heavy Frameworks (e.g., Oclif, NestJS CLI):** Rejected. Over-engineered for a 49-document take-home assignment and violates the Sapiensu "build simple first" mandate.
2. **Pre-built Boilerplates (e.g., kucherenko/cli-typescript-starter):** Rejected. Often come bundled with older testing frameworks like Jest (conflicts with the Vitest requirement) and heavy bundling tools (TSUP) that obscure the execution flow.
3. **Custom Minimal Setup (tsx + Commander):** Selected. Aligns perfectly with the philosophy of avoiding premature optimization. Provides total transparency and exact control over the mandated stack.

### Selected Starter: Custom Minimal Setup (tsx + Commander)

**Rationale for Selection:**
For a senior-level take-home assignment, utilizing a "black box" boilerplate can demonstrate a lack of fundamental engineering understanding. By initializing a minimal environment using modern tools (`tsx` for native execution, `vitest` for fast TDD, and `commander` for CLI argument parsing), we satisfy all technical requirements without pulling in bloat.

**Initialization Command:**

```bash
npm init -y && npm i commander dotenv zod @instructor-ai/instructor openai pdf-parse p-limit && npm i -D typescript @types/node tsx vitest
npx tsc --init
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
TypeScript running natively on Node.js via `tsx`, skipping the manual build step during development and testing.

**Styling Solution:**
N/A (CLI application). Native console logging for operational metrics.

**Build Tooling:**
Native `tsc` for configuration and type-checking, `tsx` for execution. No complex bundlers (Webpack/ESBuild) required for a local batch script.

**Testing Framework:**
Vitest. Selected for its native ESM support, speed, and modern syntax.

**Code Organization:**
- `/src/cli.ts` (Entry point and argument parsing)
- `/src/pipeline.ts` (Core batch execution loop and DLQ routing)
- `/src/schemas/` (Isolated Zod definitions for easy evolution)
- `/src/lib/` (PDF parser utility and Instructor LLM client)
- `/tests/` (Vitest test suites against golden PDFs)

**Development Experience:**
Fast iterative loop. Write tests, run `npm test` (Vitest), and execute the pipeline locally with `npx tsx src/cli.ts --input ./pdfs --output ./output.json`.

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Data Extraction Library (`pdf-parse`) vs Native LLM Reading
- LLM Output Enforcement (`zod` + `instructor`)
- Concurrency Control (`p-limit`)

**Important Decisions (Shape Architecture):**
- API Error Handling strategy (Exponential Backoff + DLQ)
- TDD Framework (`vitest`)

**Deferred Decisions (Post-MVP):**
- BullMQ/Redis Queuing (Deferred: using simple local loop first to prove core logic)
- PostgreSQL / S3 / Vector DB Storage (Deferred: using `output.json` first)
- Heavy OCR Microservice (Deferred: using lightweight `pdf-parse` for this specific dataset)

### Data Architecture

- **Validation:** Zod (v4.4.3). Isolated schemas in `/src/schemas/` with strict `.nullable()` coercion for ambiguous AI outputs.
- **Storage:** Flat file (`output.json`) generated post-batch loop.
- **Data Provenance:** In-memory Dead Letter Queue (DLQ) array to catch and record filenames of failed or corrupted documents.

### Authentication & Security

- **Secrets Management:** `dotenv` loading `OPENROUTER_API_KEY`. No hardcoded credentials in the repository.

### API & Communication Patterns

- **LLM Client:** `@instructor-ai/instructor` (v1.7.0) paired with the standard `openai` SDK, configured to point to the OpenRouter gateway.
- **Model:** `gpt-4o-mini` via OpenRouter (selected for speed and cost efficiency on 49 docs).
- **Rate Limiting/Concurrency:** `p-limit` (v7.3.0) throttling to exactly 5 concurrent promises to manage LLM TTFT (Time To First Token).
- **Error Handling:** Custom exponential backoff loop for HTTP 429/502/504 errors, with a fallback routing to the DLQ. `AbortController` implementing a strict 45-second timeout on requests.

### Frontend Architecture

- **Domain:** CLI Tool. No frontend architecture required. 

### Infrastructure & Deployment

- **Execution Environment:** Node.js, executed via `tsx` for zero-build-step TypeScript running.
- **Testing:** `vitest` for fast ESM-native Test-Driven Development (TDD) against "golden" edge-case PDFs.

### Decision Impact Analysis

**Implementation Sequence:**
1. Setup Vitest and Zod schemas alongside the 3 golden edge-case PDFs.
2. Implement basic Instructor API call logic (until tests pass).
3. Implement `pdf-parse` local ingestion.
4. Implement `p-limit` batch loop and DLQ routing.
5. Implement exponential backoff and timeouts.

**Cross-Component Dependencies:**
- The DLQ implementation directly depends on the success/failure trapping of the Instructor LLM Client and the Zod parser. If Zod throws a validation error, the core execution block must catch it and route the filename to the DLQ array without crashing the parent `p-limit` orchestrator.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
4 main areas where AI agents could make conflicting choices: Zod schema definitions, file naming, test organization, and DLQ error trapping.

### Naming Patterns

**API/Data Naming Conventions:**
- JSON outputs MUST use `snake_case` (e.g., `company_name`, `effective_date`, `extraction_confidence`) exactly matching the PRD specification.
- Zod schemas MUST use PascalCase with the `Schema` suffix (e.g., `DirectorSchema`, `ExtractionSummarySchema`).

**Code Naming Conventions:**
- Files MUST use `kebab-case` (e.g., `pdf-parser.ts`, `llm-client.ts`).
- Utility functions MUST use `camelCase` (e.g., `processSinglePdf`, `extractDirectorChanges`).

### Structure Patterns

**Project Organization:**
- Tests MUST be placed in a dedicated `tests/` directory at the root, NOT co-located next to source files. 
- Zod schemas MUST be isolated in `src/schemas/` to allow for easy modular schema evolution.

**File Structure Patterns:**
- `src/` for all application code.
- `src/cli.ts` serves as the sole entry point parsing `process.argv` or using Commander.
- `src/pipeline.ts` orchestrates the `p-limit` loop.

### Format Patterns

**Data Exchange Formats:**
- **Null Coercion Pattern:** AI agents MUST use Zod's `.transform()` to coerce empty strings (`""` or `"N/A"`) into explicit `null` values for optional fields like `effective_date` and `stock_ticker`.
- **Date Formats:** Dates MUST be enforced as `YYYY-MM-DD` strings.

### Process Patterns

**Error Handling Patterns:**
- **The DLQ Pattern:** Inside the `processSinglePdf` function, EVERYTHING must be wrapped in a `try/catch`. 
- DO NOT throw errors up to the main orchestrator loop. Instead, catch the error, log a minimal warning, return a specific failed object indicator, and let the orchestrator push the filename to the `documents_that_failed_processing` array.

**Loading/Status Patterns:**
- Use minimal `console.log` or `console.info` for batch progress (e.g., "Processed 5/49 documents..."). Do not use overly complex progress bar libraries unless specifically requested.

### Enforcement Guidelines

**All AI Agents MUST:**
- Implement exponential backoff for HTTP 429 and 502/504 inside the `instructor` wrapper.
- Use an `AbortController` set to 45-60 seconds for all LLM fetch requests.
- NEVER let a `processSinglePdf` failure crash the parent `p-limit` loop.

### Pattern Examples

**Good Examples:**
```typescript
// Good DLQ Pattern
try {
  const result = await client.chat.completions.create({...});
  return result;
} catch (error) {
  // Catch Zod or HTTP errors and route to DLQ
  console.warn(`[DLQ] Failed processing ${filename}:`, error.message);
  return { _failed_filename: filename }; 
}
```

**Anti-Patterns:**
```typescript
// BAD: Will crash the entire batch process if one PDF fails Zod validation
const results = await Promise.all(files.map(f => processSinglePdf(f)));

// BAD: Returning empty strings instead of null
const schema = z.object({ effective_date: z.string().optional() }); 
```

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
lume-sebi/
├── README.md                      # Phase 4 Architectural Defense
├── package.json
├── tsconfig.json
├── .env                           # Local environment variables (OPENROUTER_API_KEY)
├── .env.example
├── .gitignore
├── src/
│   ├── cli.ts                     # Entry point and Commander argument parsing
│   ├── pipeline.ts                # Orchestrator: p-limit loop and DLQ routing
│   ├── lib/
│   │   ├── llm-client.ts          # Instructor configuration and OpenRouter fetcher
│   │   ├── pdf-parser.ts          # pdf-parse wrapper
│   │   └── file-system.ts         # JSON/PDF read/write utilities
│   └── schemas/
│       └── director-schema.ts     # Zod schemas (DirectorSchema, ExtractionSummarySchema)
├── tests/
│   ├── setup.ts                   # Vitest global setup
│   ├── pipeline.test.ts           # End-to-end tests
│   ├── schemas.test.ts            # Unit tests for strict Zod coercion
│   └── fixtures/
│       ├── normal-appointment.pdf # Golden test PDFs
│       ├── cfo-resignation.pdf    # Should be ignored (negative test)
│       └── corrupted-scan.pdf     # Should hit DLQ
├── pdfs/                          # Input directory (ignored by git)
└── output.json                    # Final output artifact
```

### Architectural Boundaries

**API Boundaries:**
- The LLM Client (`src/lib/llm-client.ts`) forms the only external API boundary. It completely encapsulates the `instructor` and `openai` libraries. The rest of the application never touches the OpenRouter API directly, enabling the "Pragmatic Dual-Stack" swap later.

**Component Boundaries:**
- **Ingestion Boundary:** `pdf-parser.ts` ONLY returns raw text. It has no knowledge of Zod or the LLM.
- **Extraction Boundary:** `llm-client.ts` accepts raw text and returns a strictly typed Zod object. It has no knowledge of the file system or batch loop.
- **Orchestration Boundary:** `pipeline.ts` handles the `p-limit` loop and the Dead Letter Queue. It stitches the file system, parser, and LLM together but contains no extraction logic itself.

**Data Boundaries:**
- Raw data exists strictly in the `pdfs/` directory.
- In-memory data is validated exactly once by Zod immediately after the LLM call.
- The final state boundary is written atomically to `output.json` only after the entire batch is complete.

### Requirements to Structure Mapping

**Feature/Epic Mapping:**
- **Epic: Ingestion & Scaffold (Phase 1)**
  - Source: `src/schemas/director-schema.ts`, `src/lib/pdf-parser.ts`
  - Tests: `tests/schemas.test.ts`
- **Epic: LLM Integration (Phase 2)**
  - Source: `src/lib/llm-client.ts`
  - Tests: `tests/pipeline.test.ts`
- **Epic: Execution & DLQ (Phase 3)**
  - Source: `src/pipeline.ts`, `src/cli.ts`

**Cross-Cutting Concerns:**
- **Error Trapping & Backoff:** Handled inside `src/lib/llm-client.ts` (for API errors) and `src/pipeline.ts` (for file-level errors).
- **Metrics Generation:** Computed at the end of `src/pipeline.ts` and validated by Zod before being written to disk.

### Integration Points

**Internal Communication:**
- `cli.ts` -> Calls `pipeline.ts` with `--input` and `--output` arguments.
- `pipeline.ts` -> Calls `processSinglePdf()` which invokes `pdf-parser.ts` and then `llm-client.ts`.

**External Integrations:**
- OpenRouter API (`https://openrouter.ai/api/v1`) via the OpenAI SDK wrapper.

**Data Flow:**
1. PDF Binary -> `pdf-parser.ts` -> Raw Text
2. Raw Text -> `llm-client.ts` -> JSON + Zod Schema Validation
3. Validated JSON Object -> `pipeline.ts` -> Appended to in-memory Array (or DLQ array if failed)
4. Full Array -> `file-system.ts` -> `output.json`

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All technology choices (`instructor`, `zod`, `p-limit`, `vitest`) are strictly compatible. The simple local CLI batch design perfectly supports the minimal dependency stack.

**Pattern Consistency:**
Implementation patterns strongly support the architectural decisions. Naming conventions (snake_case JSON, kebab-case files) align with the cross-cutting requirement for strict data integration with Sapiensu's upstream systems.

**Structure Alignment:**
The flat project structure securely isolates `src/lib` utilities from the `src/pipeline.ts` orchestrator, mapping precisely to our functional boundaries.

### Requirements Coverage Validation ✅

**Epic/Feature Coverage:**
The three primary epics (Ingestion, AI Extraction, Execution/DLQ) are fully supported by dedicated files and corresponding Vitest test suites in the `tests/` directory.

**Functional Requirements Coverage:**
JSON outputs, LLM extraction boundaries, strict Zod validation, and the DLQ error trapping mechanism are all explicitly accounted for in the architecture.

**Non-Functional Requirements Coverage:**
Concurrency limits (LLM TTFT) are handled by `p-limit`. Data privacy is addressed by abstracting OpenRouter via `instructor`, allowing for easy swaps to local models. Fault tolerance is enforced via the DLQ pattern.

### Implementation Readiness Validation ✅

**Decision Completeness:**
All critical decisions have been documented, and primary toolchain versions (Zod 4.4.3, Instructor 1.7.0, p-limit 7.3.0) have been explicitly verified.

**Structure Completeness:**
The complete directory structure is mapped down to individual file names and exact directory boundaries (`src/schemas/`, `tests/fixtures/`).

**Pattern Completeness:**
Null-coercion, strict naming, and DLQ error trapping patterns are clearly specified with concrete code examples.

### Gap Analysis Results

None. All critical, important, and nice-to-have architectural considerations for a 49-document MVP take-home assignment have been successfully addressed. There is no over-engineering.

### Validation Issues Addressed

- We actively deferred heavy queue infrastructures (BullMQ/Redis) and vector databases to optimize for MVP implementation speed, reviewability, and local testability.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Strict data validation via Zod null-coercion
- Resilient batch processing via `p-limit` and isolated `try/catch` DLQ traps.
- Highly testable architecture separating API logic from batch execution, allowing use of actual test PDFs.

**Areas for Future Enhancement:**
- Transitioning to BullMQ/Redis for distributed queue scaling.
- Implementing Postgres and S3 for permanent auditability.

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented.
- Use implementation patterns consistently across all components.
- Respect project structure and boundaries.
- Refer to this document for all architectural questions.

**First Implementation Priority:**
```bash
npm init -y && npm i commander dotenv zod @instructor-ai/instructor openai pdf-parse p-limit && npm i -D typescript @types/node tsx vitest
```
