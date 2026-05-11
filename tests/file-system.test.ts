import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writePipelineOutput } from '../src/lib/file-system.js';
import type { PipelineOutput } from '../src/schemas/director-schema.js';

const validOutput: PipelineOutput = {
  extractions: [
    {
      source_filename: 'filing-001.pdf',
      company_name: 'ACME Industries Limited',
      stock_ticker: null,
      director_name: 'Jane Director',
      change_type: 'appointment',
      effective_date: null,
      reason_stated: null,
      extraction_confidence: 'high',
    },
  ],
  summary: {
    total_documents_processed: 1,
    director_change_documents_identified: 1,
    total_director_changes_extracted: 1,
    documents_that_failed_processing: [],
  },
};

describe('writePipelineOutput', () => {
  const tempDirs: string[] = [];

  async function createTempDir() {
    const tempDir = await mkdtemp(join(tmpdir(), 'lume-sebi-file-system-'));
    tempDirs.push(tempDir);
    return tempDir;
  }

  async function createOutputPath(...segments: string[]) {
    const dir = await createTempDir();
    return join(dir, ...segments);
  }

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('writes a valid PipelineOutput as formatted JSON', async () => {
    const outputFile = await createOutputPath('output.json');

    await writePipelineOutput(validOutput, outputFile);

    const rawJson = await readFile(outputFile, 'utf8');
    expect(rawJson).toBe(`${JSON.stringify(validOutput, null, 2)}\n`);
    expect(JSON.parse(rawJson)).toEqual(validOutput);
  });

  it('preserves the exact snake_case output contract', async () => {
    const outputFile = await createOutputPath('output.json');

    await writePipelineOutput(validOutput, outputFile);

    const parsed = JSON.parse(await readFile(outputFile, 'utf8'));
    const extractionKeys = Object.keys(parsed.extractions[0]);
    const summaryKeys = Object.keys(parsed.summary);

    expect(extractionKeys).toEqual([
      'source_filename',
      'company_name',
      'stock_ticker',
      'director_name',
      'change_type',
      'effective_date',
      'reason_stated',
      'extraction_confidence',
    ]);
    expect(summaryKeys).toEqual([
      'total_documents_processed',
      'director_change_documents_identified',
      'total_director_changes_extracted',
      'documents_that_failed_processing',
    ]);
  });

  it('writes nullable optional fields as explicit null values', async () => {
    const outputFile = await createOutputPath('output.json');

    await writePipelineOutput(validOutput, outputFile);

    const parsed = JSON.parse(await readFile(outputFile, 'utf8'));
    expect(parsed.extractions[0]).toMatchObject({
      stock_ticker: null,
      effective_date: null,
      reason_stated: null,
    });
    expect('stock_ticker' in parsed.extractions[0]).toBe(true);
    expect('effective_date' in parsed.extractions[0]).toBe(true);
    expect('reason_stated' in parsed.extractions[0]).toBe(true);
  });

  it('creates missing parent directories before writing', async () => {
    const outputFile = await createOutputPath('nested', 'reports', 'output.json');

    await writePipelineOutput(validOutput, outputFile);

    const outputStats = await stat(outputFile);
    expect(outputStats.isFile()).toBe(true);
  });

  it('rejects invalid output before creating the target file', async () => {
    const outputFile = await createOutputPath('invalid-output.json');
    const invalidOutput = {
      ...validOutput,
      summary: {
        ...validOutput.summary,
        total_documents_processed: -1,
      },
    } as unknown as PipelineOutput;

    await expect(writePipelineOutput(invalidOutput, outputFile)).rejects.toThrow();
    await expect(stat(outputFile)).rejects.toThrow();
  });

  it('rejects when the output parent path is a file', async () => {
    const dir = await createTempDir();
    const parentFile = join(dir, 'reports');
    const outputFile = join(parentFile, 'output.json');

    await writeFile(parentFile, 'not a directory', 'utf8');

    await expect(writePipelineOutput(validOutput, outputFile)).rejects.toThrow(
      'not a directory',
    );
  });

  it('rejects when the output path already exists as a directory', async () => {
    const outputFile = await createOutputPath('output.json');
    await mkdir(outputFile);

    await expect(writePipelineOutput(validOutput, outputFile)).rejects.toThrow(
      'Output path is a directory',
    );
  });

  it('replaces existing output through a temporary file without leaving temp artifacts', async () => {
    const dir = await createTempDir();
    const outputFile = join(dir, 'output.json');
    await writeFile(outputFile, '{"stale":true}\n', 'utf8');

    await writePipelineOutput(validOutput, outputFile);

    const rawJson = await readFile(outputFile, 'utf8');
    const dirEntries = await readdir(dir);

    expect(JSON.parse(rawJson)).toEqual(validOutput);
    expect(dirEntries).toEqual(['output.json']);
  });
});
