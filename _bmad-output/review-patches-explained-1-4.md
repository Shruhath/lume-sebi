# Code Review Patches Explained — Story 1-4

These are the 2 "patch" findings from the Codex code review of `src/lib/llm-client.ts`. Both are minor fixes, not bugs that break tests — they're about making the code match the story spec more precisely.

---

## Patch 1: Extra Export (`LlmExtractionResponseSchema`)

**File:** `src/lib/llm-client.ts`, line 28

**What the reviewer found:**

```typescript
// line 28 — currently exported
export const LlmExtractionResponseSchema = z.object({
  changes: z.array(DirectorChangeSchema),
});
```

The story spec (Task 1.5) says:

> Export `extractDirectorChanges` as the **sole public API**.

But the code also exports `LlmExtractionResponseSchema`. That means the module has **two** exports instead of one.

**Why it matters:**

- The architecture says `llm-client.ts` is an extraction boundary — other modules should only call `extractDirectorChanges(text)` and get back `DirectorChange[]`.
- If `LlmExtractionResponseSchema` is exported, other modules could import and depend on it, creating a tighter coupling than intended.
- The test file (`tests/llm-client.test.ts`) currently imports `LlmExtractionResponseSchema` to test schema validation directly — that's the only consumer.

**The fix:**

Remove the `export` keyword so it becomes a private module-level constant:

```typescript
// Before
export const LlmExtractionResponseSchema = z.object({ ... });

// After
const LlmExtractionResponseSchema = z.object({ ... });
```

Then update the test file to stop importing it. The schema validation tests can either:
- Be removed (the schema is already tested in `tests/schemas.test.ts`)
- Be rewritten to test through `extractDirectorChanges()` instead of importing the schema directly

---

## Patch 2: Missing Cessation/Death Mapping in System Prompt

**File:** `src/lib/llm-client.ts`, line 23

**What the reviewer found:**

The system prompt tells the LLM:

```
- change_type: One of "appointment", "resignation", or "removal" (lowercase only)
```

But Indian regulatory filings (BSE/NSE disclosures) commonly use the words **"Cessation"** and **"Death"** — not "removal". The story's Dev Notes explicitly call this out:

| mydocs Prompt Says | Zod Schema Requires | Fix |
|---|---|---|
| "Cessation", "Death" | `"removal"` | Map Cessation/Death to `"removal"` |

The current prompt tells the LLM to use `"removal"` but never explains that "Cessation" or "Death" in the filing text should be mapped to `"removal"`. The LLM might:
- Return `"cessation"` or `"death"` (Zod rejects → Instructor retries or errors)
- Silently skip those events because it doesn't see them as matching any allowed value

**Why it matters:**

In real filings, "Cessation of Directorship" and "Death of Director" are common phrases. Without explicit mapping instructions, the LLM has to guess that these mean `"removal"`, which reduces extraction reliability.

**The fix:**

Add a mapping instruction to the system prompt:

```
- change_type: One of "appointment", "resignation", or "removal" (lowercase only).
  If the filing uses "Cessation" or "Death", map these to "removal".
```

This makes the prompt unambiguous — the LLM knows exactly how to classify every common Indian regulatory term.

---

## Summary

| # | What | Severity | Impact if unfixed |
|---|---|---|---|
| 1 | Remove `export` from `LlmExtractionResponseSchema` | Low | Unnecessary public API surface; violates story spec |
| 2 | Add Cessation/Death → removal mapping to prompt | Medium | LLM may fail or skip real director events in Indian filings |

Both are quick fixes — Patch 2 is the more important one for production correctness.
