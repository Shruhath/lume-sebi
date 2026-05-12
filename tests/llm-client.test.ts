import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OpenAI from 'openai';
import { DirectorChangeSchema } from '../src/schemas/director-schema.js';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn(),
}));

vi.mock('@instructor-ai/instructor', () => ({
  default: vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

import { extractDirectorChanges } from '../src/lib/llm-client.js';

function createApiError(status: number, message = `HTTP ${status}`, retryAfter?: string): Error & {
  status: number;
  headers?: { get: (name: string) => string | null };
} {
  const error = new Error(message) as Error & {
    status: number;
    headers?: { get: (name: string) => string | null };
  };
  error.status = status;
  if (retryAfter !== undefined) {
    error.headers = {
      get: (name: string) => (name.toLowerCase() === 'retry-after' ? retryAfter : null),
    };
  }
  return error;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('llm-client', () => {
  const savedKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate.mockReset();
  });

  afterEach(() => {
    if (savedKey !== undefined) {
      process.env.OPENROUTER_API_KEY = savedKey;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  describe('extractDirectorChanges', () => {
    it('returns an array of DirectorChange objects for a valid multi-change response', async () => {
      const mockChanges = [
        {
          company_name: 'Reliance Industries Limited',
          stock_ticker: 'RELIANCE',
          director_name: 'Amit Kumar Sharma',
          change_type: 'appointment',
          effective_date: '2025-03-15',
          reason_stated: 'Appointed as Independent Director by the Board',
          extraction_confidence: 'high',
        },
        {
          company_name: 'Reliance Industries Limited',
          stock_ticker: 'RELIANCE',
          director_name: 'Priya Desai',
          change_type: 'resignation',
          effective_date: '2025-03-10',
          reason_stated: 'Personal reasons',
          extraction_confidence: 'medium',
        },
      ];

      mockCreate.mockResolvedValueOnce({ changes: mockChanges });

      const result = await extractDirectorChanges('Sample regulatory filing text...');

      expect(result).toHaveLength(2);
      expect(result[0].company_name).toBe('Reliance Industries Limited');
      expect(result[0].change_type).toBe('appointment');
      expect(result[1].director_name).toBe('Priya Desai');
      expect(result[1].change_type).toBe('resignation');

      for (const change of result) {
        expect(() => DirectorChangeSchema.parse(change)).not.toThrow();
      }
    });

    it('returns an empty array when no director changes are found', async () => {
      mockCreate.mockResolvedValueOnce({ changes: [] });

      const result = await extractDirectorChanges('Filing with no director changes.');

      expect(result).toEqual([]);
    });

    it('returns changes with null fields when Instructor returns coerced data', async () => {
      const mockChanges = [
        {
          company_name: 'Tata Motors Limited',
          stock_ticker: null,
          director_name: 'Rajesh Patel',
          change_type: 'removal',
          effective_date: null,
          reason_stated: null,
          extraction_confidence: 'low',
        },
      ];

      mockCreate.mockResolvedValueOnce({ changes: mockChanges });

      const result = await extractDirectorChanges('Ambiguous filing text...');

      expect(result).toHaveLength(1);
      expect(result[0].stock_ticker).toBeNull();
      expect(result[0].effective_date).toBeNull();
      expect(result[0].reason_stated).toBeNull();
      expect(result[0].extraction_confidence).toBe('low');
    });

    it('passes the raw text as the user message to the LLM', async () => {
      mockCreate.mockResolvedValueOnce({ changes: [] });

      const inputText = 'Specific filing content for verification';
      await extractDirectorChanges(inputText);

      expect(mockCreate).toHaveBeenCalledOnce();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: inputText }),
        ]),
      );
    });

    it('uses the correct model and includes a system prompt', async () => {
      mockCreate.mockResolvedValueOnce({ changes: [] });

      await extractDirectorChanges('text');

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('openai/gpt-4o-mini');
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[0].content).toContain('Board of Director');
      expect(callArgs.messages[0].content).toContain('IDENTIFY VALID BOARD EVENTS');
    });

    it('uses the model specified in the LLM_MODEL environment variable', async () => {
      process.env.LLM_MODEL = 'custom-model-from-env';
      mockCreate.mockResolvedValueOnce({ changes: [] });

      await extractDirectorChanges('text');

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('custom-model-from-env');
      delete process.env.LLM_MODEL;
    });

    it('configures Instructor with a response_model using LlmExtractionResponseSchema', async () => {
      mockCreate.mockResolvedValueOnce({ changes: [] });

      await extractDirectorChanges('text');

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.response_model).toBeDefined();
      expect(callArgs.response_model.schema).toBeDefined();
      expect(callArgs.response_model.name).toBe('LlmExtractionResponse');
    });

    it('propagates API errors without catching them', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      await expect(extractDirectorChanges('text')).rejects.toThrow('API rate limit exceeded');
    });

    it.each([429, 502, 503, 504])(
      'retries retryable HTTP %s failures and returns the later successful response',
      async (status) => {
        vi.useFakeTimers();
        const mockChanges = [
          {
            company_name: 'Retry Limited',
            stock_ticker: 'RETRY',
            director_name: 'Retry Director',
            change_type: 'appointment' as const,
            effective_date: '2025-03-15',
            reason_stated: 'Board appointment',
            extraction_confidence: 'high' as const,
          },
        ];

        mockCreate
          .mockRejectedValueOnce(createApiError(status))
          .mockResolvedValueOnce({ changes: mockChanges });

        const promise = extractDirectorChanges('retryable text');
        await flushMicrotasks();
        expect(mockCreate).toHaveBeenCalledTimes(1);

        await vi.runAllTimersAsync();

        await expect(promise).resolves.toEqual(mockChanges);
        expect(mockCreate).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
      },
    );

    it('stops after three total attempts when retryable errors continue', async () => {
      vi.useFakeTimers();
      const finalError = createApiError(504, 'gateway timeout final');
      mockCreate
        .mockRejectedValueOnce(createApiError(504, 'gateway timeout 1'))
        .mockRejectedValueOnce(createApiError(504, 'gateway timeout 2'))
        .mockRejectedValueOnce(finalError);

      const promise = extractDirectorChanges('unstable text');
      const assertion = expect(promise).rejects.toThrow('gateway timeout final');
      await flushMicrotasks();
      await vi.runAllTimersAsync();

      await assertion;
      expect(mockCreate).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });

    it('honors Retry-After date strings when present on retryable errors', async () => {
      vi.useFakeTimers();
      const futureDate = new Date(Date.now() + 5000).toUTCString();
      const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      mockCreate
        .mockRejectedValueOnce(createApiError(429, 'rate limited', futureDate))
        .mockResolvedValueOnce({ changes: [] });

      const promise = extractDirectorChanges('retry-after date text');
      await flushMicrotasks();

      const delay = vi.mocked(setTimeout).mock.calls[0][1];
      // Check for ~5000ms delay (allowing for generous execution variance)
      expect(delay).toBeGreaterThanOrEqual(4000);
      expect(delay).toBeLessThanOrEqual(5100);

      await vi.runAllTimersAsync();
      await expect(promise).resolves.toEqual([]);
      timeoutSpy.mockRestore();
      vi.useRealTimers();
    });

    it('adds jitter to exponential backoff when Retry-After is absent', async () => {
      vi.useFakeTimers();
      const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      mockCreate
        .mockRejectedValueOnce(createApiError(502))
        .mockResolvedValueOnce({ changes: [] });

      const promise = extractDirectorChanges('jitter text');
      await flushMicrotasks();

      const delay = vi.mocked(setTimeout).mock.calls[0][1];
      // BASE_RETRY_DELAY_MS (500) + up to 100ms jitter
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThan(601);

      await vi.runAllTimersAsync();
      await expect(promise).resolves.toEqual([]);
      timeoutSpy.mockRestore();
      vi.useRealTimers();
    });
    });

    describe('missing API key', () => {
    it('throws if OPENROUTER_API_KEY is not set', async () => {
      vi.resetModules();
      delete process.env.OPENROUTER_API_KEY;

      vi.doMock('openai', () => ({ default: vi.fn() }));
      vi.doMock('@instructor-ai/instructor', () => ({
        default: vi.fn(() => ({
          chat: { completions: { create: vi.fn() } },
        })),
      }));

      const mod = await import('../src/lib/llm-client.js');
      await expect(mod.extractDirectorChanges('text')).rejects.toThrow('OPENROUTER_API_KEY');
    });
  });
});

