---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish']
inputDocuments: [
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
  'mydocs/14-brainstrom-cheatsheet.md'
]
documentCounts:
  briefCount: 0
  researchCount: 0
  brainstormingCount: 1
  projectDocsCount: 14
workflowType: 'prd'
releaseMode: 'phased'
classification:
  projectType: 'CLI Tool'
  domain: 'Fintech'
  complexity: 'High'
  projectContext: 'brownfield'
---

# Product Requirements Document - lume-sebi

**Author:** shruhath
**Date:** 2026-05-10

## Executive Summary

This Product Requirements Document defines the architecture and implementation strategy for the Sapiensu Director Change ETL Pipeline. The system ingests unstructured BSE/NSE regulatory disclosures and reliably extracts Board of Director changes into structured JSON. Unlike traditional extraction scripts, this pipeline treats data ambiguity as a core constraint, ensuring continuous risk surveillance across the deal lifecycle without silent failures.

### What Makes This Special

The pipeline's key differentiator is its "Pragmatic Dual-Stack" architecture, prioritizing fault tolerance and observability over naive extraction. By combining strict deterministic code (Zod, Vitest) with hardened LLM prompts, the system treats LLM hallucinations and OCR errors as expected states rather than fatal crashes. Features like Dead Letter Queues (DLQ) and extraction confidence scoring guarantee that ambiguous data is safely isolated, metricized, and escalated for human review. 

## Project Classification

- **Project Type:** CLI Tool (Data Pipeline / Script)
- **Domain:** Fintech (Regulatory Risk Intelligence)
- **Complexity:** High (Handling unstructured regulatory data and LLM ambiguity)
- **Project Context:** Brownfield

## Success Criteria

### User Success

Risk analysts receive continuous, reliable surveillance data without missing critical director changes due to silent errors. When data is ambiguous or messy, the system flags it for human review rather than guessing, ensuring analysts can implicitly trust the extracted intelligence.

### Business Success

Proving to the Sapiensu CTPO that the solution goes beyond a simple script and demonstrates enterprise-scale strategic thinking. This means tracking and presenting clear operational metrics (processed, found, empty, ambiguous, failed) that map to the core business value: "Intelligence persists across the deal lifecycle."

### Technical Success

Building a highly fault-tolerant TypeScript ETL pipeline. Key technical pillars include strict shape validation using Zod, guaranteed JSON structures via the Instructor library, comprehensive automated testing with Vitest, and a Dead Letter Queue (DLQ) to handle OCR or LLM failures without crashing the entire batch process.

### Measurable Outcomes

- Successfully process all 49 sample PDFs without a single fatal crash.
- Log specific pipeline metrics: Total Documents Processed, Total Director Changes Found, Empty Extractions, Ambiguous Extractions (confidence < 80), and Failures/DLQ.
- Pass 100% of Vitest unit tests against the 3 identified "golden" edge-case PDFs.

## Product Scope

### MVP - Minimum Viable Product

A linear batch-processing script (Phases 1-3 of the development plan) that reads the PDFs, queries `gpt-4o-mini` with a hardened prompt to extract the data, validates the response with Zod, and outputs the final `output.json` alongside the operational metrics.

### Growth Features (Post-MVP)

Implementing the "Pragmatic Dual-Stack" abstraction, allowing the underlying AI provider to be seamlessly swapped from an OpenAI endpoint to a local, open-source model (e.g., Llama-3) for enhanced data privacy and cost optimization.

### Vision (Future)

Transitioning from a linear script to a distributed, queue-based microservices architecture capable of processing thousands of disclosures concurrently, integrated with a "Multi-Channel Escalation" system to alert users based on the severity of the extracted risk.

## User Journeys

