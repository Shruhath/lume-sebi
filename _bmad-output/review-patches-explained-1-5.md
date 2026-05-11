# Code Review Patches Explained - Story 1-5

These are the 5 patch findings documented in Story `1-5-write-extracted-data-to-json`.

This document is explanation only. No implementation code has been changed for these findings yet.

## Current Implementation

`src/lib/file-system.ts` currently does three things:

```typescript
const validatedOutput = PipelineOutputSchema.parse(output);

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(validatedOutput, null, 2)}\n`, 'utf8');
```

That satisfies the original story acceptance criteria, but the review findings are asking for stronger production hygiene around file writes and tests.

## Patch 1: Non-Atomic Write & Corruption Risk

**File:** `src/lib/file-system.ts`, line 12

**What the reviewer found:**

The function writes directly to the final target path with `writeFile(outputFile, ...)`.

If the process is interrupted halfway through the write, or the disk errors after truncating the file, the existing `output.json` can be left partially written or empty.

**Why it matters:**

For this project, `output.json` is the artifact consumed by the Core Risk Platform. A partial JSON file is worse than a clean failure because downstream code may see a corrupt or incomplete output artifact.

**Example failure mode:**

1. `output.json` already contains valid prior results.
2. The next run starts writing a new `output.json`.
3. Node truncates the file and begins writing.
4. The process crashes mid-write.
5. The final file is now invalid JSON or only half the expected data.

**What the fix would likely be:**

Write to a temporary file in the same directory first, then rename it over the final file:

```typescript
const tempFile = `${outputFile}.tmp-${process.pid}`;
await writeFile(tempFile, json, 'utf8');
await rename(tempFile, outputFile);
```

On most local file systems, `rename` within the same directory is atomic. That means readers either see the old complete file or the new complete file, not a half-written file.

**Severity:**

Medium. It is not breaking the current tests, but it is a real robustness issue for generated output files.

## Patch 2: File/Directory Type Collisions

**File:** `src/lib/file-system.ts`, line 11

**What the reviewer found:**

The function calls:

```typescript
await mkdir(dirname(outputFile), { recursive: true });
```

This handles missing parent directories, but it does not explicitly check weird path collisions.

**Why it matters:**

Two collision cases can happen:

1. A parent path component is a file, not a directory.
   Example: `reports` is a file, but output path is `reports/output.json`.
2. The output path itself already exists as a directory.
   Example: `output.json/` is a directory, not a file.

Node will throw in these cases, but the error may be less clear than we want. The review is suggesting we should intentionally detect and report these path problems.

**What the fix would likely be:**

Use `stat`/`lstat` checks before writing:

```typescript
const parentDir = dirname(outputFile);
await mkdir(parentDir, { recursive: true });

const existingTarget = await stat(outputFile).catch(() => null);
if (existingTarget?.isDirectory()) {
  throw new Error(`Output path is a directory: ${outputFile}`);
}
```

We may also add tests for:

- Parent component exists as a file.
- Target output path exists as a directory.

**Severity:**

Low to medium. The current code fails, but not as intentionally or clearly as it could.

## Patch 3: Leaky Test State

**File:** `tests/file-system.test.ts`, around line 31

**What the reviewer found:**

The test file uses one shared mutable variable:

```typescript
let tempDir: string | undefined;

async function createTempDir() {
  tempDir = await mkdtemp(join(tmpdir(), 'lume-sebi-file-system-'));
  return tempDir;
}
```

Then `afterEach` deletes only the latest value of `tempDir`.

**Why it matters:**

This is okay while each test creates only one temp directory. But it is fragile:

- If a test creates two temp dirs, only the second one is cleaned.
- If setup fails after creating a temp dir but before assigning it correctly, cleanup can miss it.
- If future tests run concurrently, shared mutable state can cause cross-test interference.

**What the fix would likely be:**

Track all created temp directories in an array:

```typescript
const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'lume-sebi-file-system-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});
```

Or avoid shared state by creating and deleting temp dirs inside each test with `try/finally`.

**Severity:**

Low. This is a test hygiene issue, not a production bug.

## Patch 4: Lazy Test Assertions

**File:** `tests/file-system.test.ts`, around line 119

**What the reviewer found:**

The directory creation test currently checks:

```typescript
await expect(stat(outputFile)).resolves.toMatchObject({ isFile: expect.any(Function) });
```

This only proves that `stat(outputFile)` resolved and returned an object with an `isFile` function. Every `Stats` object has an `isFile` function, even if the path is not a regular file.

It does not actually call `isFile()`.

**Why it matters:**

The test name says the utility creates missing parent directories before writing. The assertion should prove the final target is an actual file.

**What the fix would likely be:**

Call `isFile()` explicitly:

```typescript
const outputStats = await stat(outputFile);
expect(outputStats.isFile()).toBe(true);
```

This is a stronger, more honest assertion.

**Severity:**

Low. The current implementation probably works, but the test is weaker than it looks.

## Patch 5: Sloppy Copy-Paste Artifacts

**File:** `tests/file-system.test.ts`, around line 33

**What the reviewer found:**

This likely refers to small test-code rough edges rather than a runtime bug. In the current file, the most likely examples are:

- Generic temp helper state named only `tempDir`, even though future tests may need multiple directories.
- Repeated setup lines in every test:

```typescript
const dir = await createTempDir();
const outputFile = join(dir, 'output.json');
```

- A weak assertion pattern in the directory test that looks copied from a generic `toMatchObject` style.

**Why it matters:**

Copy-paste artifacts make tests harder to maintain. The tests still pass, but future edits are more likely to preserve weak patterns or duplicate setup inconsistently.

**What the fix would likely be:**

Clean up the test helpers so the intent is explicit:

```typescript
async function createOutputPath(...segments: string[]) {
  const dir = await createTempDir();
  return join(dir, ...segments);
}
```

Then tests can say:

```typescript
const outputFile = await createOutputPath('nested', 'reports', 'output.json');
```

That removes repeated setup and makes each test read closer to the behavior being verified.

**Severity:**

Low. This is maintainability cleanup.

## Recommended Patch Order

1. Fix lazy assertions first. It is small and improves test trust immediately.
2. Fix leaky test state and cleanup helper naming.
3. Add tests for file/directory collisions.
4. Implement clearer collision handling in `writePipelineOutput`.
5. Add an atomic-write test.
6. Implement temp-file-plus-rename atomic writing.

## Summary

| # | Finding | Type | Severity | Main Point |
|---|---|---|---|---|
| 1 | Non-Atomic Write & Corruption Risk | Production robustness | Medium | Avoid leaving partial `output.json` files after interrupted writes. |
| 2 | File/Directory Type Collisions | Production error clarity | Low-Medium | Detect invalid path states explicitly. |
| 3 | Leaky Test State | Test hygiene | Low | Avoid shared temp-dir cleanup that can miss files later. |
| 4 | Lazy Test Assertions | Test correctness | Low | Actually assert `stats.isFile()`, not just that the method exists. |
| 5 | Sloppy Copy-Paste Artifacts | Test maintainability | Low | Clean up repeated and weak test helper patterns. |

## Bottom Line

Gemini's suggestions are mostly quality hardening, not evidence that Story 1.5 failed its original acceptance criteria.

Patch 1 is the most important production improvement. Patch 2 improves failure clarity. Patches 3-5 improve test reliability and maintainability.
