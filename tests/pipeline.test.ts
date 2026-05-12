import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processSinglePdf, runPipeline } from '../src/pipeline.js';
import { parsePdfToText } from '../src/lib/pdf-parser.js';
import { extractDirectorChanges } from '../src/lib/llm-client.js';
import { writePipelineOutput } from '../src/lib/file-system.js';
import type { DirectorChange, PipelineOutput } from '../src/schemas/director-schema.js';

vi.mock('../src/lib/pdf-parser.js', () => ({
  parsePdfToText: vi.fn(),
}));

vi.mock('../src/lib/llm-client.js', () => ({
  extractDirectorChanges: vi.fn(),
}));

vi.mock('../src/lib/file-system.js', () => ({
  writePipelineOutput: vi.fn(),
}));

const mockParsePdfToText = vi.mocked(parsePdfToText);
const mockExtractDirectorChanges = vi.mocked(extractDirectorChanges);
const mockWritePipelineOutput = vi.mocked(writePipelineOutput);

function createDirectorChange(overrides: Partial<DirectorChange> = {}): DirectorChange {
  return {
    company_name: 'ACME Industries Limited',
    stock_ticker: 'ACME',
    director_name: 'Jane Director',
    change_type: 'appointment',
    effective_date: '2025-03-15',
    reason_stated: 'Board appointment',
    extraction_confidence: 'high',
    ...overrides,
  };
}