**1. Sarah (Risk Analyst) - The Happy Path**
- **Opening Scene:** Sarah logs in Monday morning. 49 new BSE filings dropped over the weekend. Normally, she'd spend 3 hours skimming dense PDFs to find the few that actually matter.
- **Rising Action:** The ETL pipeline runs. Using its hardened prompt, it filters out the noise (like CFO resignations and historical context).
- **Climax:** Sarah receives the parsed `output.json` data. She instantly sees the exact board changes, cleanly formatted with company names and effective dates.
- **Resolution:** She updates her clients' risk models in 15 minutes instead of 3 hours, completely confident that no board-level event was missed.

**2. Sarah (Risk Analyst) - The Edge Case (Human Review)**
- **Opening Scene:** The pipeline encounters a highly ambiguous PDF with convoluted legal text about a committee change.
- **Rising Action:** Instead of guessing or quietly failing, the LLM processes it but returns a low `extraction_confidence` score (65/100).
- **Climax:** Sarah receives a proactive Slack alert or dashboard notification highlighting the ambiguous record, eliminating the need for her to hunt through raw JSON files. She opens the source PDF to verify.
- **Resolution:** She realizes it's a false positive, discards it, and is relieved the system didn't quietly pollute the intelligence database with bad data.

**3. Alex (Data Engineer) - The Operations Path**
- **Opening Scene:** One of the PDF files in the batch is completely corrupted, returning garbage text during parsing.
- **Rising Action:** Zod validation catches the failure, and the LLM refuses to parse it. 
- **Climax:** The pipeline doesn't crash. It safely routes the corrupted file to the Dead Letter Queue (DLQ) and increments the `failedOrErrored` metric.
- **Resolution:** Alex checks the daily run logs. He sees "48 processed, 1 failed (DLQ)". He fixes the corrupted file and re-queues it, grateful the batch job didn't die halfway through.

**4. The Core Risk Platform (API Consumer - System to System)**
- **Opening Scene:** The ETL pipeline finishes its batch run and produces `output.json`.
- **Rising Action:** The Core Risk Platform's ingestion webhook is automatically triggered and pulls the JSON payload.
- **Climax:** The system successfully maps the extracted `stock_ticker` to internal company IDs without breaking on schema changes.
- **Resolution:** The platform automatically updates the overall risk scores for the affected companies in real-time.

**5. The Compliance Officer - The Audit Path**
- **Opening Scene:** Six months from now, a client or regulator asks why Sapiensu missed a specific director change that was buried in a messy PDF.
- **Rising Action:** The Compliance Officer checks the pipeline's historical logs.
- **Climax:** They find the exact PDF in the Dead Letter Queue (DLQ) log, showing that it was corrupted and correctly flagged as a failure on that specific date.
- **Resolution:** The Compliance Officer successfully defends the system's integrity, proving it doesn't fail silently.

### Journey Requirements Summary

These journeys reveal several concrete functional requirements for the pipeline:
- **Clean JSON Output:** Must extract fields exactly as defined (company, name, change type, date) for easy integration into analyst dashboards.
- **Confidence Flagging & Alerts:** The pipeline must output an `extraction_confidence` score and ideally trigger an alert so downstream systems can flag ambiguous records for human review.
- **Dead Letter Queue (DLQ):** A logging mechanism where failed PDFs are recorded for engineering and compliance review without halting the execution of the remaining files.
- **Operational Metrics Log:** A summary output detailing success, failure, and ambiguity counts for the engineering team to monitor system health.
- **Strict Schema Enforcement:** Output JSON must map perfectly to upstream systems (e.g., using `stock_ticker`) to ensure automated updates do not fail.

## Domain-Specific Requirements

### Compliance & Regulatory
- **Auditability:** Every extracted data point must be traceable back to its source PDF. The Dead Letter Queue (DLQ) must maintain immutable records of exactly which files failed and why for compliance audits.
- **Data Provenance:** The system cannot guess or hallucinate. Regulatory intelligence requires explicit certainty, which is why an `extraction_confidence` score is a mandatory compliance requirement, not just a nice-to-have feature.

