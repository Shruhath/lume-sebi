---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments: [
  '_bmad-output/planning-artifacts/prd.md',
  '_bmad-output/planning-artifacts/architecture.md',
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
  'mydocs/20-llm-latency-report.md',
  'mydocs/21-if-larger-scale.md',
  'mydocs/22-app-structure-flow.md'
]
---

# lume-sebi - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for lume-sebi, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: The system can ingest a directory of local PDF files via CLI arguments.
FR2: The system can process multiple PDF files concurrently in limited batches to optimize throughput without exceeding downstream rate limits.
FR3: The system can parse raw text content from PDF documents.
FR4: The system can extract director appointment, resignation, and removal events from regulatory text.
FR5: The system can extract the exact source_filename, company_name, stock_ticker, director_name, effective_date, and reason_stated for each identified event.
FR6: The system can exclude irrelevant historical board changes from the extraction.
FR7: The system can exclude non-board executive changes (e.g., CEO, CFO, Company Secretary).
FR8: The system can exclude internal committee role changes that do not affect the primary board seat.
FR9: The system can generate an extraction_confidence score (high, medium, low) for each document based on textual ambiguity.
FR10: The system can validate that the extracted JSON perfectly conforms to Sapiensu's predefined schema.
FR11: The system can gracefully coerce invalid empty string responses ("" or "N/A") into explicit null values to maintain strict typing.
FR12: The system can trap file-level exceptions (e.g., unreadable or corrupt PDFs) without halting the entire batch process.
FR13: The system can capture and log the exact filenames of any documents that failed processing (The Dead Letter Queue).
FR14: The system can detect external API rate limits (e.g., HTTP 429) and automatically retry the request using exponential backoff.
FR15: The system can detect external API gateway errors (e.g., HTTP 502) and automatically retry the request.
FR16: The system can write the successfully extracted data to a single JSON file on the local file system.
FR17: The system can generate operational summary metrics, including total documents processed, documents containing director changes, total changes extracted, and an array of failed filenames.

### NonFunctional Requirements

NFR1: The batch processing loop must complete execution with a 100% success rate, regardless of the number of individual file failures. No single file failure shall crash the parent Node.js process.
NFR2: The pipeline must implement exponential backoff with a maximum of 3 retry attempts for any HTTP 429 (Rate Limit) or HTTP 502/503/504 (Gateway) error from the OpenRouter API before routing the file to the Dead Letter Queue.
NFR3: The pipeline must enforce a strict API timeout (e.g., 45-60 seconds) using an AbortController. If the LLM provider hangs indefinitely, the request must be explicitly aborted and routed to the DLQ to prevent the batch process from freezing.
NFR4: The system must process files concurrently to reduce overall batch time, but must artificially limit concurrency to a maximum of 5 simultaneous outbound API requests (chunking) to prevent immediate rate-limiting from OpenRouter.
NFR5: The system architecture must be completely stateless between individual file executions so that the batch size can theoretically scale from 49 to 10,000 PDFs simply by increasing the input directory size, without requiring architectural code changes or causing memory leaks.
NFR6: Modular Schema Isolation: The Zod validation layer must be designed for easy schema evolution. The architecture must isolate the Zod schema definitions into their own dedicated files (e.g., src/schemas/directorSchema.ts) so that future JSON fields can be added without fundamentally rewriting the core execution loop.
NFR7: The system must load all API keys (e.g., OPENROUTER_API_KEY) from a local .env file. Under no circumstances should API credentials be hardcoded into the source code repository.

### Additional Requirements

