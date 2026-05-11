import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { parsePdfToText } from '../src/lib/pdf-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures', 'director-appointment.pdf');

describe('parsePdfToText', () => {
  it('extracts raw text from a local golden PDF fixture', async () => {
    const text = await parsePdfToText(fixturePath);
    const normalized = text.replace(/\s+/g, ' ');

    expect(normalized).toContain('ACME Industries Limited');
    expect(normalized).toContain('Jane Director');
    expect(normalized).toContain('independent director');
    expect(normalized).toContain('Director appointment effective 2026-05-11');
  });

  it('rejects when the PDF path does not exist', async () => {
    await expect(parsePdfToText(join(__dirname, 'fixtures', 'missing.pdf'))).rejects.toThrow();
  });

  it('rejects invalid PDF content instead of swallowing parser errors', async () => {
    await expect(parsePdfToText(join(__dirname, 'fixtures', 'not-a-pdf.txt'))).rejects.toThrow();
  });

  it('uses a committed fixture PDF file', async () => {
    const fixture = await readFile(fixturePath);

    expect(fixture.toString('utf8', 0, 8)).toMatch(/^%PDF-1\./);
  });

  it('preserves the primary parser error when cleanup also fails', async () => {
    const parseError = new Error('parse failed');

    vi.resetModules();
    vi.doMock('pdf-parse', () => ({
      PDFParse: class {
        async getText() {
          throw parseError;
        }

        async destroy() {
          throw new Error('cleanup failed');
        }
      },
    }));

    try {
      const { parsePdfToText: parseWithCleanupFailure } = await import('../src/lib/pdf-parser.js');

      await expect(parseWithCleanupFailure(fixturePath)).rejects.toThrow('parse failed');
      await expect(parseWithCleanupFailure(fixturePath)).rejects.not.toThrow('cleanup failed');
    } finally {
      vi.doUnmock('pdf-parse');
      vi.resetModules();
    }
  });
});
