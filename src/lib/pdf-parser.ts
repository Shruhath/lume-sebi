import { readFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';

export async function parsePdfToText(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  const parser = new PDFParse({ data });

  let primaryError: unknown;

  try {
    const result = await parser.getText();
    return result.text;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await parser.destroy();
    } catch (cleanupError) {
      if (primaryError !== undefined) {
        throw primaryError;
      }

      throw cleanupError;
    }
  }
}