### Technical Constraints
- **Idempotency & Retryability:** If the batch process crashes midway or a failed file in the DLQ is re-queued, rerunning the batch must not create duplicate director records in downstream systems.
- **Strict Typing:** Financial data systems require absolute schema adherence. Output must be strictly validated against a predefined Zod schema so upstream systems (like the Core Risk Platform) do not break.
- **Zero Silent Failures:** OCR issues, PDF corruption, and LLM timeouts are expected constraints, not anomalies. The system must catch all errors gracefully and log them without halting the surrounding batch execution.

### Integration Requirements
- **Standardized Payloads:** JSON output must structurally align with Sapiensu's internal models, meaning it needs robust key mapping (e.g., extracting exact `stock_ticker` formats for downstream mapping).
- **Decoupled Processing:** Given the latency of LLM inference, the pipeline architecture must be capable of running asynchronously (e.g., as a background worker) so it does not block primary application threads.

### Risk Mitigations
- **Risk:** LLM hallucinations quietly polluting the intelligence database with false positives (like a CFO resignation).
- **Mitigation:** Force strict JSON generation using the `instructor` library and apply "Prompt Edge-Case Hardening" to explicitly forbid non-board member extraction. Any extraction with a confidence score below 80% must be quarantined for human review.

## Innovation & Novel Patterns

### Detected Innovation Areas
**Non-Deterministic ETL Architecture:** Traditional ETL pipelines assume deterministic data extraction. This pipeline pioneers an AI-native approach by treating LLM hallucinations and OCR failures as expected constraints rather than exceptions. By wrapping the LLM in strict Zod schema validation and routing failures to a Dead Letter Queue (DLQ), it brings enterprise software engineering rigor to generative AI text extraction.

### Market Context & Competitive Landscape
Most current implementations of AI document extraction are naive—they wrap an OpenAI API call in a script and hope the output is correct. Sapiensu's competitive advantage is observability. By tracking an `extraction_confidence` score and isolating ambiguous data, Sapiensu provides verifiable intelligence that financial institutions can trust, unlike competitors who suffer from silent data pollution.

### Validation Approach
The innovation will be validated through test-driven development (TDD). We will use Vitest to run the pipeline against 3 "golden" edge-case PDFs (e.g., corrupted text, non-board member resignations) to mathematically prove that the Zod validation catches hallucinations and correctly routes them to the DLQ without crashing the batch.

### Risk Mitigation
- **Risk:** The primary LLM consistently hallucinates or fails to parse complex Indian regulatory vernacular.
- **Mitigation:** The "Pragmatic Dual-Stack" abstraction allows the engineering team to seamlessly swap out the default model for a fine-tuned, locally hosted open-source model specifically trained on BSE/NSE disclosures, ensuring data privacy and higher accuracy.

## CLI Tool / Data Pipeline Requirements

### Project-Type Overview
This project is an automated ETL pipeline executed via a command-line interface (CLI). It operates as a batch processor that ingests a local directory of PDF files, orchestrates asynchronous calls to various LLMs (via OpenRouter), and writes structured JSON data to the file system.

### Technical Architecture Considerations
- **Runtime Environment:** Node.js using TypeScript.
- **Data Flow:** Local File System (PDFs) -> PDF Parser (`pdf-parse`) -> LLM Client (`instructor` + OpenRouter for model benchmarking flexibility) -> Validator (`Zod`) -> Local File System (JSON).
- **Concurrency:** The pipeline should support batch processing (e.g., using a library like `p-limit` or chunked `Promise.all`) to handle the 49 PDFs efficiently without hitting OpenRouter rate limits.