- [Starter Template]: The project must be initialized as a minimal custom setup using `tsx` and `commander` rather than heavy boilerplates. Initialization command: `npm init -y && npm i commander dotenv zod @instructor-ai/instructor openai pdf-parse p-limit && npm i -D typescript @types/node tsx vitest` followed by `npx tsc --init`. This is critical for Epic 1 Story 1.
- [Code Architecture]: Strict separation of concerns is mandated. Zod schemas must live in `src/schemas/`, LLM/Parser utilities in `src/lib/`, the orchestrator in `src/pipeline.ts`, and the entry point in `src/cli.ts`.
- [Testing Architecture]: Tests must reside in a dedicated `tests/` directory at the root and use `vitest`. The Golden PDFs must be structured inside `tests/fixtures/`.
- [DLQ Implementation Pattern]: Inside the `processSinglePdf` function, all code must be wrapped in a `try/catch`. Errors must NOT be thrown up to the main orchestrator; instead, a specific failure object must be returned to log the file in the DLQ array.
- [Schema Implementation Pattern]: AI agents must use Zod's `.transform()` to coerce empty strings into explicit `null` values and enforce `YYYY-MM-DD` date formatting.

### UX Design Requirements

N/A - CLI Tool Data Pipeline.

### FR Coverage Map

FR1: Epic 2 - Ingest directory of PDFs via CLI arguments
FR2: Epic 2 - Process concurrently in batches (chunking)
FR3: Epic 1 - Parse raw text from PDF documents
FR4: Epic 1 - Extract director appointment, resignation, removal events
FR5: Epic 1 - Extract exact required fields perfectly
FR6: Epic 1 - Exclude irrelevant historical board changes
FR7: Epic 1 - Exclude non-board executive changes (e.g., CFO)
FR8: Epic 1 - Exclude internal committee role changes
FR9: Epic 1 - Generate `extraction_confidence` score
FR10: Epic 1 - Validate JSON perfectly conforms to Zod schema
FR11: Epic 1 - Gracefully coerce invalid empty strings to explicit `null`
FR12: Epic 2 - Trap file-level exceptions without halting batch
FR13: Epic 2 - Capture and log exact filenames of failed docs (DLQ)
FR14: Epic 2 - Detect OpenRouter rate limits (429) & exponential backoff
FR15: Epic 2 - Detect OpenRouter gateway errors (502) & backoff
FR16: Epic 1 - Write successfully extracted data to `output.json`
FR17: Epic 2 - Generate operational summary metrics

## Epic List

### Epic 1: Core Extraction & Validation Engine
Analysts receive perfectly formatted, highly accurate JSON extractions for director changes from a single regulatory filing. All executive noise is filtered out, confidence is scored, and the data is strictly validated against the Sapiensu schema.
**FRs covered:** FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR16

#### Story 1.1: Initialize Minimal TypeScript CLI Project

As an engineer,
I want to initialize a minimal Node.js/TypeScript project with Commander, Zod, Instructor, and Vitest,
So that I have a fast, transparent development environment without boilerplate bloat.

**Acceptance Criteria:**

**Given** an empty repository
**When** the initialization command is run
**Then** the `package.json` and `tsconfig.json` are created
**And** the required production and dev dependencies (like `tsx` and `vitest`) are installed
**And** the core directory structure (`src/`, `tests/fixtures/`) is scaffolded.

#### Story 1.2: Define Director Extraction Zod Schemas

As a risk analyst,
I want the system to strictly validate the data structures using Zod with null-coercion,
So that I am guaranteed to receive clean data perfectly aligned with Sapiensu's upstream database.

**Acceptance Criteria:**

**Given** the Sapiensu JSON specification
**When** the `src/schemas/director-schema.ts` file is created
**Then** it must define a schema that coerces empty strings (`""` or `"N/A"`) to `null` for optional fields
**And** it must strictly enforce `change_type` and `extraction_confidence` as enums
**And** a Vitest test suite must successfully validate this coercion logic.

#### Story 1.3: Parse Local PDFs to Text

As the data pipeline,
I want to read a specific PDF file and extract its raw textual content,
So that I have the raw data ready to send to the LLM for analysis.

**Acceptance Criteria:**

**Given** a golden PDF fixture in `tests/fixtures/`
**When** the `pdf-parser.ts` utility is invoked
**Then** it should successfully return the raw text content of the document.

#### Story 1.4: Extract Director Events via LLM

As a risk analyst,
I want the system to analyze the raw PDF text, extract only board director events, and assign a confidence score,
So that I am alerted to real director changes without being spammed by CFO or committee role changes.