describe('pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWritePipelineOutput.mockResolvedValue(undefined);
  });

  describe('processSinglePdf', () => {
    it('parses PDF text, extracts director changes, and adds source_filename', async () => {
      const changes = [
        createDirectorChange({ director_name: 'Jane Director' }),
        createDirectorChange({
          director_name: 'Raj Director',
          change_type: 'resignation',
          effective_date: null,
          reason_stated: null,
        }),
      ];
      mockParsePdfToText.mockResolvedValueOnce('raw filing text');
      mockExtractDirectorChanges.mockResolvedValueOnce(changes);

      const result = await processSinglePdf('/tmp/nested/filing-001.pdf');

      expect(mockParsePdfToText).toHaveBeenCalledWith('/tmp/nested/filing-001.pdf');
      expect(mockExtractDirectorChanges).toHaveBeenCalledWith('raw filing text');
      expect(result).toEqual({
        success: true,
        filename: 'filing-001.pdf',
        extractions: [
          { ...changes[0], source_filename: 'filing-001.pdf' },
          { ...changes[1], source_filename: 'filing-001.pdf' },
        ],
      });
    });

    it('returns an empty array when no director changes are extracted', async () => {
      mockParsePdfToText.mockResolvedValueOnce('no director changes here');
      mockExtractDirectorChanges.mockResolvedValueOnce([]);

      await expect(processSinglePdf('/tmp/no-changes.pdf')).resolves.toEqual({
        success: true,
        filename: 'no-changes.pdf',
        extractions: [],
      });
    });

    it('returns a failed result when PDF parsing fails', async () => {
      mockParsePdfToText.mockRejectedValueOnce(new Error('PDF parse failed'));

      await expect(processSinglePdf('/tmp/corrupted.pdf')).resolves.toEqual({
        success: false,
        filename: 'corrupted.pdf',
        error: 'PDF parse failed',
      });
      expect(mockExtractDirectorChanges).not.toHaveBeenCalled();
    });

    it('returns a failed result when LLM extraction fails', async () => {
      mockParsePdfToText.mockResolvedValueOnce('raw filing text');
      mockExtractDirectorChanges.mockRejectedValueOnce(new Error('Zod validation failed'));

      await expect(processSinglePdf('/tmp/zod-failure.pdf')).resolves.toEqual({
        success: false,
        filename: 'zod-failure.pdf',
        error: 'Zod validation failed',
      });
    });
  });

  describe('runPipeline', () => {
    it('limits LLM extraction concurrency to 5', async () => {
      let active = 0;
      let peak = 0;
      const pdfPaths = Array.from({ length: 15 }, (_, index) => `/tmp/filing-${index}.pdf`);

      mockParsePdfToText.mockResolvedValue('raw filing text');
      mockExtractDirectorChanges.mockImplementation(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return [];
      });

      await runPipeline(pdfPaths, '/tmp/output.json');

      expect(peak).toBeLessThanOrEqual(5);
      expect(mockExtractDirectorChanges).toHaveBeenCalledTimes(15);
    });

    it('collects and flattens results from all files', async () => {
      const firstChange = createDirectorChange({ director_name: 'First Director' });
      const secondChange = createDirectorChange({ director_name: 'Second Director' });
      const thirdChange = createDirectorChange({ director_name: 'Third Director' });

      mockParsePdfToText.mockResolvedValue('raw filing text');
      mockExtractDirectorChanges
        .mockResolvedValueOnce([firstChange, secondChange])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([thirdChange]);

      await runPipeline(['/tmp/a.pdf', '/tmp/b.pdf', '/tmp/c.pdf'], '/tmp/output.json');

      const output = mockWritePipelineOutput.mock.calls[0][0] as PipelineOutput;
      expect(output.extractions).toEqual([
        { source_filename: 'a.pdf', ...firstChange },
        { source_filename: 'a.pdf', ...secondChange },
        { source_filename: 'c.pdf', ...thirdChange },
      ]);
    });

    it('computes the batch summary counts with an empty failed-documents array', async () => {
      mockParsePdfToText.mockResolvedValue('raw filing text');
      mockExtractDirectorChanges
        .mockResolvedValueOnce([createDirectorChange()])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([createDirectorChange(), createDirectorChange()]);

      await runPipeline(['/tmp/a.pdf', '/tmp/b.pdf', '/tmp/c.pdf'], '/tmp/output.json');

      const output = mockWritePipelineOutput.mock.calls[0][0] as PipelineOutput;
      expect(output.summary).toEqual({
        total_documents_processed: 3,
        director_change_documents_identified: 2,
        total_director_changes_extracted: 3,
        documents_that_failed_processing: [],
      });
    });

    it('writes the correctly shaped pipeline output to the requested output file', async () => {
      const change = createDirectorChange({ director_name: 'Output Director' });
      mockParsePdfToText.mockResolvedValue('raw filing text');
      mockExtractDirectorChanges.mockResolvedValue([change]);

      await runPipeline(['/tmp/output-source.pdf'], '/tmp/final-output.json');

      expect(mockWritePipelineOutput).toHaveBeenCalledWith(
        {
          extractions: [{ source_filename: 'output-source.pdf', ...change }],
          summary: {
            total_documents_processed: 1,
            director_change_documents_identified: 1,
            total_director_changes_extracted: 1,
            documents_that_failed_processing: [],
          },
        },
        '/tmp/final-output.json',
      );
    });

    it('continues processing and writes exact failed filenames to the DLQ summary', async () => {
      const change = createDirectorChange({ director_name: 'Surviving Director' });

      mockParsePdfToText.mockImplementation(async (pdfPath: string) => {
        if (pdfPath.endsWith('bad.pdf')) {
          throw new Error('corrupted file');
        }

        return 'raw filing text';
      });
      mockExtractDirectorChanges
        .mockResolvedValueOnce([change])
        .mockResolvedValueOnce([]);

      await runPipeline(
        ['/tmp/good.pdf', '/tmp/bad.pdf', '/tmp/empty.pdf'],
        '/tmp/output.json',
      );

      const output = mockWritePipelineOutput.mock.calls[0][0] as PipelineOutput;
      expect(mockParsePdfToText).toHaveBeenCalledTimes(3);
      expect(output).toEqual({
        extractions: [{ ...change, source_filename: 'good.pdf' }],
        summary: {
          total_documents_processed: 3,
          director_change_documents_identified: 1,
          total_director_changes_extracted: 1,
          documents_that_failed_processing: ['bad.pdf'],
        },
      });
    });

    it('routes exhausted LLM retry failures to filename-only DLQ while preserving successes', async () => {
      const change = createDirectorChange({ director_name: 'Recovered Director' });

      mockParsePdfToText.mockResolvedValue('raw filing text');
      mockExtractDirectorChanges
        .mockResolvedValueOnce([change])
        .mockRejectedValueOnce(new Error('gateway timeout final'));

      await runPipeline(['/tmp/success.pdf', '/tmp/retry-exhausted.pdf'], '/tmp/output.json');

      const output = mockWritePipelineOutput.mock.calls[0][0] as PipelineOutput;
      expect(output).toEqual({
        extractions: [{ ...change, source_filename: 'success.pdf' }],
        summary: {
          total_documents_processed: 2,
          director_change_documents_identified: 1,
          total_director_changes_extracted: 1,
          documents_that_failed_processing: ['retry-exhausted.pdf'],
        },
      });
    });
  });
});