describe('response_model schema', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate.mockReset();
  });

  async function getResponseModelSchema() {
    mockCreate.mockResolvedValueOnce({ changes: [] });
    await extractDirectorChanges('text');
    return mockCreate.mock.calls[0][0].response_model.schema;
  }

  it('validates a valid response with changes', async () => {
    const input = {
      changes: [
        {
          company_name: 'HDFC Bank',
          stock_ticker: 'HDFCBANK',
          director_name: 'Sanjay Mehta',
          change_type: 'appointment',
          effective_date: '2025-06-01',
          reason_stated: 'Board resolution',
          extraction_confidence: 'high',
        },
      ],
    };

    const schema = await getResponseModelSchema();
    const parsed = schema.parse(input);
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0].company_name).toBe('HDFC Bank');
  });

  it('validates a response with empty changes array', async () => {
    const schema = await getResponseModelSchema();
    const parsed = schema.parse({ changes: [] });
    expect(parsed.changes).toEqual([]);
  });

  it('rejects an invalid change_type', async () => {
    const input = {
      changes: [
        {
          company_name: 'Test',
          stock_ticker: null,
          director_name: 'Test Director',
          change_type: 'fired',
          effective_date: null,
          reason_stated: null,
          extraction_confidence: 'high',
        },
      ],
    };

    const schema = await getResponseModelSchema();
    expect(() => schema.parse(input)).toThrow();
  });

  it('rejects an invalid extraction_confidence', async () => {
    const input = {
      changes: [
        {
          company_name: 'Test',
          stock_ticker: null,
          director_name: 'Test Director',
          change_type: 'appointment',
          effective_date: null,
          reason_stated: null,
          extraction_confidence: 'very_high',
        },
      ],
    };

    const schema = await getResponseModelSchema();
    expect(() => schema.parse(input)).toThrow();
  });
});
