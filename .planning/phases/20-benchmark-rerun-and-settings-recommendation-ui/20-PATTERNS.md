# Phase 20: Benchmark Rerun & Settings Recommendation UI — Pattern Map

**Mapped:** 2026-05-13
**Files in scope:** 10 (6 new, 4 modified)
**Analogs found:** 9 / 10 (one new directory — `src/data/` — has no analog by design)

## File Classification

| File | New / Modified | Role | Data Flow | Closest Analog | Match Quality |
|------|---------------|------|-----------|----------------|---------------|
| `src/data/model-benchmarks.json` | new | static-data asset | build-time import | (none — new directory) | no-analog |
| `src/types/model-benchmarks.ts` | new | TS schema/types | type-only | `src/types/index.ts` | role-match (thin) |
| `src/lib/benchmarks.ts` | new | pure-function utility (validator + normalizer) | transform | `src/lib/libraryFilterParams.ts` | exact |
| `src/lib/benchmarks.test.ts` | new | Vitest unit test (node env) | test | `src/lib/libraryFilterParams.test.ts`, `src/lib/recordStartState.test.ts` | exact |
| `scripts/benchmark-models.mjs` | new | Node ESM maintainer orchestrator | batch + subprocess + file-I/O | `scripts/release-bump.mjs` | exact (shape) |
| `scripts/render-benchmark-readme.mjs` | new | Node ESM idempotent generator | file-I/O (read JSON, write README block) | `scripts/release-bump.mjs` (atomic write); `scripts/release-bump.test.mjs` (smoke harness shape) | role-match |
| `src/components/settings/SummarySection.tsx` | modified | React component (predicate rewire only) | request-response | the file itself (lines 30–37, 229–245) | self |
| `package.json` | modified | config (scripts entries) | config | `package.json` (existing `release:bump` entry, line 12) | self |
| `.planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` | modified | docs (regex cell backfill) | transform | the file itself (lines 37–45 table) | self |
| `README.md` | modified | docs (insert empty marker block) | static | the file itself | self |

---

## Pattern Assignments

### `scripts/benchmark-models.mjs` (Node ESM orchestrator, batch + subprocess + file-I/O)

**Analog:** `scripts/release-bump.mjs` (locked as canonical per CONTEXT.md D-20 and RESEARCH.md §"Atomic JSON Write")

**Module preamble + repo-root resolution** (analog lines 14–22):

```js
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
```

**Pre-flight refusal pattern with actionable error** (analog lines 47–55, `dirty` check):

```js
// Dirty-tree check (D-05)
const dirty = execSync('git status --porcelain', { encoding: 'utf8', cwd: REPO_ROOT }).trim();
if (dirty && !force) {
  console.error('error: working tree is dirty.');
  console.error('Commit or stash changes first, or re-run with --force.');
  console.error('Uncommitted changes:');
  console.error(dirty.split('\n').map((l) => '  ' + l).join('\n'));
  process.exit(1);
}
```

**Atomic temp-write + rename** (analog lines 86–95, the load-bearing pattern for `src/data/model-benchmarks.json`):

```js
function updatePackageJson(version) {
  const text = readFileSync(PKG_JSON, 'utf8');
  const pkg = JSON.parse(text);
  pkg.version = version;
  const tmp = PKG_JSON + '.bump.tmp';
  const trailing = text.endsWith('\n') ? '\n' : '';
  writeFileSync(tmp, JSON.stringify(pkg, null, 2) + trailing);
  renameSync(tmp, PKG_JSON);
}
```

**Try/catch around mid-update failure with "files may be inconsistent" warning** (analog lines 63–71):

```js
try {
  updatePackageJson(version);
  updateCargoToml(version);
  updateTauriConfJson(version);
} catch (e) {
  console.error(`error: bump failed mid-update: ${e.message}`);
  console.error('One or more files may be in an inconsistent state — review git diff.');
  process.exit(1);
}
```

**Usage helper + argv parsing** (analog lines 32–45):

```js
function usageAndExit(msg) {
  console.error(msg);
  console.error('Usage: bun run release:bump <version> [--force]');
  process.exit(1);
}
// ...
const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith('--'));
const force = args.includes('--force');
```

