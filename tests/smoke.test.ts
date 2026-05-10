import { describe, it, expect } from 'vitest';

describe('smoke test', () => {
  it('vitest runner is working', () => {
    expect(true).toBe(true);
  });

  it('can import project modules', async () => {
    const { runPipeline } = await import('../src/pipeline.js');
    expect(typeof runPipeline).toBe('function');
  });
});
