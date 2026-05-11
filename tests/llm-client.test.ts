import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      expect(callArgs.messages[0].content).toContain('Map cessation, death');
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
