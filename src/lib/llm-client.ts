import Instructor from '@instructor-ai/instructor';
import OpenAI from 'openai';
import { z } from 'zod';
import { DirectorChangeSchema, type DirectorChange } from '../schemas/director-schema.js';

const SYSTEM_PROMPT = `You are an expert financial analyst working for a Risk Intelligence engine. 
Your job is to extract Board of Director changes from Indian regulatory disclosures (BSE/NSE).

You will be provided with raw text extracted from a PDF.

Extract ALL director changes found in the text. If there are no director changes, return an empty changes array.

---

STEP 1 — IDENTIFY VALID BOARD EVENTS ONLY

A valid extraction must satisfy ALL of the following:
- The individual holds an explicit Board-level title: Independent Director, Managing Director, Whole-Time Director, Executive Director, Non-Executive Director, Additional Director, or Chairman of the Board.
- The change is to their Board membership itself — not to a committee, subsidiary, or internal role.
- The event is the primary subject of this filing — not historical background or context from a prior period.

If any condition is not met, do not extract the record.

---

STEP 2 — EXCLUSION RULES (check every candidate against all of these)     

RULE 1 — BOARD TITLES ONLY
Do not extract: CFO, CEO, COO, CTO, President, Company Secretary, Compliance Officer, or any CXO/senior management title — UNLESS the filing explicitly states they also hold a Board-level title (e.g., "Whole-Time Director and CFO"). In that case, extract only the Board-level change, not the management role change.

RULE 2 — NO COMMITTEE CHANGES
If a person steps down from or joins a committee (Audit Committee, Nomination Committee, Stakeholders Relationship Committee, Risk Management Committee, etc.) but their Board membership is unchanged, do not extract. Look for explicit language like "remains a Director", "continues to serve on the Board", or "directorship remains unchanged" as signals to skip.

RULE 3 — NO HISTORICAL DATA
Only extract changes that are the primary subject of this specific filing. If a past resignation or appointment is mentioned as background context (e.g., "following the retirement of X in FY2022" or "after the resignation of Y in September 2023"), do not extract it. A historical event will typically be in the past tense and reference a date more than 30 days before the filing date.

RULE 4 — NO HALLUCINATIONS
If a name, date, or role is redacted, illegible, garbled, or uncertain, do not extract that record. Do not infer or guess missing fields. Return an empty changes array for that section.

RULE 5 — SINGLE COMPANY SCOPE
Only extract changes for the company that is the subject of this filing. If another company is referenced (e.g., a related entity, subsidiary, or acquirer mentioned in context), do not extract director changes for that other company.

---

STEP 3 — FIELD EXTRACTION RULES

For each valid director change, extract:

- company_name: The full legal name of the company that is the subject of this filing.
- stock_ticker: The BSE or NSE stock ticker symbol. If both are present, prefer the NSE symbol. Return null if not mentioned.
- director_name: The full name of the director. Do not infer or abbreviate. 
- change_type: Classify as exactly one of: "appointment", "resignation", or "removal".
  - Use "resignation" only if the filing explicitly uses the word "resign" or "resignation".
  - Use "removal" for cessation, vacation of office, death, retirement, or any other board exit where "resignation" is not explicitly stated.
  - Use "appointment" for new appointments, re-appointments, and re-designations to a Board role.
- effective_date: The date the change takes effect, in YYYY-MM-DD format. Do not use the date of the Board meeting unless it is explicitly stated as the effective date. Return null if not specified.
- reason_stated: The reason WHY the change happened, as explicitly stated in the filing (e.g., "health reasons", "personal reasons", "end of tenure"). Do not include procedural conditions (e.g., "subject to shareholder approval"), descriptive phrases about the act of filing itself (e.g., "formalised the appointment", "the Board has noted", "pursuant to regulation"), or vacancy context (e.g., "following the retirement of X"). Return null if no genuine reason is given.
- extraction_confidence:
  - "high" — name, role, change type, and date are all unambiguous.       
  - "medium" — one field is uncertain or requires inference.
  - "low" — multiple fields are uncertain; include only if the board change is clearly real.

---

STEP 4 — SELF-CHECK BEFORE OUTPUT

Before returning your answer, verify each extracted record against this checklist:
[ ] Does the person hold an explicit Board-level title in this filing?      
[ ] Is the change to Board membership (not a committee or management role)? 
[ ] Is this event current (not historical background)?
[ ] Are all fields sourced directly from the text (no inference or guessing)?
[ ] Is this person associated with the company that is the subject of this filing?

If any box cannot be checked, remove that record from your output.

---

OUTPUT FORMAT

Return only a valid JSON object. No explanation, no preamble, no markdown.  

{
  "changes": [
    {
      "company_name": "string",
      "stock_ticker": "string or null",
      "director_name": "string",
      "change_type": "appointment | resignation | removal",
      "effective_date": "YYYY-MM-DD or null",
      "reason_stated": "string or null",
      "extraction_confidence": "high | medium | low"
    }
  ]
}`;

