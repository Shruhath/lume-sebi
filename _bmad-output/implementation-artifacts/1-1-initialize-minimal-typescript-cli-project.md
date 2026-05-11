# Story 1.1: Initialize Minimal TypeScript CLI Project

Status: done

## Story

As an engineer,
I want to initialize a minimal Node.js/TypeScript project with Commander, Zod, Instructor, and Vitest,
so that I have a fast, transparent development environment without boilerplate bloat.

## Acceptance Criteria

1. **Given** an empty repository **When** the initialization command is run **Then** `package.json` and `tsconfig.json` are created.
2. **Given** the project is initialized **When** dependencies are inspected **Then** all production dependencies (`commander`, `dotenv`, `zod`, `@instructor-ai/instructor`, `openai`, `pdf-parse`, `p-limit`) and dev dependencies (`typescript`, `@types/node`, `tsx`, `vitest`) are installed.
3. **Given** the project is initialized **When** the directory structure is inspected **Then** the following directories exist: `src/`, `src/lib/`, `src/schemas/`, `tests/`, `tests/fixtures/`.
4. **Given** the project is initialized **When** `npx tsx src/cli.ts --help` is run **Then** it exits cleanly (no import errors, no crash).
5. **Given** the project is initialized **When** `npm test` is run **Then** Vitest executes and passes (at minimum a smoke test proving the test runner works).

## Tasks / Subtasks