**What to copy:**
- Pure Node stdlib only (`node:child_process`, `node:fs`, `node:path`, `node:url`) — works under `bun run` and `node` alike (D-20).
- `REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')` for absolute paths from anywhere.
- Single-shot `main()` at the bottom; no top-level await; no module side-effects on import.
- Atomic write: `<target>.bench.tmp` → `writeFileSync` → `renameSync(tmp, target)`. Use `.bench.tmp` suffix (not `.bump.tmp`) to make orphaned temps after a crash trivially distinguishable from release-bump's.
- Preserve trailing newline by sniffing `text.endsWith('\n')` before writing.
- Pre-flight checks each emit ONE `console.error` line naming the failing requirement, then `process.exit(1)`. No stack traces. Mirror the *"working tree is dirty / Commit or stash"* shape — declarative diagnosis + actionable next step.
- Wrap the per-model loop in a single try/catch that prints `"One or more files may be in an inconsistent state"` on partial failure (the harness writes the run-output `.md` files incrementally, so a mid-run crash CAN leave the tree dirty — say so).
- `--model <name>` and `--force` parsed with the same `args.find(a => !a.startsWith('--'))` / `args.includes('--force')` shape.

**What NOT to copy:**
- The shebang — `release-bump.mjs` has no shebang (line 1 is JSDoc) and the new scripts should also have none, per the explicit RESEARCH.md note *"Node ESM, no shebang, no `bun` runtime APIs — pure Node"* (RESEARCH §"Standard Stack" + CONTEXT D-20). Do not add `#!/usr/bin/env node`.
- The version-regex / Cargo TOML parsing logic — irrelevant; the new script reads transcripts, calls Ollama, and writes JSON.
- Synchronous-only style — `release-bump.mjs` is purely `execSync` because file IO dominates; the benchmark harness needs `await fetch(...)` for the Ollama HTTP API. Use `async function main()` and `main().catch(...)` at the bottom. The atomic-write helper stays sync (`writeFileSync` + `renameSync`).
- The `--force` semantics around a dirty tree — release-bump refuses dirty trees because it MUTATES files the maintainer is also editing. The benchmark harness mutates `src/data/model-benchmarks.json` and the v1.1 `BENCHMARK.md` regardless of tree state; dirty-tree refusal would block the very workflow this script enables. **Replace dirty-tree refusal with a `-dirty` SHA suffix + warning** per CONTEXT.md D-17a.

---

### `scripts/render-benchmark-readme.mjs` (Node ESM idempotent generator)

**Analog:** `scripts/release-bump.mjs` (atomic write); `scripts/release-bump.test.mjs` (smoke-test harness shape if a self-test is added — explicitly optional per CONTEXT.md "Discretion")