const LlmExtractionResponseSchema = z.object({
  changes: z.array(DirectorChangeSchema),
});

type InstructorClient = ReturnType<typeof Instructor>;

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const MAX_LLM_ATTEMPTS = 3;
const LLM_TIMEOUT_MS = 45_000;
const BASE_RETRY_DELAY_MS = 500;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

let cachedClient: InstructorClient | null = null;

function getClient(): InstructorClient {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY environment variable is not set. Add it to your .env file.',
    );
  }

  const oai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    maxRetries: 0,
    timeout: LLM_TIMEOUT_MS,
  });

  cachedClient = Instructor({
    client: oai,
    mode: 'TOOLS',
  });

  return cachedClient;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function parseStatusCode(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  return undefined;
}

function getErrorStatus(error: unknown): number | undefined {
  const err = asRecord(error);
  if (!err) return undefined;

  return (
    parseStatusCode(err.status) ??
    parseStatusCode(err.code) ??
    parseStatusCode(asRecord(err.error)?.code) ??
    parseStatusCode(asRecord(err.response)?.status) ??
    parseStatusCode(asRecord(asRecord(err.response)?.data)?.error)
  );
}

function getHeaderValue(headers: unknown, name: string): string | undefined {
  const headerRecord = asRecord(headers);
  if (!headerRecord) return undefined;

  const get = headerRecord.get;
  if (typeof get === 'function') {
    const value = get.call(headers, name) ?? get.call(headers, name.toLowerCase());
    return typeof value === 'string' ? value : undefined;
  }

  const directValue = headerRecord[name] ?? headerRecord[name.toLowerCase()];
  return typeof directValue === 'string' ? directValue : undefined;
}

function getRetryAfterMs(error: unknown): number | undefined {
  const err = asRecord(error);
  const retryAfter =
    getHeaderValue(err?.headers, 'Retry-After') ??
    getHeaderValue(asRecord(err?.response)?.headers, 'Retry-After');

  if (!retryAfter) return undefined;

  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1000;
  }

  const retryAfterDate = Date.parse(retryAfter);
  if (!Number.isNaN(retryAfterDate)) {
    const delayMs = retryAfterDate - Date.now();
    return delayMs > 0 ? delayMs : 0;
  }

  return undefined;
}

function isRetryableLlmError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status !== undefined && RETRYABLE_STATUS_CODES.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffDelayMs(error: unknown, attemptIndex: number): number {
  const retryAfterMs = getRetryAfterMs(error);
  if (retryAfterMs !== undefined) return retryAfterMs;

  const baseDelay = BASE_RETRY_DELAY_MS * 2 ** attemptIndex;
  const jitter = Math.random() * 100;
  return baseDelay + jitter;
}

async function createCompletionWithRetry(
  client: InstructorClient,
  text: string,
): Promise<z.infer<typeof LlmExtractionResponseSchema>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_LLM_ATTEMPTS; attempt += 1) {
    try {
      return await client.chat.completions.create({
        model: process.env.LLM_MODEL || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        response_model: {
          schema: LlmExtractionResponseSchema,
          name: 'LlmExtractionResponse',
        },
      });
    } catch (error) {
      lastError = error;
      const hasAttemptsRemaining = attempt < MAX_LLM_ATTEMPTS - 1;
      if (!hasAttemptsRemaining || !isRetryableLlmError(error)) {
        throw error;
      }

      const delayMs = getBackoffDelayMs(error, attempt);
      console.warn(
        `LLM request failed with retryable status ${getErrorStatus(error)}; retrying attempt ${attempt + 2}/${MAX_LLM_ATTEMPTS}`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function extractDirectorChanges(text: string): Promise<DirectorChange[]> {
  const client = getClient();

  const result = await createCompletionWithRetry(client, text);

  return result.changes;
}