### Interface & Schema Specification
- **CLI Execution:** The script should be runnable via a simple command (e.g., `npm run start -- --input ./pdfs --output ./output.json`).
- **Input Schema:** A directory containing unstructured, potentially corrupted PDF files of Indian regulatory disclosures.
- **Output Schema (Zod Definition):** Must perfectly match Sapiensu's exact requirements.
  - `extractions`: Array of objects.
    - `source_filename`: string
    - `company_name`: string
    - `stock_ticker`: string or null *(Requires Zod coercion to normalize LLM `""` or `"N/A"` outputs into explicit `null`)*
    - `director_name`: string
    - `change_type`: enum `["appointment", "resignation", "removal"]`
    - `effective_date`: string (YYYY-MM-DD) or null *(Requires Zod coercion to `null`)*
    - `reason_stated`: string or null *(Requires Zod coercion to `null`)*
    - `extraction_confidence`: enum `["high", "medium", "low"]`
  - `summary`: object
    - `total_documents_processed`: integer
    - `director_change_documents_identified`: integer
    - `total_director_changes_extracted`: integer
    - `documents_that_failed_processing`: array of filenames (strings) representing the Dead Letter Queue (DLQ).

### Error Handling & Resilience
- **OpenRouter Fault Tolerance:** Must implement exponential backoff that handles both standard rate limits (`429 Too Many Requests`) AND upstream provider failures (`502 Bad Gateway`), which are common when using an aggregator like OpenRouter.
- **Dead Letter Queue (DLQ):** Files that throw unhandled exceptions, timeout, or fail Zod validation must be caught in a `try/catch` block. Their filenames must be added to the `documents_that_failed_processing` array in the summary, allowing the rest of the batch to complete successfully and fulfilling the exact prompt requirements.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy
**MVP Approach:** The goal is to build an enterprise-grade, pragmatic ETL script that proves you can handle unstructured data at scale. The MVP is completed at the end of Phase 3, providing a fully functional, fault-tolerant batch processor.
**Resource Requirements:** 1 Software Engineer (Take-Home Assignment scope).

### Phased Execution Plan

**Phase 1: Ingestion & TDD Scaffold**
*Focus: Foundation, strict typing, and Test-Driven Development.*
- Initialize Node.js/TypeScript environment.
- Define exact Zod schemas mirroring the required output JSON (including `.transform` coercions for empty strings to `null`).
- Implement CLI file ingestion to load the 49 PDFs.
- **TDD Setup:** Create 3 "golden" edge-case PDFs and write the initial Vitest unit tests *before* writing the LLM integration, proving engineering maturity to the CTPO.

**Phase 2: LLM Integration (The Core)**
*Focus: Extraction logic & passing tests.*
- Integrate OpenRouter via the `instructor` library.
- Implement the hardened system prompt (filtering out C-Suite roles, handling historical context).
- Run the execution logic against the Vitest unit tests from Phase 1 until the schema extractions match perfectly.

**Phase 3: Pipeline Execution & Error Handling (MVP Completion)**
*Focus: Fault tolerance & observability.*
- Build the batch processing loop using **chunked concurrency** (e.g., batches of 5 PDFs at a time using `p-limit` or array chunking) to avoid overwhelming OpenRouter rate limits.
- Implement exponential backoff for OpenRouter API failures (e.g., handling 429s and 502s).
- Implement the Dead Letter Queue (DLQ), populating the `documents_that_failed_processing` array upon Zod or API failure.
- Output final `output.json` with the populated `summary` metrics object.

**Phase 4: Polish & Growth Preparation**
*Focus: Proving strategic vision to the CTPO.*
- Refactor the LLM client to prove the "Pragmatic Dual-Stack" abstraction (demonstrating how easily OpenRouter could be swapped for a local open-source model).
- Write a comprehensive README defending architectural decisions (TDD, Chunking, DLQ, Edge Cases).

### Risk Mitigation Strategy
- **Technical Risks:** LLM format hallucinations and API gateway failures. *Mitigation:* Zod coercion logic, chunked concurrency, exponential backoff, and strict DLQ routing.
- **Data Quality Risks:** Unreadable, messy, or corrupt PDFs. *Mitigation:* Isolating failures so they don't crash the batch process, thereby maintaining data provenance for compliance audits.
- **Time Constraints:** Running out of time during the take-home window. *Mitigation:* Strict phase adherence. If Phase 4 is dropped, Phase 3 still delivers a highly defensible, working product.

