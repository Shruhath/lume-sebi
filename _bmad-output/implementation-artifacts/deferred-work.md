# Deferred Work

## Deferred from: code review of 1-1-initialize-minimal-typescript-cli-project (2026-05-10)

- CLI executes side effects at module scope (`program.parse()` at top level in `src/cli.ts`) — makes entry point untestable if imported. Acceptable for scaffolding; refactor to `main()` function when CLI gains real logic.
- `tsconfig.json` excludes `tests/` directory — `tsc --noEmit` won't type-check test files. Vitest handles transpilation, but consider a `tsconfig.test.json` if CI runs `tsc` separately.
- No `@types/pdf-parse` in devDependencies — verify if types are bundled when `pdf-parse` is first imported in Story 1.3.
- No `engines` field in `package.json` — ESM + NodeNext requires Node 18+. Add `"engines": {"node": ">=18"}` when convenient.

## Deferred from: code review of 1-5-write-extracted-data-to-json.md (2026-05-11)

- Concurrency & File Locking [src/lib/file-system.ts:12] — Concurrent calls to `writePipelineOutput` for the same path could cause race conditions. Multi-file orchestration is deferred to Epic 2.
- I/O Coupling to Schema [src/lib/file-system.ts:7] — Coupling the low-level I/O utility to `PipelineOutputSchema` limits reusability. The spec explicitly mandated this internal validation for story 1.5.
- Error Enrichment [src/lib/file-system.ts:12] — Raw Node.js errors (`EACCES`, `ENOSPC`) are bubbled without path context. Better error wrapping should be considered when robust error reporting is implemented.
