import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { PipelineOutputSchema, type PipelineOutput } from '../schemas/director-schema.js';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function ensureOutputPathIsWritable(outputFile: string): Promise<void> {
  const parentDir = dirname(outputFile);

  try {
    const parentStats = await stat(parentDir);
    if (!parentStats.isDirectory()) {
      throw new Error(`Output parent path is not a directory: ${parentDir}`);
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      await mkdir(parentDir, { recursive: true });
    } else {
      throw error;
    }
  }

  const targetStats = await stat(outputFile).catch((error: unknown) => {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  });

  if (targetStats?.isDirectory()) {
    throw new Error(`Output path is a directory: ${outputFile}`);
  }
}

export async function writePipelineOutput(
  output: PipelineOutput,
  outputFile: string,
): Promise<void> {
  const validatedOutput = PipelineOutputSchema.parse(output);
  const serializedOutput = `${JSON.stringify(validatedOutput, null, 2)}\n`;
  const parentDir = dirname(outputFile);
  const tempFile = join(
    parentDir,
    `.${basename(outputFile)}.${process.pid}.${Date.now()}.tmp`,
  );

  await ensureOutputPathIsWritable(outputFile);

  try {
    await writeFile(tempFile, serializedOutput, 'utf8');
    await rename(tempFile, outputFile);
  } catch (error) {
    await rm(tempFile, { force: true }).catch(() => undefined);
    throw error;
  }
}
