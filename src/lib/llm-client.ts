import Instructor from '@instructor-ai/instructor';
import OpenAI from 'openai';
import { z } from 'zod';
import { DirectorChangeSchema, type DirectorChange } from '../schemas/director-schema.js';

const SYSTEM_PROMPT = `You are an expert financial analyst working for a Risk Intelligence engine. Your job is to extract Board of Director changes from Indian regulatory disclosures (BSE/NSE).

You will be provided with raw text extracted from a PDF.

Extract ALL director changes found in the text. If there are no director changes, return an empty changes array.

CRITICAL RULES:
1. ONLY BOARD DIRECTORS: Extract only individuals joining or leaving the Board of Directors (e.g., Independent Director, Managing Director, Whole-time Director, Non-Executive Director, Chairman of the Board).
2. IGNORE SENIOR MANAGEMENT: Do NOT extract changes for CFOs, CEOs (unless explicitly stated as a Board member), Company Secretaries, Compliance Officers, or any other senior management role that is not a Board of Directors position.
3. IGNORE COMMITTEE CHANGES: If a director steps down from a specific committee (e.g., Audit Committee, Nomination Committee) but remains on the Board, do NOT extract it. Only extract events where someone joins or leaves the Board itself.
4. IGNORE HISTORICAL DATA: Only extract changes that are the primary subject of the disclosure. Ignore passing references to past resignations or appointments from previous years mentioned as background context.
5. NO HALLUCINATIONS: If the text is unreadable, garbled, or does not contain a clear director change, return an empty changes array. Do not guess or fabricate data.

For each director change found, extract:
- company_name: The full legal name of the company
- stock_ticker: The BSE or NSE stock ticker symbol, or null if not mentioned
- director_name: The full name of the board director
- change_type: One of "appointment", "resignation", or "removal" (lowercase only). Map cessation, death, vacation of office, and other board exits to "removal" unless the filing clearly says resignation.
- effective_date: The date of the change in YYYY-MM-DD format, or null if not specified
- reason_stated: The reason for the change as stated in the filing, or null if no reason given
- extraction_confidence: One of "high", "medium", or "low" based on clarity and ambiguity of the source text`;

const LlmExtractionResponseSchema = z.object({
  changes: z.array(DirectorChangeSchema),
});

type InstructorClient = ReturnType<typeof Instructor>;

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
  if (typeof value === 'string') {
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
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) return undefined;

  return retryAfterSeconds * 1000;
}

function isRetryableLlmError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status !== undefined && RETRYABLE_STATUS_CODES.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffDelayMs(error: unknown, attemptIndex: number): number {
  return getRetryAfterMs(error) ?? BASE_RETRY_DELAY_MS * 2 ** attemptIndex;
}

async function createCompletionWithRetry(
  client: InstructorClient,
  text: string,
): Promise<z.infer<typeof LlmExtractionResponseSchema>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_LLM_ATTEMPTS; attempt += 1) {
    try {
      return await client.chat.completions.create({
        model: 'openai/gpt-4o-mini',
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