**Acceptance Criteria:**

**Given** the raw text of a regulatory filing
**When** the `llm-client.ts` is invoked
**Then** it must successfully call the OpenRouter API using Instructor
**And** it must perfectly extract the required fields, validating them against the Zod schema
**And** it must ignore historical events or non-board executive changes
**And** it must assign an `extraction_confidence` score based on the clarity of the text.

#### Story 1.5: Write Extracted Data to JSON

As the data pipeline,
I want to write the fully validated, extracted data to a local JSON file,
So that the Core Risk Platform can consume the intelligence.

**Acceptance Criteria:**

**Given** a successfully validated extraction array
**When** the file-system utility is invoked
**Then** it must cleanly serialize the object into `output.json` using `snake_case` keys perfectly matching the schema.

### Epic 2: Fault-Tolerant Batch Orchestration
Engineers can execute the pipeline against a directory of hundreds of PDFs completely unattended. The system protects downstream rate limits, automatically retries network errors, and safely routes any corrupted files or LLM failures to a Dead Letter Queue (DLQ) without crashing the batch.
**FRs covered:** FR1, FR2, FR12, FR13, FR14, FR15, FR17

#### Story 2.1: CLI Batch Argument Ingestion

As an engineer,
I want the pipeline to accept a directory path via CLI arguments,
So that I can point it at any folder of PDF filings to begin batch processing.

**Acceptance Criteria:**

**Given** the CLI command `npx tsx src/cli.ts --input ./pdfs --output ./output.json`
**When** the script is executed
**Then** it must successfully read the directory and load all `.pdf` file paths into an array for processing
**And** it must gracefully exit with a warning if the directory is empty or invalid.

#### Story 2.2: Chunked Concurrency Batch Loop

As a data engineer,
I want the system to process the files concurrently but artificially throttle to a maximum of 5 simultaneous requests,
So that the batch runs quickly without instantly triggering OpenRouter rate limits.

**Acceptance Criteria:**

**Given** an array of 49 file paths
**When** the orchestrator loop (`pipeline.ts`) begins
**Then** it must use `p-limit` (or similar chunking) to ensure no more than 5 files are being processed by the LLM at the exact same millisecond
**And** it must resolve all promises before concluding the batch run.

#### Story 2.3: Dead Letter Queue (DLQ) Exception Trapping

As a compliance officer,
I want the system to catch file-level failures and route them to a DLQ instead of crashing,
So that a single corrupted PDF doesn't destroy an entire weekend's batch run.

**Acceptance Criteria:**

**Given** a batch containing a corrupted PDF or an extraction that fails Zod validation
**When** `processSinglePdf()` is executed on that file
**Then** the failure must be caught within a `try/catch` block
**And** the error must NOT bubble up to crash the parent batch loop
**And** the specific filename must be appended to the in-memory DLQ array (`documents_that_failed_processing`).

#### Story 2.4: LLM API Resiliency & Exponential Backoff

As an engineer,
I want the LLM client to automatically retry failed requests due to gateway errors or rate limits,
So that transient network blips from OpenRouter don't artificially inflate our failure metrics.

**Acceptance Criteria:**

**Given** the OpenRouter API returns an HTTP 429 or 502/504 error
**When** the LLM client fetches the completion
**Then** it must automatically retry the request using exponential backoff up to a maximum of 3 attempts before failing to the DLQ
**And** it must enforce a strict 45-60 second timeout using an `AbortController` to prevent indefinite hangs.

#### Story 2.5: Operational Metrics Summary Generation

As an engineering manager,
I want the final output to include a summary of the batch run's performance,
So that I can monitor success rates and review exactly which documents failed in the DLQ.

**Acceptance Criteria:**

**Given** the batch loop has successfully resolved all promises
**When** the final JSON object is serialized to disk
**Then** it must include a `summary` object containing `total_documents_processed`, `director_change_documents_identified`, and `total_director_changes_extracted`
**And** it must output the exact array of filenames in `documents_that_failed_processing`
**And** this summary object must perfectly pass its own Zod validation schema.