---
*Note: While the CLI Tool Requirements define the overarching system architecture, the following Functional Requirements define the strict "Capability Contract" that must be fulfilled for the assignment.*

## Functional Requirements

### Data Ingestion & Batching
- FR1: The system can ingest a directory of local PDF files via CLI arguments.
- FR2: The system can process multiple PDF files concurrently in limited batches to optimize throughput without exceeding downstream rate limits.
- FR3: The system can parse raw text content from PDF documents.

### AI-Driven Data Extraction
- FR4: The system can extract director appointment, resignation, and removal events from regulatory text.
- FR5: The system can extract the exact `source_filename`, `company_name`, `stock_ticker`, `director_name`, `effective_date`, and `reason_stated` for each identified event.
- FR6: The system can exclude irrelevant historical board changes from the extraction.
- FR7: The system can exclude non-board executive changes (e.g., CEO, CFO, Company Secretary).
- FR8: The system can exclude internal committee role changes that do not affect the primary board seat.
- FR9: The system can generate an `extraction_confidence` score (high, medium, low) for each document based on textual ambiguity.

### Validation & Schema Coercion
- FR10: The system can validate that the extracted JSON perfectly conforms to Sapiensu's predefined schema.
- FR11: The system can gracefully coerce invalid empty string responses (`""` or `"N/A"`) into explicit `null` values to maintain strict typing.

### Error Handling & Resilience (Dead Letter Queue)
- FR12: The system can trap file-level exceptions (e.g., unreadable or corrupt PDFs) without halting the entire batch process.
- FR13: The system can capture and log the exact filenames of any documents that failed processing (The Dead Letter Queue).
- FR14: The system can detect external API rate limits (e.g., HTTP 429) and automatically retry the request using exponential backoff.
- FR15: The system can detect external API gateway errors (e.g., HTTP 502) and automatically retry the request.

### Output & Observability
- FR16: The system can write the successfully extracted data to a single JSON file on the local file system.
- FR17: The system can generate operational summary metrics, including total documents processed, documents containing director changes, total changes extracted, and an array of failed filenames.

## Non-Functional Requirements

### Reliability & Fault Tolerance
- NFR1: The batch processing loop must complete execution with a 100% success rate, regardless of the number of individual file failures. No single file failure shall crash the parent Node.js process.
- NFR2: The pipeline must implement exponential backoff with a maximum of 3 retry attempts for any HTTP 429 (Rate Limit) or HTTP 502/503/504 (Gateway) error from the OpenRouter API before routing the file to the Dead Letter Queue.
- NFR3: The pipeline must enforce a strict API timeout (e.g., 45-60 seconds) using an `AbortController`. If the LLM provider hangs indefinitely, the request must be explicitly aborted and routed to the DLQ to prevent the batch process from freezing.

### Performance & Concurrency
- NFR4: The system must process files concurrently to reduce overall batch time, but must artificially limit concurrency to a maximum of 5 simultaneous outbound API requests (chunking) to prevent immediate rate-limiting from OpenRouter.

### Scalability
- NFR5: The system architecture must be completely stateless between individual file executions so that the batch size can theoretically scale from 49 to 10,000 PDFs simply by increasing the input directory size, without requiring architectural code changes or causing memory leaks.
- NFR6: **Modular Schema Isolation:** The Zod validation layer must be designed for easy schema evolution. The architecture must isolate the Zod schema definitions into their own dedicated files (e.g., `src/schemas/directorSchema.ts`) so that future JSON fields can be added without fundamentally rewriting the core execution loop.

### Security & Privacy
- NFR7: The system must load all API keys (e.g., `OPENROUTER_API_KEY`) from a local `.env` file. Under no circumstances should API credentials be hardcoded into the source code repository.