**Reuse the same atomic-write helper** from `benchmark-models.mjs` (do not duplicate — either both scripts import a `scripts/_atomicWrite.mjs` shared helper or inline the same 6-line function in both; planner's call, but stay consistent).

**Marker-anchored region replacement pattern** (no exact analog in repo — closest is `release-bump.mjs:115–135` updating a single `version = "x.y.z"` line inside `[package]`):

```js
// Pattern shape — adapt from release-bump.mjs:115-135:
const BEGIN = '<!-- BEGIN:BENCHMARK_TABLE -->';
const END = '<!-- END:BENCHMARK_TABLE -->';

function replaceBetweenMarkers(text, body) {
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(`README marker block not found (looked for ${BEGIN} ... ${END})`);
  }
  const before = text.slice(0, begin + BEGIN.length);
  const after = text.slice(end);
  return `${before}\n${body}\n${after}`;
}
```

**What to copy:**
- Idempotent re-run: reads README, regenerates the body between markers, writes atomically. Running twice produces identical output.
- Anchor by exact comment string, not by line number — per CONTEXT.md D-26: *"the script tolerates the markers being moved between P20 and P23 (re-find by exact marker comment, not by line number)"*.
- Same `console.error` + `exit(1)` shape on missing markers (single actionable error: name the markers verbatim in the message so the maintainer can grep for them).
- Read `src/data/model-benchmarks.json` via the same hand-rolled `validateBenchmarks` from `src/lib/benchmarks.ts` — but note: this script runs in pure Node, NOT under Vite, so the import is a dynamic `JSON.parse(readFileSync(...))` followed by `validateBenchmarks(raw)`. Do NOT `import benchmarks from '../src/data/model-benchmarks.json'` from a .mjs script (works in some Node versions via `--experimental-json-modules` but not portable). Read + JSON.parse manually.
- Atomic write to `README.md` via `<target>.bench-readme.tmp` → `renameSync`.

**What NOT to copy:**
- Any `git status` dirty-tree check — generators should be re-runnable regardless of tree state (the maintainer runs this between JSON regen and committing).
- The hardcoded `PKG_JSON` / `CARGO_TOML` / `TAURI_JSON` constants — this script only touches `README.md` and reads `src/data/model-benchmarks.json`.
- Any markdown-AST parsing (remark-parse etc.) — CONTEXT.md D-19 forbids new deps; the marker-anchored substring replace is sufficient and is the exact strategy used for the README badges in many OSS projects.

---

### `src/lib/benchmarks.ts` (pure-function utility: `validateBenchmarks` + `matchesBenchmarkModel`)

**Analog:** `src/lib/libraryFilterParams.ts` (pure functions, no React, no IO, importable from any context — exact match for role)

**Top-level pure-function pattern** (analog lines 1–18):

```ts
import { addDays, format, parseISO } from 'date-fns';
import type { LibraryFilters } from '../types';

export function durationBounds(range: LibraryFilters['durationRange']): { min: number; max: number } {
  if (range === 'short') {
    return { min: 0, max: 900 };
  }
  // ... narrow branches, explicit defaults, no fallthrough
  return { min: 0, max: 0 };
}
```

**Type-only import from `../types`** (analog line 2):

```ts
import type { LibraryFilters } from '../types';
```

The new file uses the same shape but imports from a dedicated typed entry (`../types/model-benchmarks`) instead of the catch-all `../types` barrel — because the schema is large enough to warrant its own file (D-18) and keeping it out of `src/types/index.ts` avoids polluting the global types barrel that every component imports from.

**What to copy:**
- One file per concern: validator + normalizer co-located because they both operate on the same JSON shape and have shared callers. Co-located unit tests as `.test.ts` next to the source (analog: `libraryFilterParams.test.ts`).
- Named exports only (no default exports). Matches the rest of `src/lib/`.
- Each helper has a narrow, documented input/output contract. `durationBounds` returns `{ min: number; max: number }`; `matchesBenchmarkModel` returns `boolean`; `validateBenchmarks` returns `BenchmarkData`.
- Error throw shape from RESEARCH.md §"Pattern 2": custom `BenchmarksValidationError extends Error` class so the Settings UI can `catch (e) { if (e instanceof BenchmarksValidationError) ... }`. Keep the class private to the module (do not export it from the barrel) unless a caller needs to discriminate.
- Hand-rolled `asserts v is T` type-guard helpers (`assertObject`, `assertString`, `assertNumber`, `assertVerdict`) with precise `path` strings (`$.models[0].name`) — gives the maintainer a one-line "what is broken and where" on schema drift.

**What NOT to copy:**
- No date-fns or any other domain-specific dep. The validator is pure TS + stdlib.
- No silent fallback to defaults — `validateBenchmarks` THROWS on shape mismatch (D-18). Do not mimic `durationBounds`'s "return zeros on unknown range" pattern; that pattern fits filter-input ergonomics, not schema validation.
- Don't move `BenchmarkData` types into this file — keep them in `src/types/model-benchmarks.ts` (D-18) and import them as `import type { ... }`.

---

### `src/lib/benchmarks.test.ts` (Vitest unit test, Node environment)

**Analog:** `src/lib/libraryFilterParams.test.ts` (exact match — same directory, same `.test.ts` extension, same Vitest Node project per RESEARCH.md Pitfall 4)

**Import + describe + it pattern** (analog lines 1–4, 19–25):

```ts
import { describe, expect, it } from 'vitest';

import type { LibraryFilters } from '../types';
import { buildMeetingFilterParams, durationBounds } from './libraryFilterParams';

// ...

describe('durationBounds', () => {
  it('maps each duration preset', () => {
    expect(durationBounds('all')).toEqual({ min: 0, max: 0 });
    expect(durationBounds('short')).toEqual({ min: 0, max: 900 });
    // ...
  });
});
```

**Test-data builder helper** (analog lines 6–17):

```ts
const baseFilters: LibraryFilters = {
  search: '', status: '', durationRange: 'all', audioSource: '', dateFrom: '', dateTo: '',
};

function buildFilters(partial: Partial<LibraryFilters>): LibraryFilters {
  return { ...baseFilters, ...partial };
}
```

Mirror for benchmarks: a `validBenchmarkRaw` constant + `buildBenchmark(partial)` helper that returns a deep-cloned `BenchmarkData`-shaped object so individual tests can mutate one field and assert that `validateBenchmarks` throws.

**What to copy:**
- File name: `.test.ts` (not `.test.tsx`). RESEARCH.md Pitfall 4 is explicit — the wrong extension picks up the jsdom project and silently skips OR pulls in DOM globals.
- Imports from `vitest`: `describe`, `expect`, `it` (named — not the bare `test` from `node:test` that `release-bump.test.mjs` uses).
- One `describe(name, ...)` block per exported function — `describe('validateBenchmarks', ...)`, `describe('matchesBenchmarkModel', ...)`.
- Specific test cases dictated by CONTEXT.md D-31: `:latest` suffix tolerance, case sensitivity (case-sensitive — Ollama model names ARE), empty-JSON-row tolerance, missing-verdict tolerance.
- Use `.toEqual` for structural equality, `.toBe` for primitives, `.toThrow(BenchmarksValidationError)` for error path assertions (Vitest supports class arguments).
- Test file co-located next to source (`src/lib/benchmarks.test.ts` next to `src/lib/benchmarks.ts`) — the established convention here.

**What NOT to copy:**
- `node:test` / `node:assert` (used by `scripts/release-bump.test.mjs` for the script-level smoke test) — that pattern is specific to .mjs scripts that can't easily run under Vitest. The new `benchmarks.test.ts` is a normal TS unit test under Vitest's Node project.
- No `@testing-library/react` imports, no `render(...)` calls — neither function under test touches React.
- Do not test that `recordStartState.test.ts`-style nested-conditional fan-out — the validator's branches are linear (each field, in order); test each assertion independently rather than building a 16-case truth table.

---

### `src/types/model-benchmarks.ts` (TS schema/types only)

**Analog:** `src/types/index.ts` (thin — currently a barrel of UI types; lines 1–4 show the type-alias + `interface` mix; lines 6–22, 29–36 show the `Meeting` and `LibraryFilters` shapes)

**Type-alias + interface pattern** (analog lines 1–4, 27, 29–36):

```ts
export type AppView = 'record' | 'library' | 'settings';
export type SettingsTab = 'general' | 'recording' | 'transcription' | 'summary' | 'data' | 'about';

export interface LibraryFilters {
  search: string;
  status: Meeting['status'] | '';
  durationRange: 'all' | 'short' | 'medium' | 'long';
  audioSource: string;
  dateFrom: string;
  dateTo: string;
}
```

**What to copy:**
- `export type` for string-union/enum-style aliases (e.g., `Verdict = 'recommended' | 'alternate' | null`).
- `export interface` for object shapes (e.g., `BenchmarkData`, `BenchmarkModel`, `HardwareTier`, `Methodology`, `QualityScores`, `SpeedScores`).
- Optional fields use `?:` not `| undefined` (matches `Meeting.audio_path: string | null` vs `LibraryFilters.search: string` discipline — present-but-nullable is `string | null`, structurally-absent is `field?:`).
- File-internal types stay un-exported; only the top-level `BenchmarkData` and the leaf shapes the validator returns are exported.

**What NOT to copy:**
- Do NOT add `src/types/model-benchmarks.ts` exports to `src/types/index.ts`. The schema is large (D-17 shows ~30 nested fields) and the barrel currently has zero JSON-schema-style types. Keep it dedicated — Settings UI imports from `'../../types/model-benchmarks'` directly, mirroring how heavyweight typed modules in other React projects stay out of catch-all barrels.
- No runtime values in this file. No `const` exports. If the validator needs a list of valid verdicts at runtime, define it in `src/lib/benchmarks.ts` as `const VERDICTS = ['recommended', 'alternate', null] as const;` and derive the type via `(typeof VERDICTS)[number]`.

---

### `src/data/model-benchmarks.json` (static-data asset, build-time import)

**Analog:** None. `src/data/` does not exist in the repo today (verified — `ls src/data/` returns "doesn't exist"). This is a new directory.

**What to copy from existing patterns:**
- The JSON shape itself is fully specified in CONTEXT.md D-17 — verbatim.
- File ends with a trailing newline (matches the project-wide pattern enforced by `release-bump.mjs:92`'s `text.endsWith('\n') ? '\n' : ''` discipline; the harness's `writeJsonAtomic` always appends `'\n'`).
- 2-space indent (matches `JSON.stringify(pkg, null, 2)` in `release-bump.mjs:93`).
- The file is committed to git (it ships in the user bundle as a Vite static import — per CONTEXT.md "Scope anchors: Only `src/data/model-benchmarks.json` (static data) is shipped").

**What NOT to copy:**
- No JSON Schema (`.json` schema spec) sidecar (D-19). The TS validator is the only enforcement.
- No comments (JSON-with-comments / JSONC) — Vite's JSON import expects strict JSON.
- Don't store rendered Markdown summaries inside the JSON. Quality-pass outputs live under `.planning/phases/20-.../runs/<model>/quality/<transcript>.md` (D-22a), not inline in the JSON.

---

### `src/components/settings/SummarySection.tsx` (modified — line 35 predicate rewire + module-scope import)

**Analog:** the file itself. The pattern is a localized surgical edit, not a copy from elsewhere.

**Before** (the file, lines 1–10 and lines 30–37):

```tsx
import { Channel, invoke } from '@tauri-apps/api/core';
import { Loader2, RotateCw, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSummaryGeneration } from '../../contexts/SummaryGenerationContext';
import { useSetting } from '../../hooks/useSettings';
import { DEFAULT_SETTINGS } from '../../lib/constants';
import type { OllamaModelInfo, OllamaPullEvent, OllamaStatus } from '../../types';
import { Dropdown } from '../ui/Dropdown';

// ...

function formatModelLabel(model: OllamaModelInfo): string {
  const download = model.downloadSize ? ` · ${model.downloadSize}` : '';
  const normalizedSize = model.parameterSize?.toLowerCase();
  const sizeIncludedInName = normalizedSize ? model.name.toLowerCase().endsWith(`:${normalizedSize}`) : false;
  const size = model.parameterSize && !sizeIncludedInName ? ` · ${model.parameterSize}` : '';
  const rec = model.name === 'phi4-mini' || model.name === 'phi4-mini:latest' ? ' · Recommended' : '';  // ← the load-bearing line
  return `${model.name}${download}${size}${rec}`;
}
```

**Call sites that need the signature update** (the file, lines 229–245):

```tsx
const modelDropdownOptions = useMemo(
  () =>
    modelOptions.map((model) => ({
      value: model.name,
      label: formatModelLabel(model),          // ← becomes formatModelLabel(model, t('model_recommended'))
    })),
  [modelOptions],                              // ← add `t` to the dep array
);

const pullModelDropdownOptions = useMemo(
  () =>
    availablePullModels.map((model) => ({
      value: model.name,
      label: formatModelLabel(model),          // ← becomes formatModelLabel(model, t('model_recommended'))
    })),
  [availablePullModels],                       // ← add `t` to the dep array
);
```

**Target shape after rewire** (per CONTEXT.md D-29, D-30, D-30a option (a) — recommended in RESEARCH.md):

```tsx
import benchmarksRaw from '../../data/model-benchmarks.json';
import { validateBenchmarks, matchesBenchmarkModel } from '../../lib/benchmarks';
const BENCHMARKS = validateBenchmarks(benchmarksRaw);

function formatModelLabel(model: OllamaModelInfo, recommendedLabel: string): string {
  const download = model.downloadSize ? ` · ${model.downloadSize}` : '';
  const normalizedSize = model.parameterSize?.toLowerCase();
  const sizeIncludedInName = normalizedSize ? model.name.toLowerCase().endsWith(`:${normalizedSize}`) : false;
  const size = model.parameterSize && !sizeIncludedInName ? ` · ${model.parameterSize}` : '';
  const recommended = BENCHMARKS.models.some(
    (b) => b.verdict === 'recommended' && matchesBenchmarkModel(model.name, b.name),
  );
  const rec = recommended ? ` · ${recommendedLabel}` : '';
  return `${model.name}${download}${size}${rec}`;
}
```

**What to copy:**
- Module-scope `const BENCHMARKS = validateBenchmarks(benchmarksRaw)` — runs ONCE at module load, not per render. If the JSON is malformed (which can only happen if the maintainer ships a broken file — caught in PR review and by the validator's own unit tests), the import throws synchronously at app startup, which is the correct fail-fast behavior.
- `useTranslation('settings')` is already in scope at the component top (line 45). The `t('model_recommended')` key already exists (`src/i18n/locales/{en,pl}/settings.json:147`, confirmed in CONTEXT.md "Reusable Assets"). Just pass `t('model_recommended')` as the second arg to `formatModelLabel` at both call sites (lines 233 and 242).
- Add `t` to the `useMemo` dependency arrays (lines 235 and 244) — `t` is stable from `react-i18next` across renders but ESLint react-hooks/exhaustive-deps will warn otherwise.
- Keep the inline `· Recommended` suffix presentation (D-32: "No new UI components"). The visual is identical; only the predicate changes.

**What NOT to copy:**
- Do NOT call `useTranslation` inside `formatModelLabel` — RESEARCH.md Pitfall 5 explicitly forbids. `formatModelLabel` is a plain function called inside `.map()` callbacks; hook calls there violate rules-of-hooks.
- Do NOT add a `recommended: boolean` field to `OllamaModelInfo` on the Rust side — CONTEXT.md "Reusable Assets" §`OllamaModelInfo` is explicit: *"layers a separate `BenchmarkData` lookup on top via the model name; it does **not** extend `OllamaModelInfo` with a `recommended` field on the Rust side (that would couple Ollama protocol surface to maintainer benchmark data — wrong layering)"*.
- Do NOT change `currentModel`, `DEFAULT_SETTINGS.ollamaModel`, or any startup model-selection logic. CONTEXT.md "Files this phase modifies" §`src/lib/constants.ts` is explicit that v1.3 leaves `ollamaModel: 'phi4-mini'` as the literal constant and lets JSON drive only the BADGE, not the default selection.
- Do NOT add new component-level tests for the rewire. The existing `src/contexts/OllamaSetupContext.test.tsx` is a context-level integration test that doesn't touch `formatModelLabel`; the badge-predicate change is covered transitively by the existing render flow and directly by the new `src/lib/benchmarks.test.ts` unit tests on `matchesBenchmarkModel` + `validateBenchmarks`. (Sufficient per CONTEXT.md D-31; revisit only if the planner spots a regression risk.)

---

### `package.json` (modified — add two script entries)

**Analog:** the file itself, line 12 — `release:bump` is the precedent.

**Existing pattern** (line 12):

```json
"release:bump": "node scripts/release-bump.mjs"
```

**Target additions** (per CONTEXT.md D-20, D-25):

```json
"benchmark": "node scripts/benchmark-models.mjs",
"benchmark:render-readme": "node scripts/render-benchmark-readme.mjs"
```

**What to copy:**
- `node scripts/<name>.mjs` form (NOT `bun run`, NOT `tsx`, NOT `node --experimental-...`) — matches the project-wide invocation pattern.
- Colon-namespaced sub-commands (`benchmark:render-readme`) — same convention as `release:bump`.
- Alphabetical-ish placement: insert between `release:bump` and the closing brace of `"scripts"`, keeping the existing ordering rough sanity.
- Zero new `dependencies` or `devDependencies` entries (D-19, RESEARCH §"Installation: Zero new npm packages").

**What NOT to copy:**
- Do not add `"benchmark:test"` or `"benchmark:self-test"` — the harness self-test is explicitly out of scope (CONTEXT.md "Discretion", RESEARCH §"Deferred Ideas").
- Do not modify `version`, `dependencies`, `devDependencies`, or any other top-level field. Surgical 2-line insertion only.

---

### `.planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` (modified — regex cell backfill)

**Analog:** the file itself, lines 37–45 (the existing iteration table).

**Existing table shape that must be preserved** (lines 35–45):

```markdown
| Transcript | Iteration | Prompt Version | Action Items | Decisions | Key Points | Sections | PASS/FAIL |
|------------|-----------|----------------|--------------|-----------|------------|----------|-----------|
| 15min | 0 (baseline) | baseline prompt, no explicit `num_predict` | PENDING | PENDING | PENDING | PENDING | PENDING |
| 45min | 0 (baseline) | ... | PENDING | PENDING | PENDING | PENDING | PENDING |
| 90min | 0 (baseline) | ... | PENDING | PENDING | PENDING | PENDING | PENDING |
| 15min | 1 (`num_predict`) | ... | PENDING | PENDING | PENDING | PENDING | PENDING |
| 45min | 1 (`num_predict`) | ... | PENDING | PENDING | PENDING | PENDING | PENDING |
| 90min | 1 (`num_predict`) | ... | PENDING | PENDING | PENDING | PENDING | PENDING |
| 15min | 2 (tuned prompt) | prompt/synthesis instructions strengthened | PENDING | PENDING | PENDING | PENDING | PENDING |
| 45min | 2 (tuned prompt) | prompt/synthesis instructions strengthened | PENDING | PENDING | PENDING | PENDING | PENDING |
| 90min | 2 (tuned prompt) | prompt/synthesis instructions strengthened | PENDING | PENDING | PENDING | PENDING | PENDING |
```

**Backfill scope** (CONTEXT.md D-34, D-35, D-36):
- ONLY rows where `Iteration` column starts with `2 (tuned prompt)` — three rows (15min, 45min, 90min).
- Replace each row's 5 `PENDING` cells with measured values; preserve everything else verbatim (the surrounding "Environment Status" / "Findings" / "Final Prompt Text" sections are historical).
- Append a footnote AFTER the table (per RESEARCH §"Pattern 6") explaining that iterations 0 and 1 are unrecoverable.

**Regex strategy** (from RESEARCH §"Pattern 6"):

```js
// Pseudocode for the per-row replacement in scripts/benchmark-models.mjs:
const ITERATION_2_ROW_RE = /^(\| (15min|45min|90min) \| 2 \(tuned prompt\) \|[^|]+) \| PENDING \| PENDING \| PENDING \| PENDING \| PENDING \|$/gm;
text = text.replace(ITERATION_2_ROW_RE, (_, prefix, transcript) => {
  const row = scoresByTranscript[transcript];
  return `${prefix} | ${row.action_pct}% | ${row.decision_pct}% | ${row.keypoints_pct}% | ${row.sections_ok ? '✓' : '✗'} | ${row.pass ? 'PASS' : 'FAIL'} |`;
});
```

**What to copy:**
- Marker-anchored / regex-anchored cell replacement only — do not rewrite the table structurally.
- Preserve the exact column count (8 columns, 7 pipes between cells, leading + trailing pipes).
- Preserve the iteration-0 and iteration-1 PENDING rows untouched (D-36 — they're unrecoverable; the footnote, not silent backfill, explains why).
- Atomic write (mirror `release-bump.mjs:148-151` `tauri.conf.json` pattern — read original, transform, write to `.bench.tmp`, rename).

**What NOT to copy:**
- Do not touch `## Findings`, `## Final Prompt Text`, or `## Environment Status` sections (D-34: *"those are historical context, not data"*).
- Do not add llama3.2:3b rows — v1.1 BENCHMARK.md is phi4-mini-only by scope (D-35). Cross-model comparison lives in `src/data/model-benchmarks.json`, not here.
- Do not change the `## Environment Status` paragraph (lines 7–23). It correctly describes the v1.1 environment; v1.3 backfill is a separate event and the footnote (after the table) is the right place to record that.

---

### `README.md` (modified — add empty marker block near bottom)

**Analog:** the file itself (current lines 100–157 show the existing bottom-of-file structure: Tech Stack table, Project Structure, Contributing, Roadmap, License, footer attribution).

**Target insertion shape** (per CONTEXT.md D-26 — empty bracketed block, content rendered in Phase 23):

```markdown
<!-- BEGIN:BENCHMARK_TABLE -->
<!-- END:BENCHMARK_TABLE -->
```

**Placement** (D-26: *"near the bottom for now"* — Phase 23 decides final placement):

- Recommend: between the existing `## Roadmap` (line 139) and `## License` (line 149) sections, or directly above `## License`. Anywhere "near the bottom" satisfies the spec; the script tolerates relocation (D-26).
- Surround the bracketed pair with one blank line above and below so the generator can later expand it into a `## Benchmarks` heading + table + footnote without colliding with adjacent markdown.

**What to copy:**
- HTML-comment markers (`<!-- ... -->`) — invisible in rendered Markdown; standard pattern for `make readme` / `npm run docs` style generators in many OSS projects.
- Exact strings `<!-- BEGIN:BENCHMARK_TABLE -->` and `<!-- END:BENCHMARK_TABLE -->` — case-sensitive, no trailing whitespace inside the markers, no variations (the generator does a literal `indexOf` per D-26).
- Trailing newline preservation if README.md currently has one (which it likely does — verify with `tail -c 1`).

**What NOT to copy:**
- Do NOT add any pre-populated content between the markers. Phase 20 places empty markers; the harness's `render-benchmark-readme.mjs` (or the maintainer running `bun run benchmark:render-readme` AFTER `bun run benchmark`) is what populates them.
- Do NOT add a `## Benchmarks` heading above the markers — Phase 23 (DOCS-01..08) owns the surrounding copy. P20 only places the anchor.
- Do NOT use a single-line marker (e.g., `<!-- BENCHMARK_TABLE -->`) — paired markers (BEGIN + END) are required so the generator's substring replace has a well-defined region to overwrite.

---

## Shared Patterns

### Atomic temp-file + rename writes

**Source:** `scripts/release-bump.mjs:86-95` (and three identical occurrences at `:115-135`, `:138-151`).

**Apply to:** every file write in `scripts/benchmark-models.mjs` and `scripts/render-benchmark-readme.mjs` — specifically `src/data/model-benchmarks.json`, the BENCHMARK.md backfill, and the README.md region replacement.

```js
const tmp = target + '.bench.tmp';
const trailing = originalText.endsWith('\n') ? '\n' : '';
writeFileSync(tmp, newContent + trailing);
renameSync(tmp, target);
```

Use a distinct suffix (`.bench.tmp`) so an orphaned temp from a crashed bench run is distinguishable from a release-bump temp (`.bump.tmp`).

### Pre-flight refusal with single-line actionable error

**Source:** `scripts/release-bump.mjs:47-55` (dirty-tree refusal) — the *"declarative diagnosis + actionable next step + exit 1"* shape.

**Apply to:** every pre-flight check in `scripts/benchmark-models.mjs` (D-21 step 1 — five checks: git rev-parse, python3 version, ollama version, ollama daemon reachable, fixture files exist). Each failing check emits ONE `console.error` block (1–3 lines), then `process.exit(1)`. No stack traces; no generic "Error" prefixes.

Concrete failure messages required by CONTEXT.md D-24:
- Ollama unreachable: `"Ollama not running at http://localhost:11434 — run 'ollama serve' first"`
- Model pull failed: include the model name.
- Evaluator missing: include the path.

### Co-located Vitest unit tests under `src/lib/`

**Source:** `src/lib/libraryFilterParams.test.ts:1-5` + `src/lib/recordStartState.test.ts:1-5`. Both files:
1. Live next to their source (`*.ts` next to `*.test.ts`).
2. Import `{ describe, expect, it } from 'vitest'`.
3. Use a builder helper to construct partial test inputs.
4. Use `.toEqual` / `.toBe` / `.toMatchObject` per assertion style; `.toThrow(ClassName)` for error paths.

**Apply to:** `src/lib/benchmarks.test.ts`. RESEARCH §Pitfall 4 is the canonical reminder to keep the `.test.ts` extension (NOT `.test.tsx`) so the Vitest Node project picks it up.

### Type-only imports from sibling type modules

**Source:** `src/lib/libraryFilterParams.ts:2` — `import type { LibraryFilters } from '../types';`

**Apply to:** `src/lib/benchmarks.ts` — `import type { BenchmarkData, BenchmarkModel, Verdict } from '../types/model-benchmarks';`. The import is type-only to ensure tree-shaking doesn't bundle the validator's type machinery into runtime.

### i18n-driven user-facing strings

**Source:** `src/components/settings/SummarySection.tsx:45` (`const { t } = useTranslation('settings');`) and downstream `t('ollama_pullFailed')`, `t('ollama_connected', { url: ... })`, etc. Plus `src/i18n/locales/{en,pl}/settings.json:147` `model_recommended` (en: "Recommended", pl: "Zalecany") — already present.

**Apply to:** the SummarySection rewire. Replace the hard-coded English literal `" · Recommended"` with `` ` · ${recommendedLabel}` `` where `recommendedLabel = t('model_recommended')` from the call site (D-30a option (a)). This closes a latent i18n bug en route to closing BENCH-05.

---

## No Analog Found

| File | Role | Reason | Planner Action |
|------|------|--------|----------------|
| `src/data/model-benchmarks.json` | static-data JSON | `src/data/` directory does not exist in the repo today (verified) | Create directory; rely on CONTEXT.md D-17 schema verbatim. No analog needed for "JSON file" — the shape is fully specified. |

---

## Metadata

**Analog search scope:**
- `scripts/` — full directory inspected (2 files: `release-bump.mjs`, `release-bump.test.mjs`)
- `src/lib/` — full directory listed; deep-read on `libraryFilterParams.ts/.test.ts` + `recordStartState.ts/.test.ts`
- `src/types/` — full directory listed; deep-read on `index.ts`
- `src/data/` — confirmed nonexistent
- `src/components/settings/SummarySection.tsx` — read lines 1–80 (imports, formatModelLabel) and lines 200–298 (call sites for the rewire)
- `package.json` — full read
- `.planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` — read lines 1–80 (table to backfill)
- `README.md` — read lines 100–157 (insertion location)
- `tsconfig.json` — grep verified `resolveJsonModule: true`, `module: ESNext`, `moduleResolution: bundler`

**Files scanned:** 12
**Pattern extraction date:** 2026-05-13

## PATTERN MAPPING COMPLETE
