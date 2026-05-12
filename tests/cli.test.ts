import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverPdfFiles } from '../src/cli.js';

describe('discoverPdfFiles', () => {
  const tempDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'cli-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('returns absolute paths for all PDF files in a valid directory', async () => {
    const dir = await createTempDir();
    await writeFile(join(dir, 'doc_001.pdf'), '');
    await writeFile(join(dir, 'doc_002.pdf'), '');

    const result = await discoverPdfFiles(dir);

    expect(result).toHaveLength(2);
    expect(result).toContain(resolve(dir, 'doc_001.pdf'));
    expect(result).toContain(resolve(dir, 'doc_002.pdf'));
    for (const p of result) {
      expect(p).toMatch(/\.pdf$/i);
    }
  });

  it('rejects with a clear error for a non-existent directory', async () => {
    const fakePath = join(tmpdir(), 'does-not-exist-' + Date.now());

    await expect(discoverPdfFiles(fakePath)).rejects.toThrow(
      /Input directory does not exist/,
    );
  });

  it('rejects with a clear error when path points to a file', async () => {
    const dir = await createTempDir();
    const filePath = join(dir, 'not-a-dir.txt');
    await writeFile(filePath, 'hello');

    await expect(discoverPdfFiles(filePath)).rejects.toThrow(
      /Input path is not a directory/,
    );
  });

  it('rejects with a clear error when directory contains zero PDF files', async () => {
    const dir = await createTempDir();
    await writeFile(join(dir, 'readme.txt'), '');
    await writeFile(join(dir, 'data.csv'), '');

    await expect(discoverPdfFiles(dir)).rejects.toThrow(
      /No PDF files found in directory/,
    );
  });

  it('rejects for a completely empty directory', async () => {
    const dir = await createTempDir();

    await expect(discoverPdfFiles(dir)).rejects.toThrow(
      /No PDF files found in directory/,
    );
  });

  it('returns only PDF files when directory contains mixed file types', async () => {
    const dir = await createTempDir();
    await writeFile(join(dir, 'report.pdf'), '');
    await writeFile(join(dir, 'notes.txt'), '');
    await writeFile(join(dir, 'data.csv'), '');
    await writeFile(join(dir, 'image.png'), '');

    const result = await discoverPdfFiles(dir);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(resolve(dir, 'report.pdf'));
  });

  it('matches PDF extension case-insensitively', async () => {
    const dir = await createTempDir();
    await writeFile(join(dir, 'lower.pdf'), '');
    await writeFile(join(dir, 'upper.PDF'), '');
    await writeFile(join(dir, 'mixed.Pdf'), '');
    await writeFile(join(dir, 'skip.txt'), '');

    const result = await discoverPdfFiles(dir);

    expect(result).toHaveLength(3);
    expect(result).toContain(resolve(dir, 'lower.pdf'));
    expect(result).toContain(resolve(dir, 'upper.PDF'));
    expect(result).toContain(resolve(dir, 'mixed.Pdf'));
  });

  it('does not recurse into subdirectories', async () => {
    const dir = await createTempDir();
    await writeFile(join(dir, 'top.pdf'), '');
    const subDir = join(dir, 'nested');
    await mkdir(subDir);
    await writeFile(join(subDir, 'deep.pdf'), '');

    const result = await discoverPdfFiles(dir);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(resolve(dir, 'top.pdf'));
  });

  it('ignores top-level directories with PDF extensions', async () => {
    const dir = await createTempDir();
    await writeFile(join(dir, 'top.pdf'), '');
    await mkdir(join(dir, 'archive.pdf'));

    const result = await discoverPdfFiles(dir);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(resolve(dir, 'top.pdf'));
  });

  it('CLI exits non-zero and writes stderr for a non-existent directory', () => {
    const fakePath = join(tmpdir(), 'does-not-exist-' + Date.now());

    const result = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'src/cli.ts', '--input', fakePath],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Input directory does not exist');
  });

  it('CLI exits non-zero and writes stderr when input is a file', async () => {
    const dir = await createTempDir();
    const filePath = join(dir, 'not-a-dir.txt');
    await writeFile(filePath, 'hello');

    const result = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'src/cli.ts', '--input', filePath],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Input path is not a directory');
  });

  it('CLI exits non-zero and writes a stderr warning when no PDFs exist', async () => {
    const dir = await createTempDir();
    await writeFile(join(dir, 'notes.txt'), '');

    const result = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'src/cli.ts', '--input', dir],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Warning: No PDF files found');
  });
});