- [x] Task 1: Run project initialization commands (AC: #1, #2)
  - [x] 1.1 Run `npm init -y` to create `package.json`
  - [x] 1.2 Add `"type": "module"` to `package.json` (required: `p-limit` 7.x is ESM-only)
  - [x] 1.3 Install production deps: `npm i commander dotenv zod @instructor-ai/instructor openai pdf-parse p-limit`
  - [x] 1.4 Install dev deps: `npm i -D typescript @types/node tsx vitest`
  - [x] 1.5 Run `npx tsc --init` to generate `tsconfig.json`
  - [x] 1.6 Configure `tsconfig.json` for ESM + Node (see Dev Notes)
  - [x] 1.7 Add npm scripts to `package.json`: `"test"`, `"start"`, `"dev"`
- [x] Task 2: Scaffold directory structure (AC: #3)
  - [x] 2.1 Create `src/` directory
  - [x] 2.2 Create `src/lib/` directory
  - [x] 2.3 Create `src/schemas/` directory
  - [x] 2.4 Create `tests/` directory
  - [x] 2.5 Create `tests/fixtures/` directory
- [x] Task 3: Create minimal entry point (AC: #4)
  - [x] 3.1 Create `src/cli.ts` with Commander setup (--input, --output args)
  - [x] 3.2 Create placeholder `src/pipeline.ts` exporting a stub function
- [x] Task 4: Create Vitest config and smoke test (AC: #5)
  - [x] 4.1 Create `vitest.config.ts` at project root
  - [x] 4.2 Create `tests/setup.ts` (global test setup)
  - [x] 4.3 Create `tests/smoke.test.ts` proving the test runner works
- [x] Task 5: Create project scaffolding files
  - [x] 5.1 Create `.env.example` with `OPENROUTER_API_KEY=your_key_here`
  - [x] 5.2 Create `.gitignore` (node_modules, .env, output.json, dist/, pdfs/)
  - [x] 5.3 Create `pdfs/` input directory with `.gitkeep`

### Review Findings

- [ ] [Review][Patch] `.gitignore` global `*.pdf` pattern will block golden test PDFs in `tests/fixtures/` [.gitignore:6] — Story 1.3 needs committable PDFs; add `!tests/fixtures/*.pdf` negation
- [x] [Review][Defer] CLI executes side effects at module scope (untestable if imported) [src/cli.ts:11-14] — deferred, acceptable for scaffolding stub
- [x] [Review][Defer] `tsconfig.json` excludes `tests/` from type-checking [tsconfig.json:18] — deferred, Vitest handles its own transpilation
- [x] [Review][Defer] Missing `@types/pdf-parse` type definitions [package.json] — deferred, verify when pdf-parse is imported in Story 1.3
- [x] [Review][Defer] No `engines` field for Node.js version constraint [package.json] — deferred, nice-to-have

## Dev Notes

### Critical: ESM Configuration

`p-limit` v7.3.0 is **ESM-only** (`"type": "module"` in its package.json). The project **MUST** set `"type": "module"` in `package.json`. Without this, importing `p-limit` will fail at runtime.

### tsconfig.json Configuration

After running `npx tsc --init`, update `tsconfig.json` with these settings for ESM + Node compatibility:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Key: `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` are required for ESM with Node.js. All imports must use explicit `.js` extensions (e.g., `import { run } from './pipeline.js'`) even though source files are `.ts` — this is standard NodeNext behavior. Alternatively, `tsx` handles this transparently at dev time, but the tsconfig must be correct for type-checking.

### package.json Scripts

```json
{
  "type": "module",
  "scripts": {
    "start": "tsx src/cli.ts",
    "dev": "tsx watch src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
```

### src/cli.ts Minimal Stub

```typescript
import { Command } from 'commander';

const program = new Command();

program
  .name('lume-sebi')
  .description('Director Change ETL Pipeline — extracts board director events from regulatory PDFs')
  .requiredOption('--input <dir>', 'Input directory containing PDF files')
  .option('--output <file>', 'Output JSON file path', './output.json');

program.parse();

const opts = program.opts<{ input: string; output: string }>();
console.log(`Input: ${opts.input}, Output: ${opts.output}`);
```

### Naming Conventions (Mandatory)

- **Files:** `kebab-case` (e.g., `pdf-parser.ts`, `llm-client.ts`, `director-schema.ts`)
- **Functions:** `camelCase` (e.g., `processSinglePdf`, `extractDirectorChanges`)
- **JSON output keys:** `snake_case` (e.g., `company_name`, `effective_date`)
- **Zod schemas:** `PascalCase` + `Schema` suffix (e.g., `DirectorSchema`, `ExtractionSummarySchema`)

### Verified Library Versions (as of 2026-05-10)

| Package | Version | Notes |
|---------|---------|-------|
| commander | 14.0.3 | CLI argument parsing |
| dotenv | 17.4.2 | .env file loading |
| zod | 4.4.3 | Default import is v4 API (`import { z } from 'zod'`) |
| @instructor-ai/instructor | 1.7.0 | Structured LLM output enforcement |
| openai | 6.37.0 | OpenAI SDK (used by Instructor for OpenRouter) |
| pdf-parse | 2.4.5 | PDF text extraction |
| p-limit | 7.3.0 | ESM-only concurrency limiter |
| typescript | 6.0.3 | Type checking |
| tsx | 4.21.0 | TypeScript execution without build step |
| vitest | 4.1.5 | Test framework with native ESM support |

### Project Directory Structure Target

```
lume-sebi/
├── package.json              # "type": "module" REQUIRED
├── tsconfig.json
├── vitest.config.ts
├── .env.example              # OPENROUTER_API_KEY=your_key_here
├── .gitignore
├── src/
│   ├── cli.ts                # Entry point (Commander)
│   ├── pipeline.ts           # Orchestrator stub (placeholder for Story 2.x)
│   ├── lib/                  # Utility modules
│   └── schemas/              # Zod schema definitions
├── tests/
│   ├── setup.ts              # Vitest global setup
│   ├── smoke.test.ts         # Smoke test proving runner works
│   └── fixtures/             # Golden test PDFs (populated in Story 1.3)
└── pdfs/                     # Runtime input directory (git-ignored)
```

### Anti-Patterns to Avoid

- **DO NOT** use Jest — this project uses Vitest exclusively.
- **DO NOT** use CommonJS (`require`/`module.exports`) — project is ESM.
- **DO NOT** install webpack, esbuild, or any bundler — `tsx` handles execution.
- **DO NOT** create a `src/index.ts` — the entry point is `src/cli.ts`.
- **DO NOT** add any extraction logic, LLM calls, or PDF parsing in this story — only scaffolding.

### Project Structure Notes

- Alignment with architecture document: All paths match the architecture spec exactly.
- Tests in `tests/` at root, NOT co-located with source files.
- Zod schemas isolated in `src/schemas/` for modular evolution (NFR6).
- `src/lib/` reserved for `pdf-parser.ts`, `llm-client.ts`, `file-system.ts` (created in later stories).

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Selected Starter: Custom Minimal Setup]
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1]
- [Source: _bmad-output/planning-artifacts/prd.md#Additional Requirements - Starter Template]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6-thinking)

### Debug Log References

No issues encountered during implementation.

### Completion Notes List

- Initialized ESM TypeScript project with `"type": "module"` in package.json
- All 7 production deps and 4 dev deps installed successfully
- Note: npm resolved `zod@3.25.76` (v3) instead of v4 due to `@instructor-ai/instructor@1.7.0` peer dependency on `zod-stream@3.0.0` which requires Zod v3. This is the correct resolution — all Zod features needed (`.transform()`, `.nullable()`, enums) are available in v3
- `openai@6.37.0` has a peer dependency conflict warning with `zod-stream` (wants `openai@4.47.1`) but npm overrides it and everything works
- tsconfig.json configured for `NodeNext` module/moduleResolution for proper ESM support
- Commander CLI stub responds to `--help` cleanly with correct description and options
- Vitest runs 2 tests (runner smoke + module import) in 144ms, all passing
- Directory structure scaffolded: `src/`, `src/lib/`, `src/schemas/`, `tests/`, `tests/fixtures/`, `pdfs/`

### File List

- package.json (new)
- package-lock.json (new, auto-generated)
- tsconfig.json (new)
- vitest.config.ts (new)
- .env.example (new)
- .gitignore (new)
- src/cli.ts (new)
- src/pipeline.ts (new)
- tests/setup.ts (new)
- tests/smoke.test.ts (new)
- pdfs/.gitkeep (new)
