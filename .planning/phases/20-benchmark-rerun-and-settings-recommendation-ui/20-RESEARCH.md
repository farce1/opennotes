# Phase 20: Benchmark Rerun & Settings Recommendation UI - Research

**Researched:** 2026-05-13
**Domain:** Maintainer-only Node ESM benchmark harness + Vite static-JSON-driven Settings UI badge
**Confidence:** HIGH — anchored to direct codebase inspection + Ollama official docs (Context7 `/websites/ollama`) + verified GitHub release history (`gh api repos/ollama/ollama/releases`)

## Summary

Phase 20 has been almost completely de-risked by CONTEXT.md (38 locked decisions). The remaining research surface is narrow and concrete: confirm Ollama timing semantics for the speed-pass measurements, pick a chunked-summarization-reproduction strategy for the 90-min transcript, lock the cross-platform GPU detection commands, and lay down a JSON validator pattern with zero new npm deps.

Most of the work is rote application of three already-established patterns: (1) the `scripts/release-bump.mjs` Node-ESM-with-atomic-temp-rename pattern for the harness, (2) the existing Vitest unit-test pattern in `src/lib/libraryFilterParams.test.ts` for the validator/normalizer, and (3) the existing JSON-import-via-`resolveJsonModule:true` pattern for the Settings UI consumption side.

**Primary recommendation:** Use Ollama's HTTP API directly (`POST /api/generate` with `stream: false` + `keep_alive: 0` for clean unload), parse the documented timing fields (`eval_count` / `eval_duration` / `prompt_eval_duration` — all nanoseconds), reproduce the chunked-summarization path via **option (b) — Node HTTP-level reimplementation mirroring the constants from `llm/mod.rs`** (the chunk math is ~15 lines, the drift risk is low because `llm/mod.rs` chunking constants are stable, and option (a) adds a Rust build dependency for the harness that contradicts the "maintainer-only, zero install friction beyond `node` and `ollama`" spirit of D-20). Hand-rolled discriminated-union type guards for `validateBenchmarks` (no Zod, no Ajv — D-19 forbids new deps).

## User Constraints (from CONTEXT.md)

### Locked Decisions

D-01..D-36 are all locked. Verbatim summary of the ones the planner most needs to honor (full text in `.planning/phases/20-benchmark-rerun-and-settings-recommendation-ui/20-CONTEXT.md`):

- **D-01:** Model lineup is `phi4-mini` (recommended) + `llama3.2:3b` (alternate). Two models, no more.
- **D-02:** Lineup is a data-driven `const MODELS = [...]` array at the top of `scripts/benchmark-models.mjs`.
- **D-04:** Maintainer-written `verdict` field per JSON row. Allowed values: `"recommended"`, `"alternate"`, `null`. No auto-picker.
- **D-05:** Name normalization strips `:latest` suffix. `matchesBenchmarkModel(modelName, jsonRowName)` is a tiny unit-tested helper.
- **D-06:** Multiple rows MAY be `verdict: "recommended"` (forward-compat); v1.3 ships exactly one.
- **D-07..D-11:** Quality + speed in same JSON row. Quality from v1.1 Python evaluator (reused as-is). Speed from new Node orchestrator. Two measurement passes per model: quality pass (production `num_predict: -1`, all 3 transcripts) + speed pass (bounded `num_predict: 512`, 45-min only, N=5 after warmup). Methodology metadata stamped on every row.
- **D-12..D-15:** Hardware tier auto-detected. Single-tier per row in v1.3. Apple Silicon special-cased: `gpu_present: true`, `gpu_model: "Apple <SoC> (integrated, Metal)"`.
- **D-16..D-19:** `src/data/model-benchmarks.json` as Vite static import. Schema v1. TS companion type at `src/types/model-benchmarks.ts`. `validateBenchmarks(raw): BenchmarkData` throws on shape mismatch. NO JSON Schema spec file. NO new npm deps (Zod/Ajv forbidden).
- **D-17a:** `generator_git_sha` captured via `git rev-parse HEAD`; dirty tree appends `-dirty` + warning.
- **D-20..D-24:** Single Node ESM script `scripts/benchmark-models.mjs`. Pre-flight: git rev-parse HEAD, python3 ≥ 3.10, ollama ≥ 0.5.0 (the CONTEXT.md says 0.5.0; actual lower bound is 0.3.11 — see Pitfall 11 below — but enforcing 0.5.0 in the harness is a safe upper bound). `--model <name>` flag for partial reruns. Atomic temp-file + rename writes.
- **D-22a:** Committed audit set: quality-pass outputs only (`runs/<model>/quality/<transcript>.md`, ~6 files). Gitignore warmup + speed pass.
- **D-25..D-28:** Generator script at `scripts/render-benchmark-readme.mjs`. README markers `<!-- BEGIN:BENCHMARK_TABLE -->` / `<!-- END:BENCHMARK_TABLE -->` placed near bottom of README.md in P20.
- **D-29..D-33:** Settings UI imports JSON at module scope, runs through validator, predicate uses `BENCHMARKS.models.some(...)`. `formatModelLabel` cannot call `useTranslation` (it is not a hook). Two equivalent fix paths in D-30a. No new UI components.
- **D-34..D-36:** v1.1 BENCHMARK.md backfill scope = phi4-mini iteration-2 only; iterations 0 & 1 get an explicit "unrecoverable" footnote.

### Claude's Discretion

- **HTTP API vs CLI for Ollama invocation** — researcher recommends HTTP API direct (see §"Ollama HTTP API timing" below). Rationale: timing fields are exposed natively in the response, no CLI parsing of human-readable output.
- **Chunked-summarization reproduction strategy** — researcher recommends option (b) Node HTTP reimplementation. See §"Reproducing the chunked summarization path" below.
- **BENCHMARK.md backfill regex/parser shape** — keep file shape preserved, marker-based table-cell replacement.
- **GPU detection edge cases** — first-match heuristics; soft-fail to `gpu_model: null` on any error.
- **Whether to bench 15min on the speed pass too** — researcher recommends NO. Adds 5–10 min runtime, doesn't change the comparison story (D-09's 45-min-only is the canonical decision).
- **Harness self-test** — explicitly not required; v1.3 ships without it.

### Deferred Ideas (OUT OF SCOPE)

- `qwen2.5:3b`, `gemma3:12b`, larger Llama variants — v1.4+
- Multi-machine hardware-tier sweeps — v1.4+
- Auto-recommendation that overrides user choice — out of v1.3 (PROJECT.md)
- Hardware-tier'd "Recommended" badges (multiple `verdict: "recommended"` rows) — UI for tier selection is v1.4 design
- CI assertion that README block matches JSON — deferred to Phase 23 (DOCS-07)
- Real-time per-user benchmark — out of v1.3 scope
- Visual badge redesign (chip/icon/color) — ROADMAP P20 explicitly forbids; v1.4+
- JSON Schema (`.json` schema spec) file — over-engineering for single producer + consumer
- `scripts/benchmark-models.test.mjs` self-test with mock Ollama — v1.3 doesn't require it

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BENCH-01 | phi4-mini benchmark scores backfilled in v1.1 BENCHMARK.md from a live Ollama run | §"v1.1 BENCHMARK.md backfill mechanics" — marker-anchored cell replacement preserves iteration-0/1 footnotes (D-36) |
| BENCH-02 | Benchmark rerun uses warmup + N=5 + median methodology with a hardware-tier stamp | §"Ollama HTTP API timing" (timing fields), §"Hardware detection commands" (cross-platform), Pitfall 7 in PITFALLS.md (methodology rationale) |
| BENCH-03 | At least one alternate model beyond phi4-mini benchmarked | D-01 locks `llama3.2:3b`. Pull command + lineup-config-array shape in §"Harness orchestrator shape" |
| BENCH-04 | Benchmark results emitted to `src/data/model-benchmarks.json` as single source of truth | §"JSON schema validation pattern (no new deps)" + §"Vite static JSON import" + §"Atomic JSON write pattern in Node ESM" |
| BENCH-05 | SummarySection.tsx displays the "★ Recommended" badge from a `model-benchmarks.json` lookup; no hard-coded badge string | §"Settings UI rewire" — the `formatModelLabel` signature change (D-30a option (a) recommended) + the validator import at module scope |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Benchmark execution (live Ollama calls, evaluator subprocess, timing capture, JSON emission) | **Maintainer dev machine** (Node ESM script) | — | Maintainer-only per PROJECT.md §Out of Scope; never runs on the user's machine |
| Benchmark data persistence | **Repo static asset** (`src/data/model-benchmarks.json`) | — | Versioned, code-reviewable, ships in the user bundle as JSON; `generator_git_sha` ties it to a commit |
| Quality scoring | **Python subprocess** (`evaluate.py`, v1.1 evaluator reused as-is) | Node orchestrator (stdout parse) | Reuse, not rewrite — Python evaluator is the authoritative scorer per D-21 |
| Speed timing capture | **Ollama HTTP API** (`/api/generate` response timing fields) | Node orchestrator (wall-clock fallback for `time_to_first_token_ms` if streaming) | Documented `eval_count`/`eval_duration` are nanoseconds and directly support `tokens_per_sec` derivation |
| Hardware tier detection | **Node `os` module** + per-platform shell-out (`system_profiler` / `lspci` / PowerShell `Get-CimInstance`) | — | All cross-platform, all wrapped in try/catch with `gpu_model: null` soft-fail (D-13) |
| Chunked summarization reproduction (90-min transcript) | **Node orchestrator** (HTTP-level reimplementation, mirroring `MAP_CHUNK_CHARS=80_000`, `MAP_CHUNK_OVERLAP_CHARS=2_000`, `MAX_SINGLE_PASS_CHARS=96_000` from `llm/mod.rs`) | — | Option (b) per Claude's Discretion; cleanest tradeoff. See §"Reproducing the chunked summarization path" |
| Recommendation badge predicate | **React UI** (`SummarySection.tsx`) — module-scope JSON import + validator + `BENCHMARKS.models.some(...)` lookup | i18n (`t('model_recommended')`) | Data, not code: removing the recommended row from JSON flips the badge with no code change (success criterion 4) |
| README table rendering | **Node ESM generator** (`scripts/render-benchmark-readme.mjs`) | — | Same Node + atomic-rename pattern; reads JSON, replaces between marker comments |
| Schema validation | **Pure TS** (`validateBenchmarks` discriminated-union type guard in `src/lib/benchmarks.ts`) | — | No new deps (D-19); isolates downstream UI from schema drift (D-18) |

## Standard Stack

### Core (already in repo, no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js (built-in `fs`, `os`, `child_process`, `path`, `url`) | Node 22+ (matches `scripts/release-bump.mjs`) | Harness IO, GPU detection, subprocess spawn, atomic rename | Pure stdlib; works under `bun run` or `node`; mirrors P19's pattern |
| Vitest | `^4.0.18` (devDep) | Unit tests for `validateBenchmarks`, `matchesBenchmarkModel` | Existing test framework; project already has `vitest.config` in `vite.config.ts:test` |
| TypeScript | `~5.8.3` | `src/types/model-benchmarks.ts` companion type | Existing; `resolveJsonModule: true` already in `tsconfig.json:12` |
| Vite | `^7.0.4` | Static JSON import bundles into JS chunk | Existing; native JSON import works per `import json from './example.json'` (Context7 `/websites/vite_dev`) |
| Ollama HTTP API | `/api/generate`, `/api/pull`, `/api/tags`, `/api/show` (existing endpoints used by the app) | The harness calls Ollama directly | Same surface the production app uses (`src-tauri/src/llm/mod.rs` lines 231, 301, 346) |
| Python ≥ 3.10 (host requirement, not bundled) | system-installed | Subprocess that runs `evaluate.py` | v1.1 evaluator uses `from __future__ import annotations` + walrus syntax (verified at `evaluate.py:4`) |
| Ollama CLI (host requirement, not bundled) | ≥ 0.3.11 actual lower bound (see Pitfall 11); CONTEXT.md says enforce ≥ 0.5.0 | `ollama pull`, `ollama stop` invocations from the harness | `ollama stop` introduced in v0.3.11 per release notes [VERIFIED: gh api repos/ollama/ollama/releases/tags/v0.3.11] |

### Supporting (already in repo)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-i18next` | `^16.5.4` | `t('model_recommended')` — replaces hard-coded English literal (closes BENCH-05's i18n side-bug) | Pass `recommendedLabel` as a param into `formatModelLabel` (D-30a option (a)) |
| `lucide-react` | `^0.575.0` | (Available if planner needs the `★` glyph as an icon component; D-32 says no new UI so a unicode `★` is fine for the README; Settings UI uses the inline " · Recommended" string as today) | README table only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled type guard | Zod (`zod` npm package) | Zod is dramatically more ergonomic for schema validation but adds a runtime dep — D-19 explicitly forbids. Use hand-rolled guards for v1.3, revisit if schema complexity grows. |
| Hand-rolled type guard | Ajv (`ajv` npm package) + JSON Schema | Same as Zod — adds a dep. Plus would require a `.json` schema spec file which D-19 says don't ship. |
| HTTP API direct | `ollama-js` npm package (`ollama@0.6.3` on npm registry, modified 2026-02-20) [VERIFIED: `npm view ollama version`] | Adds a runtime dep for the harness; the HTTP API surface we need is 3 endpoints; the SDK adds value only if we're doing chat/streaming UX. Skip. |
| HTTP API direct | Shell out to `ollama run <model> <prompt>` CLI | CLI output is human-readable text; would need to wall-clock-instrument and re-derive timings the API gives us for free. API wins on every axis (precision, streaming control, structured response). |
| Option (b) Node-level chunk reimplementation | Option (a) thin Rust CLI binary (`src-tauri/src/bin/bench-summarize.rs`) | (a) measures-exactly-what-users-experience but adds a Rust build step + cross-compile concern for the harness. (b) introduces a 15-line drift risk but the chunking constants are stable (have not changed in v1.1 or v1.2 per `git log src-tauri/src/llm/mod.rs`). Pick (b). |
| Option (b) Node reimplementation | Option (c) pure HTTP single-call (no chunking reproduction) | (c) is incorrect: the 90-min transcript is 97,741 chars > 96,000 threshold (verified at `13-llm-quality-tuning/BENCHMARK.md:31`), so a single-call would either OOM or hit context-window truncation. The whole point of the 90-min transcript is to validate the chunked path. Reject. |

**Installation:**
```bash
# Zero new npm packages.
# Zero new Rust crates (no [[bin]] target needed if option (b) is chosen).
# Host requirements (not bundled, validated at harness pre-flight):
#   - Node >= 22 (already required for the project)
#   - python3 >= 3.10  (system-installed)
#   - ollama >= 0.5.0 (or >= 0.3.11; CONTEXT.md D-21 pins 0.5.0 — see Pitfall 11)
#   - Ollama daemon reachable on http://localhost:11434
```

**Version verification:**
- `ollama@0.6.3` (npm SDK, NOT installed — for reference only): published 2026-02-20 [VERIFIED: `npm view ollama version`]
- `ollama` CLI `ollama stop` command: introduced in v0.3.11, released 2024-09-17 [VERIFIED: `gh api repos/ollama/ollama/releases/tags/v0.3.11` — release notes verbatim: *"New `ollama stop` command to unload a running model"*]
- Vitest: `^4.0.18` (`package.json:54`)
- Vite: `^7.0.4` (`package.json:53`)

## Architecture Patterns

### System Architecture Diagram

```
Maintainer's dev machine (one-time per release):
┌────────────────────────────────────────────────────────────────────────┐
│  bun run benchmark  (== node scripts/benchmark-models.mjs)             │
│                                                                         │
│  ┌────────────────┐   PRE-FLIGHT (sequential, fail-fast):              │
│  │ Pre-flight     │   1. git rev-parse HEAD          → generator_git_sha│
│  │                │   2. python3 --version           → assert ≥ 3.10   │
│  │                │   3. ollama --version            → assert ≥ 0.5.0  │
│  │                │   4. curl http://localhost:11434/api/tags          │
│  │                │   5. fixture-file existence check                  │
│  └────────┬───────┘   Each step: single actionable error + exit 1      │
│           │                                                            │
│  ┌────────▼───────┐   HARDWARE DETECT (Node `os` + shell-out):         │
│  │ Hardware       │   - os.cpus()[0].model.trim()                      │
│  │ tier detect    │   - os.totalmem() / 1024^3 (round)                 │
│  │                │   - os.platform() → darwin / win32 / linux         │
│  │                │   - GPU: per-platform exec, try/catch              │
│  │                │     → Apple Silicon special-case (D-13a)           │
│  └────────┬───────┘                                                    │
│           │                                                            │
│  ┌────────▼─────────────────────────────────────────────────────────┐  │
│  │ FOR EACH model in MODELS = [phi4-mini, llama3.2:3b]:             │  │
│  │   ollama pull <model>                  (idempotent)              │  │
│  │   ollama stop <model>                  (clean unload)            │  │
│  │                                                                  │  │
│  │   ┌──────────────────────────────────────────────────────────┐   │  │
│  │   │ WARMUP (discarded)                                        │   │  │
│  │   │   POST /api/generate {stream: false, num_predict: 512,    │   │  │
│  │   │     options: {temperature:0, seed:42}}                    │   │  │
│  │   │   prompt = 15min transcript (single-pass path)            │   │  │
│  │   └──────────────────────────────────────────────────────────┘   │  │
│  │                                                                  │  │
│  │   ┌──────────────────────────────────────────────────────────┐   │  │
│  │   │ QUALITY PASS (1 run × 3 transcripts)                      │   │  │
│  │   │   Production settings: num_predict: -1, temp: 0, seed: 42 │   │  │
│  │   │   For 15min, 45min: single-pass via /api/generate         │   │  │
│  │   │   For 90min (>96,000 chars): chunked path                 │   │  │
│  │   │     - chunk_transcript() mirrors llm/mod.rs:154-187       │   │  │
│  │   │     - synthesis prompt mirrors llm/mod.rs:471-488         │   │  │
│  │   │   Write output → runs/<model>/quality/<transcript>.md     │   │  │
│  │   │   python3 evaluate.py output.md ground_truth.json         │   │  │
│  │   │   Parse stdout → 3 percentages + sections boolean         │   │  │
│  │   └──────────────────────────────────────────────────────────┘   │  │
│  │                                                                  │  │
│  │   ┌──────────────────────────────────────────────────────────┐   │  │
│  │   │ SPEED PASS (N=5 runs × 45min transcript only, post-warmup)│   │  │
│  │   │   Bounded settings: num_predict: 512, temp: 0, seed: 42   │   │  │
│  │   │   Per run: capture eval_count, eval_duration,             │   │  │
│  │   │            prompt_eval_duration, total_duration,          │   │  │
│  │   │            load_duration (from response JSON, nanoseconds)│   │  │
│  │   │   Compute medians over N=5:                               │   │  │
│  │   │     tokens_per_sec = eval_count / (eval_duration / 1e9)   │   │  │
│  │   │     time_to_first_token_ms = prompt_eval_duration / 1e6   │   │  │
│  │   │     e2e_summary_seconds = (separate measurement at        │   │  │
│  │   │       num_predict: -1)                                    │   │  │
│  │   │   Write outputs → runs/<model>/speed/run-<n>.md (gitignored)│  │
│  │   └──────────────────────────────────────────────────────────┘   │  │
│  │                                                                  │  │
│  │   ollama stop <model>  (between-models clean unload)             │  │
│  └────────┬─────────────────────────────────────────────────────────┘  │
│           │                                                            │
│  ┌────────▼──────────────────────────────────────────────────────┐    │
│  │ EMIT (atomic temp-rename, same pattern as release-bump.mjs:90) │    │
│  │   1. src/data/model-benchmarks.json  (single source of truth)  │    │
│  │   2. backfill BENCHMARK.md iteration-2 PENDING rows            │    │
│  │      (regex match each "| 15min | 2 | ... | PENDING |" row)    │    │
│  └────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────┘
                              │
                              │  (commit + push; user install ships JSON only)
                              ▼
End-user app runtime (zero benchmark dependencies on user machine):
┌────────────────────────────────────────────────────────────────────────┐
│  src/components/settings/SummarySection.tsx                            │
│    import benchmarksRaw from '../../data/model-benchmarks.json'        │
│    const BENCHMARKS = validateBenchmarks(benchmarksRaw)  // module scope│
│    ...                                                                  │
│    const recommended = BENCHMARKS.models.some(                         │
│      (b) => b.verdict === 'recommended'                                │
│                && matchesBenchmarkModel(model.name, b.name))           │
│    label += recommended ? ` · ${t('model_recommended')}` : ''          │
└────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── data/
│   └── model-benchmarks.json            # NEW — single source of truth (D-16)
├── types/
│   └── model-benchmarks.ts              # NEW — TS schema mirror (D-18)
├── lib/
│   ├── benchmarks.ts                    # NEW — validateBenchmarks + matchesBenchmarkModel (D-31)
│   ├── benchmarks.test.ts               # NEW — Vitest unit tests (D-31)
│   └── ...
└── components/settings/
    └── SummarySection.tsx               # MODIFIED — line 35 predicate rewire (D-29, D-30, D-30a)

scripts/
├── benchmark-models.mjs                 # NEW — Node ESM orchestrator (D-20)
├── render-benchmark-readme.mjs          # NEW — Node ESM README generator (D-25)
└── release-bump.mjs                     # REFERENCE — pattern to mirror

.planning/phases/20-benchmark-rerun-and-settings-recommendation-ui/
└── runs/                                # NEW directory
    ├── .gitignore                       # excludes warmup/ and speed/
    ├── phi4-mini/
    │   └── quality/
    │       ├── 15min.md                 # committed audit artifact (D-22a)
    │       ├── 45min.md                 # committed
    │       └── 90min.md                 # committed
    └── llama3.2-3b/                     # (path-safe: replace `:` with `-`)
        └── quality/
            ├── 15min.md
            ├── 45min.md
            └── 90min.md

.planning/milestones/v1.1-phases/13-llm-quality-tuning/
└── BENCHMARK.md                         # MODIFIED — iteration-2 PENDING backfill (D-34, D-36)

README.md                                # MODIFIED — empty marker block (D-26)
package.json                             # MODIFIED — two new scripts (D-20, D-25)
```

### Pattern 1: Atomic JSON Write (Node ESM)

**What:** Write to `<target>.bump.tmp`, then `renameSync` over the destination. Same pattern as `scripts/release-bump.mjs:90-94` and `:131-135`.

**When to use:** Both output files — `src/data/model-benchmarks.json` and the BENCHMARK.md backfill. D-24 specifies "Never produce a partial JSON file — write atomically via temp-file + rename".

**Example:**
```js
// Source: scripts/release-bump.mjs:86-95 (existing repo pattern)
import { writeFileSync, renameSync, readFileSync } from 'node:fs';

function writeJsonAtomic(targetPath, data) {
  const text = JSON.stringify(data, null, 2) + '\n'; // trailing newline
  const tmp = targetPath + '.bench.tmp';
  writeFileSync(tmp, text);
  renameSync(tmp, targetPath);
}
```

**Cross-platform note:** `fs.renameSync` is atomic on POSIX (macOS, Linux — replaces destination in a single syscall) but has historical EPERM-on-Windows issues when a destination is locked by another process (Windows Defender, Search Indexer, an open file handle). For a maintainer-only harness writing to a tree the maintainer is editing, this risk is negligible — the harness fails loudly on EPERM with a clear "another process holds the file" message and the maintainer retries. **No need for `write-file-atomic` npm package** [CITED: https://github.com/nodejs/node/issues/29481]. The existing `release-bump.mjs` uses raw `renameSync` with no retry and has not been reported to fail.

### Pattern 2: JSON Schema Validation Without New Deps (TypeScript Type Guards)

**What:** Hand-rolled discriminated-union type guard. Throws a `BenchmarksValidationError` with a concrete path on shape mismatch. Imports `unknown`, returns `BenchmarkData`.

**When to use:** Every place the static JSON is consumed (Settings UI, README generator script). Single chokepoint: `src/lib/benchmarks.ts`.

**Example:**
```ts
// src/lib/benchmarks.ts (new file)
import type { BenchmarkData, BenchmarkModel, Verdict } from '../types/model-benchmarks';

class BenchmarksValidationError extends Error {}

function assertObject(v: unknown, path: string): asserts v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new BenchmarksValidationError(`expected object at ${path}, got ${typeof v}`);
  }
}
function assertString(v: unknown, path: string): asserts v is string {
  if (typeof v !== 'string') throw new BenchmarksValidationError(`expected string at ${path}`);
}
function assertNumber(v: unknown, path: string): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new BenchmarksValidationError(`expected finite number at ${path}`);
  }
}
function assertVerdict(v: unknown, path: string): asserts v is Verdict {
  if (v !== 'recommended' && v !== 'alternate' && v !== null) {
    throw new BenchmarksValidationError(`expected "recommended" | "alternate" | null at ${path}`);
  }
}

export function validateBenchmarks(raw: unknown): BenchmarkData {
  assertObject(raw, '$');
  if (raw.schema_version !== 1) {
    throw new BenchmarksValidationError(`unsupported schema_version: ${raw.schema_version}`);
  }
  assertString(raw.generated, '$.generated');
  // ... (similar for generator, generator_git_sha, hardware_tier, methodology)

  if (!Array.isArray(raw.models)) {
    throw new BenchmarksValidationError('expected array at $.models');
  }
  const models: BenchmarkModel[] = raw.models.map((m, i) => {
    assertObject(m, `$.models[${i}]`);
    assertString(m.name, `$.models[${i}].name`);
    assertVerdict(m.verdict, `$.models[${i}].verdict`);
    // ... validate quality + speed sub-objects
    return m as unknown as BenchmarkModel;
  });

  return { ...raw, models } as BenchmarkData;
}

export function matchesBenchmarkModel(modelName: string, jsonRowName: string): boolean {
  const normalize = (n: string) => n.replace(/:latest$/, '');
  return normalize(modelName) === normalize(jsonRowName);
}
```

**Why hand-rolled over Zod/Ajv:** D-19 forbids new deps. A discriminated union with ~80 lines of type guards is straightforward, has zero runtime cost, and is unit-testable. Schema drift detection is the goal — verbose guards make the failure messages clearer than Zod's autogenerated paths.

### Pattern 3: Cross-Platform GPU Detection

**What:** Per-platform shell-out wrapped in try/catch; first-match heuristic; soft-fail to `gpu_model: null` on any error. Apple Silicon special-cased per D-13a.

**Example:**
```js
// Inside scripts/benchmark-models.mjs
import { execFileSync } from 'node:child_process';
import os from 'node:os';

function detectGpu() {
  const platform = os.platform();
  try {
    if (platform === 'darwin') {
      const out = execFileSync('system_profiler', ['SPDisplaysDataType'], {
        encoding: 'utf-8', timeout: 5000,
      });
      // Sample output (Apple Silicon):
      //   Apple M3 Max:
      //     Chipset Model: Apple M3 Max
      //     Type: GPU ...
      const m = out.match(/Chipset Model:\s*(.+)/);
      if (!m) return null;
      const chipset = m[1].trim();
      // D-13a: detect Apple Silicon SoC names ("Apple M1/M2/M3/M4 ...")
      if (/^Apple\s+M\d/.test(chipset)) {
        return `${chipset} (integrated, Metal)`;
      }
      return chipset;
    }
    if (platform === 'linux') {
      const out = execFileSync('lspci', [], { encoding: 'utf-8', timeout: 5000 });
      // First line matching VGA/3D/Display controller
      const lines = out.split('\n').filter((l) =>
        /VGA compatible controller|3D controller|Display controller/i.test(l)
      );
      if (!lines.length) return null;
      // Strip "00:02.0 VGA compatible controller: " prefix
      return lines[0].replace(/^[\da-f:.]+\s+[^:]+:\s*/i, '').trim();
    }
    if (platform === 'win32') {
      // wmic is deprecated/removed in Windows 11 24H2+ per Microsoft.
      // Use PowerShell Get-CimInstance as the primary path.
      const out = execFileSync('powershell.exe', [
        '-NoProfile', '-Command',
        "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"
      ], { encoding: 'utf-8', timeout: 8000 });
      const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      return lines[0] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}
```

[CITED: https://support.microsoft.com/en-us/topic/windows-management-instrumentation-command-line-wmic-removal-from-windows-e9e83c7f-4992-477f-ba1d-96f694b8665d — *"WMIC utility is disabled by default in Windows 11, versions 23H2 and 24H2. ... In 2025, WMIC utility is removed, if already installed, when upgrading to Windows 11, version 25H2."*]

[VERIFIED: `system_profiler SPDisplaysDataType` on this machine returned `Chipset Model: Apple M3 Max`, confirming the regex matches and D-13a's Apple Silicon special-case fires.]

### Pattern 4: Ollama HTTP API Timing Capture

**What:** Use `POST /api/generate` with `stream: false`. The response JSON includes all 6 timing fields documented by Ollama, all in nanoseconds.

**Example:**
```js
async function generateAndTime(model, prompt, numPredict) {
  const wallClockStart = process.hrtime.bigint();
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      keep_alive: '5m',  // default; set to 0 only when explicitly unloading
      options: {
        num_predict: numPredict,
        temperature: 0,
        seed: 42,
        num_ctx: 4096,  // mirror llm/mod.rs choose_num_ctx logic
      },
    }),
  });
  if (!res.ok) throw new Error(`Ollama generate failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const wallClockNs = Number(process.hrtime.bigint() - wallClockStart);

  // All durations are nanoseconds per Ollama API docs.
  return {
    response: json.response,
    eval_count: json.eval_count,                       // tokens generated
    eval_duration_ns: json.eval_duration,              // gen time
    prompt_eval_duration_ns: json.prompt_eval_duration,// prompt-eval time = approx TTFT
    total_duration_ns: json.total_duration,
    load_duration_ns: json.load_duration,
    wall_clock_ns: wallClockNs,
    // Derived per Ollama docs:
    //   tokens_per_sec = eval_count / (eval_duration_ns / 1e9)
    //   time_to_first_token_ms = prompt_eval_duration_ns / 1e6
  };
}
```

[CITED: https://docs.ollama.com/api/generate — Response Properties: *"`total_duration` (integer) - Time spent generating the response in nanoseconds. `load_duration` (integer) - Time spent loading the model in nanoseconds. `prompt_eval_count` (integer) - Number of input tokens in the prompt. `prompt_eval_duration` (integer) - Time spent evaluating the prompt in nanoseconds. `eval_count` (integer) - Number of output tokens generated in the response. `eval_duration` (integer) - Time spent generating tokens in nanoseconds."*]

**TTFT interpretation note:** The Ollama API does not explicitly emit a TTFT field, but `prompt_eval_duration` represents the time spent processing the prompt before the first token is generated. For a warm model on the speed pass (post-warmup), `prompt_eval_duration_ns / 1e6` is the canonical "time to first token" measurement and matches what users experience as "the model is thinking". If TTFT precision is critical, the planner may switch to `stream: true` and wall-clock-instrument the first token event from `parse_stream_line`-equivalent logic — but for N=5 median measurements on a quiet maintainer machine, the `prompt_eval_duration` proxy is honest enough.

### Pattern 5: Reproducing the Chunked Summarization Path (Recommended: Option b)

**What:** Mirror the 4 constants and 2 helper functions from `src-tauri/src/llm/mod.rs` in the Node orchestrator.

**Constants to mirror (verbatim from `llm/mod.rs:14-18`):**
```js
const MAX_SINGLE_PASS_CHARS  = 96_000;  // llm/mod.rs:14
const MAP_CHUNK_CHARS        = 80_000;  // llm/mod.rs:15
const MAP_CHUNK_OVERLAP_CHARS = 2_000;  // llm/mod.rs:16
const CHARS_PER_TOKEN_ESTIMATE = 3.5;   // llm/mod.rs:17
const PROMPT_OVERHEAD_TOKENS = 500;     // llm/mod.rs:18
```

**Function shape (mirror `llm/mod.rs:154-187 chunk_transcript` and `:580-602 run_summary` decision):**
```js
function chunkTranscript(text) {
  if (text.length <= MAP_CHUNK_CHARS) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + MAP_CHUNK_CHARS, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = Math.max(end - MAP_CHUNK_OVERLAP_CHARS, start + 1);
  }
  return chunks;
}

async function runSummary(transcript, model) {
  if (transcript.length <= MAX_SINGLE_PASS_CHARS) {
    // Single-pass path — same as generate_summary_stream in llm/mod.rs:512
    return await generateAndTime(model, buildPromptFromTemplate(transcript), -1);
  }
  // Chunked path — same as generate_summary_chunked in llm/mod.rs:539
  const chunks = chunkTranscript(transcript);
  const partials = [];
  for (const chunk of chunks) {
    const partial = await generateAndTime(model, buildPromptFromTemplate(chunk), -1);
    partials.push(partial.response);
  }
  const stitched = partials
    .map((p, i) => `Section ${i + 1}:\n${p}`)
    .join('\n\n');
  return await generateAndTime(model, buildSynthesisPrompt(stitched), -1);
}
```

**Prompts to mirror:** The exact text of `DEFAULT_STANDARD_PROMPT` (`llm/mod.rs:455`) and the chunked synthesis prompt (`llm/mod.rs:486`) must be copied verbatim into the Node orchestrator. **Drift risk mitigation:** Add a comment in the Node script pointing to the Rust source lines, and add a `# Sanity:` line in the BENCHMARK.md note that the benchmark prompts were copy-verified against `llm/mod.rs` at the commit captured in `generator_git_sha`. If the planner is uncomfortable with copy-paste drift, the alternative is option (a) — a Rust `[[bin]]` target — at the cost of forcing `cargo build` as a harness pre-flight step. Recommendation stays with (b).

### Pattern 6: v1.1 BENCHMARK.md Backfill via Regex Cell Replacement

**What:** Parse the markdown table in `.planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` line by line. Detect rows matching `| <transcript> | 2 (tuned prompt) | ... | PENDING | PENDING | PENDING | PENDING | PENDING |`. Replace the five `PENDING` cells with measured percentages. Leave iteration-0 and iteration-1 rows untouched (their `PENDING`s stay).

**Iteration 0/1 footnote (D-36):** Append after the table:
```markdown
> **Note (v1.3 backfill):** Iterations 0 (baseline) and 1 (`num_predict`) cannot be retroactively
> measured because the source code in `src-tauri/src/llm/mod.rs` has moved past those prompt
> versions. Only iteration 2 (current tuned prompt) was rerun for v1.3. See
> `src/data/model-benchmarks.json` for the live phi4-mini scores tied to commit
> `<generator_git_sha>`.
```

The planner should NOT touch the `## Findings` or `## Final Prompt Text` sections — those are historical context (D-34).

### Anti-Patterns to Avoid

- **Hardcoding the recommended model in the predicate:** The current code at `SummarySection.tsx:35` is `model.name === 'phi4-mini' || model.name === 'phi4-mini:latest' ? ' · Recommended' : ''`. The whole point of BENCH-05 is that swapping the recommended model becomes a JSON edit. Never put model-name string literals in the UI predicate. The new code uses `BENCHMARKS.models.some((b) => b.verdict === 'recommended' && matchesBenchmarkModel(...))`.
- **Calling `useTranslation` inside `formatModelLabel`:** It's a plain function, not a hook. React rules-of-hooks would throw at runtime. Per D-30a, either pass `recommendedLabel` as a parameter (option (a), cleanest) or inline the recommended-detection into the `.map()` callback at the call site (option (b)). **Recommend option (a)** — the formatter's signature change is one line at three call sites (`modelDropdownOptions`, `pullModelDropdownOptions`).
- **Auto-running the benchmark on app startup:** Out of scope per PROJECT.md and CONTEXT.md §"Scope anchors". The user app reads static JSON, never invokes Ollama for measurement purposes.
- **Shipping `evaluate.py`, ground-truth fixtures, or transcripts in the user bundle:** Maintainer-only. They live in `.planning/` and are never copied into `src/` or `src-tauri/resources/`.
- **Skipping the warmup pass:** Pitfall 7 root cause #1 — cold-load adds 5–30s to the first measurement. A warmup pass is non-negotiable.
- **Running models in parallel:** Pitfall 7 root cause #4 — Ollama serializes queued requests and re-evaluates between them, inflating latency. Sequential only, with `ollama stop` between models.
- **Re-litigating locked CONTEXT.md decisions:** The user trusted Claude's recommendations on 38 decisions. The planner picks task ordering and the option (a) vs (b) choice for D-30a, period.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Quality scoring (keyword tokenization, action-item matching, decision phrase scoring, structural section check) | Custom JS scorer in Node | `python3 .planning/.../evaluate.py` subprocess (v1.1 evaluator, reused as-is per D-21) | Established scoring, 172 lines of tested Python, output is `\n`-delimited and trivially stdout-parseable. Rewriting in Node duplicates v1.1's logic and risks score drift. |
| Atomic file write in Node | Hand-rolled lock file, fs.write+rename loops | `writeFileSync(tmp, ...); renameSync(tmp, target)` (mirror `scripts/release-bump.mjs:90-94`) | The existing project pattern is already correct on POSIX and acceptable on Windows for a maintainer-only script. Adding `write-file-atomic` (or similar) adds a dep without solving any v1.3 problem. |
| Tokens-per-second derivation | Wall-clock instrumenting every chunk + bytes-to-tokens estimation | `eval_count / (eval_duration / 1e9)` from Ollama's response JSON | Ollama already does this measurement inside the model runtime. Wall-clock is strictly less accurate (network jitter, JSON parse overhead). [CITED: https://docs.ollama.com/api/generate] |
| Hardware tier detection | Hand-parsing `/proc/cpuinfo`, registry queries, Mach-O APIs | Node `os.cpus()[0].model` + `os.totalmem()` for CPU/RAM; per-platform shell-out for GPU | Node stdlib covers CPU + RAM portably. GPU has no stdlib equivalent, so a per-platform exec (`system_profiler` / `lspci` / `Get-CimInstance`) wrapped in try/catch is the minimum viable surface. |
| JSON schema validation | `if (!data.models) throw...` ad-hoc checks scattered through the UI | `validateBenchmarks(raw): BenchmarkData` single chokepoint at import time | Centralizes shape enforcement; one place to update when schema bumps to v2; throws an actionable error path. (D-18) |
| `:latest` normalization | Inline `.replace(...)` at every callsite | `matchesBenchmarkModel(modelName, jsonRowName)` helper (D-31) | Same reason — single chokepoint. Unit-tested. |
| Per-platform `mv` / `ren` semantics | `os.platform() === 'win32' ? exec('move ...') : exec('mv ...')` | `fs.renameSync` (Node stdlib) | Cross-platform abstraction is the entire reason this stdlib call exists. The Windows EPERM caveat only matters for adversarial concurrent access, not maintainer scripts. |

**Key insight:** The harness is small (~300 lines of Node, mostly orchestration glue). Every "complicated bit" already has a canonical solution in either the Node stdlib, the v1.1 Python evaluator, or the Ollama HTTP API. Resist the temptation to wrap with abstractions — the script reads top-to-bottom like a recipe.

## Runtime State Inventory

This phase is partly a data-emission phase (writes JSON), so a small inventory applies. Not a rename/refactor phase per se, but worth being explicit:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — the JSON file is repo-tracked; no DB writes, no user-data state | None |
| Live service config | Ollama keep_alive policy: each `keep_alive: 0` request unloads the model from VRAM/RAM. Default 5m TTL. Maintainer's Ollama install settings (`OLLAMA_KEEP_ALIVE` env var) could interfere if customized. | Harness pre-flight could `echo $OLLAMA_KEEP_ALIVE` and warn if non-default; not required |
| OS-registered state | None — harness writes files only; no systemd / launchd / Task Scheduler entries | None |
| Secrets/env vars | None — Ollama is unauthenticated localhost; no API keys; harness reads no secrets | None |
| Build artifacts | None — Node ESM script needs no compile. `src/data/model-benchmarks.json` IS a build input (Vite imports it at module-load time), so any time the JSON changes the dev server hot-reloads and any production build re-bundles. No stale artifacts. | None |

**Caveat to the planner:** If the harness's `--model <name>` flag (D-22) is used to rerun only one model, the JSON should be merge-updated, not overwrite-replaced — otherwise running `--model llama3.2:3b` would erase phi4-mini's row. Implementation note: the harness reads the existing JSON first, replaces only the targeted model's row, writes atomically. If the existing JSON is absent or invalid, full rerun is required.

## Common Pitfalls

### Pitfall 1: Confusing `keep_alive: 0` and `ollama stop` semantics

**What goes wrong:** Maintainer assumes `ollama stop <model>` is the only way to unload a model, doesn't realize `POST /api/generate` with `keep_alive: 0` also unloads (and avoids the CLI roundtrip).

**Why it happens:** CONTEXT.md D-21 step 2 explicitly says `ollama stop <model>`, which is fine — but if the orchestrator is already doing HTTP fetches, sending `keep_alive: 0` on the last per-model speed-pass request is one less subprocess invocation and one less failure mode.

**How to avoid:** Either approach works. Picking one and being consistent in the orchestrator is the discipline. Recommend: **between-models** clean unloads use `ollama stop <model>` (CLI, easier to debug), **per-request keep_alive** stays at the default 5m so the warmup model isn't unloaded before the quality pass starts.

**Warning signs:** Wildly different `load_duration_ns` values across the N=5 speed runs — implies the model was unloaded between runs.

[CITED: https://docs.ollama.com/faq — *"To immediately unload a model, use the `ollama stop <model_name>` command in the CLI. When using the API, the `keep_alive` parameter in `/api/generate` and `/api/chat` requests controls how long a model stays loaded. Setting `keep_alive` to '0' unloads the model immediately."*]

### Pitfall 2: `prompt_eval_duration` is not TTFT in the strict sense

**What goes wrong:** Reporting `prompt_eval_duration / 1e6` as "time to first token" overstates by however long it takes the first token to traverse the network from Ollama to the harness.

**Why it happens:** Ollama's `prompt_eval_duration` measures *server-side* prompt processing. The first token is emitted to the network *after* that completes.

**How to avoid:** For a localhost-to-localhost API call on a quiet maintainer machine, network jitter is sub-millisecond and the proxy is honest. If TTFT precision becomes a concern in v1.4+, switch the speed pass to `stream: true` and timestamp the first non-empty `response` chunk.

**Warning signs:** Looks fine in v1.3. If the README's "TTFT" column becomes a marketing point, revisit.

### Pitfall 3: Chunk-synthesis drift if `llm/mod.rs` constants change post-v1.3

**What goes wrong:** A future commit changes `MAP_CHUNK_CHARS` from 80,000 to 70,000 (or tweaks the synthesis prompt). The harness, with option (b) reimplementation, still uses 80,000 and emits scores that no longer reflect user experience.

**Why it happens:** Drift between two copies of the same logic.

**How to avoid:**
- Comment in `scripts/benchmark-models.mjs`: `// Mirrors src-tauri/src/llm/mod.rs:14-18 — keep in sync.`
- Pre-flight check (cheap): grep `llm/mod.rs` for `MAX_SINGLE_PASS_CHARS` and verify it matches the JS constant. Warn (not fail) on mismatch. ~5 lines.
- `generator_git_sha` field in the JSON anchors the run to a commit; a future maintainer can `git diff` `llm/mod.rs` between the recorded SHA and HEAD to detect drift.

**Warning signs:** PR diff touches `llm/mod.rs` constants AND does NOT also touch `scripts/benchmark-models.mjs`. (A future CI check could enforce this; out of v1.3 scope.)

### Pitfall 4: Vitest test environment picks the wrong runner

**What goes wrong:** `src/lib/benchmarks.test.ts` ends up in the `.tsx` jsdom project and pulls in React/DOM globals it doesn't need; or worse, the `.test.ts` Node-environment project ignores it and the test never runs.

**Why it happens:** `vite.config.ts:test` defines two projects with explicit `include` patterns: `.test.tsx → jsdom`, `.test.ts → node`. A `.test.ts` file at `src/lib/benchmarks.test.ts` matches the second project and runs in Node. **Correct by default.**

**How to avoid:** Name the test file `.test.ts` (not `.test.tsx`). Mirror `src/lib/recordStartState.test.ts:1-30` for the basic structure (`import { describe, expect, it } from 'vitest'`).

**Warning signs:** `bun run test` reports zero benchmark tests despite the file existing. → Check the file extension.

### Pitfall 5: `formatModelLabel` rules-of-hooks violation

**What goes wrong:** Planner adds `const { t } = useTranslation('settings');` inside `formatModelLabel` to get the localized "Recommended" string. React throws `Invalid hook call. Hooks can only be called inside the body of a function component.`

**Why it happens:** `formatModelLabel` is called inside `.map()` callbacks (`SummarySection.tsx:231-236`, `:240-245`) which are themselves nested inside `useMemo`s. The function is not a component, not a hook.

**How to avoid:** D-30a option (a) — pass `recommendedLabel` as a second parameter to `formatModelLabel`:
```ts
function formatModelLabel(model: OllamaModelInfo, recommendedLabel: string): string {
  const download = ...;
  const size = ...;
  const recommended = BENCHMARKS.models.some(
    (b) => b.verdict === 'recommended' && matchesBenchmarkModel(model.name, b.name),
  );
  const rec = recommended ? ` · ${recommendedLabel}` : '';
  return `${model.name}${download}${size}${rec}`;
}

// Call sites — t is already in scope from `useTranslation('settings')`:
const modelDropdownOptions = useMemo(
  () =>
    modelOptions.map((model) => ({
      value: model.name,
      label: formatModelLabel(model, t('model_recommended')),  // <-- pass label
    })),
  [modelOptions, t],
);
```

**Warning signs:** Build fails at runtime with `Invalid hook call`. → You called a hook inside `formatModelLabel`.

### Pitfall 6: Forgetting that `:` in model names breaks file paths on Windows

**What goes wrong:** `llama3.2:3b` is a valid Ollama model name. The harness writes `.planning/phases/20-.../runs/llama3.2:3b/quality/45min.md`. On Windows, `:` is reserved (drive separator); the file write fails or produces a corrupted path.

**Why it happens:** Cross-platform path safety.

**How to avoid:** Path-sanitize model names before using them as directory components: `model.replace(/[:]/g, '-')` → `llama3.2-3b`. Store the sanitized form in the path; keep the original `llama3.2:3b` as the JSON `name` field.

**Warning signs:** `ENOENT` or `EINVAL` on Windows when writing run outputs. → Path-safe the model name.

### Pitfall 7: Determinism drift across runs even with `temperature: 0` + `seed: 42`

**What goes wrong:** Re-running the harness on the same machine an hour later produces `quality_score` values different by 5+ points. Maintainer assumes a bug.

**Why it happens:** Documented Ollama issue #5321 — even with fixed seed, GPU non-determinism + tokenizer edge cases cause 1–3% drift. The N=5 median absorbs this for *speed* but the quality pass is `1 run × 3 transcripts`, so quality scores have the full variance.

**How to avoid:** D-23 sets the expectation: re-runs should be within ±2.0 quality_score points. If drift exceeds that:
1. Verify the harness is hitting the same commit (`generator_git_sha`).
2. Check that no v1.2/v1.3 prompt template edit landed in `llm/mod.rs` between runs.
3. Drift > ±5 → investigate. Drift ±2..5 → accept, re-run the variance into N=5 quality runs in a future milestone.

**Note for v1.3:** The quality pass is NOT N=5. D-10 says "for each of the 3 transcripts" (single run per transcript). Acknowledge in the BENCHMARK.md backfill footnote.

**Warning signs:** Quality score swings wildly across reruns. → Document, don't chase.

### Pitfall 8: Vite asset-size warning on JSON import

**What goes wrong:** Vite warns "Asset size exceeds threshold" for the imported JSON. Maintainer panics, considers code-splitting.

**Why it happens:** Vite's default warning threshold is configurable via `build.chunkSizeWarningLimit` (already set to 1800 in `vite.config.ts:30`). For a ~3 KB JSON file (two models, all fields populated), no warning will fire.

**How to avoid:** Nothing — the JSON is small enough. If v1.4 adds 10 models with full per-transcript breakdowns, the file might cross 10 KB which is still trivial.

**Warning signs:** None expected for v1.3.

### Pitfall 9: `python3` on Windows is actually `python.exe`

**What goes wrong:** Harness `execFileSync('python3', ...)` fails on Windows with ENOENT.

**Why it happens:** Windows ships Python under `python.exe` (sometimes via `py.exe` launcher); the `python3` alias is a POSIX convention.

**How to avoid:** Pre-flight probes `python3` first, falls back to `python --version` and checks the major version ≥ 3.10. Store the resolved binary in a variable and use it for all `evaluate.py` invocations:
```js
function resolvePython() {
  for (const cmd of ['python3', 'python', 'py']) {
    try {
      const out = execFileSync(cmd, ['--version'], { encoding: 'utf-8' });
      const m = out.match(/Python (\d+)\.(\d+)/);
      if (m && (+m[1] > 3 || (+m[1] === 3 && +m[2] >= 10))) return cmd;
    } catch {}
  }
  throw new Error('No suitable python3 (>=3.10) found on PATH');
}
```

**Warning signs:** Pre-flight fails on Windows even though Python is installed. → Try `python.exe`.

### Pitfall 10: `evaluate.py` exit code is 1 on quality "FAIL"

**What goes wrong:** The harness uses `execFileSync` which throws on non-zero exit. `evaluate.py` returns 1 when scores don't all hit 100% (line 167). Harness interprets this as "evaluator broken" and aborts.

**Why it happens:** `evaluate.py:164-167` reads:
```python
passed = action_pct == 100.0 and decision_pct == 100.0 and structure_ok
return 0 if passed else 1
```

A model scoring 92% action items is a perfectly normal result, not a failure of the evaluator. The harness must distinguish "evaluator ran successfully but the model didn't ace it" from "evaluator crashed".

**How to avoid:** Use `child_process.spawnSync` (or `execFileSync` with `{ stdio: 'pipe' }`) and parse the stdout for the four percentage lines REGARDLESS of exit code. Only treat parsing failure as evaluator-broken:
```js
const result = spawnSync('python3', [evaluatePy, summaryPath, gtPath], { encoding: 'utf-8' });
// result.status is 0 (passed all) or 1 (didn't pass all) — both are normal.
// result.status === null → process didn't run → real failure.
if (result.status === null || result.error) {
  throw new Error(`evaluator failed to run: ${result.error?.message ?? 'unknown'}`);
}
const stdout = result.stdout;
const actionPct = parseFloat(stdout.match(/Action items completeness: ([\d.]+)%/)?.[1] ?? 'NaN');
// ... etc.
if (Number.isNaN(actionPct)) {
  throw new Error(`evaluator stdout did not contain expected fields:\n${stdout}\n${result.stderr}`);
}
```

**Warning signs:** Harness reports "evaluator failed" on any model that doesn't score 100%. → Stop using `execFileSync` for the evaluator.

### Pitfall 11: `ollama stop` is actually older than CONTEXT.md assumes

**What goes wrong:** CONTEXT.md D-21 step 2 says "ollama ≥ 0.5.0" is the minimum because of `ollama stop`. Maintainer running ollama 0.4.x is told to upgrade unnecessarily.

**Why it happens:** `ollama stop` was actually introduced in **v0.3.11** (released 2024-09-17), not v0.5.0. [VERIFIED: gh api repos/ollama/ollama/releases/tags/v0.3.11 release notes: *"New `ollama stop` command to unload a running model"*]

**How to avoid:** The planner can:
- Keep CONTEXT.md's ≥ 0.5.0 floor as a conservative requirement (no harm — modern Ollama installs are all on 0.20.x+).
- OR lower the floor to ≥ 0.3.11 in the harness pre-flight error message.

**Recommendation:** Keep ≥ 0.5.0 in the pre-flight (CONTEXT.md is locked) but cite the correct introduction version (0.3.11) in any comments or docs. The actual lower bound on Ollama version is harmless because the current latest is `v0.23.3` (2026-05-12). [VERIFIED: gh release list]

**Warning signs:** Maintainer questions why the harness demands a newer Ollama than they have. → Reference the citation.

## Code Examples

Verified patterns from official sources and existing project code.

### Example 1: Ollama `/api/generate` request/response shape

```js
// Request (non-stream):
const res = await fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'phi4-mini',
    prompt: '...',
    stream: false,
    options: { num_predict: 512, temperature: 0, seed: 42 }
  }),
});

// Response (verified shape from Ollama docs):
// {
//   "model": "phi4-mini",
//   "created_at": "2026-05-13T14:32:11.000Z",
//   "response": "...generated text...",
//   "done": true,
//   "done_reason": "stop",
//   "total_duration": 174560334,        // nanoseconds
//   "load_duration": 101397084,         // nanoseconds
//   "prompt_eval_count": 11,            // tokens
//   "prompt_eval_duration": 13074791,   // nanoseconds
//   "eval_count": 18,                   // tokens generated
//   "eval_duration": 52479709           // nanoseconds (only this counts for tok/s)
// }
```

[CITED: https://docs.ollama.com/api/generate]

### Example 2: Unload model via API (no CLI)

```bash
# Equivalent to `ollama stop phi4-mini` — unloads from VRAM/RAM:
curl http://localhost:11434/api/generate -d '{"model": "phi4-mini", "keep_alive": 0}'
```

[CITED: https://docs.ollama.com/faq]

### Example 3: Atomic temp-write pattern (existing repo)

```js
// Source: scripts/release-bump.mjs:86-95
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

### Example 4: Vitest unit test for pure function (existing repo)

```ts
// Source: src/lib/libraryFilterParams.test.ts:1-26 (existing pattern to mirror)
import { describe, expect, it } from 'vitest';
import { matchesBenchmarkModel } from './benchmarks';

describe('matchesBenchmarkModel', () => {
  it('treats :latest suffix as equivalent', () => {
    expect(matchesBenchmarkModel('phi4-mini', 'phi4-mini')).toBe(true);
    expect(matchesBenchmarkModel('phi4-mini:latest', 'phi4-mini')).toBe(true);
    expect(matchesBenchmarkModel('phi4-mini', 'phi4-mini:latest')).toBe(true);
  });
  it('is case-sensitive', () => {
    expect(matchesBenchmarkModel('Phi4-Mini', 'phi4-mini')).toBe(false);
  });
  it('treats different model names as different', () => {
    expect(matchesBenchmarkModel('llama3.2:3b', 'phi4-mini')).toBe(false);
  });
});
```

### Example 5: Existing `formatModelLabel` (lines 30-37 — current state)

```ts
// Source: src/components/settings/SummarySection.tsx:30-37 (BEFORE phase 20)
function formatModelLabel(model: OllamaModelInfo): string {
  const download = model.downloadSize ? ` · ${model.downloadSize}` : '';
  const normalizedSize = model.parameterSize?.toLowerCase();
  const sizeIncludedInName = normalizedSize ? model.name.toLowerCase().endsWith(`:${normalizedSize}`) : false;
  const size = model.parameterSize && !sizeIncludedInName ? ` · ${model.parameterSize}` : '';
  const rec = model.name === 'phi4-mini' || model.name === 'phi4-mini:latest' ? ' · Recommended' : '';
  return `${model.name}${download}${size}${rec}`;
}
```

**Phase 20 target shape (D-30a option (a)):**
```ts
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `wmic path win32_VideoController get name /value` (Windows GPU detection) | `powershell -Command "Get-CimInstance Win32_VideoController \| Select-Object -ExpandProperty Name"` | WMIC disabled by default in Windows 11 23H2 (2024); removed in 25H2 (2025) [CITED: Microsoft Support] | Harness MUST use PowerShell path; wmic-only would silently break on modern Windows. |
| Lazy model unload (5min default `keep_alive`) | Explicit `ollama stop <model>` between models OR `keep_alive: 0` per request | `ollama stop` added v0.3.11 (Sep 2024); `keep_alive: 0` API supported since the keep_alive param existed | Forces clean state between models — addresses Pitfall 7 root cause #1 directly. |
| `tauri-action@v0` floating tag, manual benchmark JSON in `src-tauri/resources/` | Pinned `tauri-action@v0.6.2`, `src/data/model-benchmarks.json` as static frontend asset (Phase 19 + Phase 20) | Phase 19 pinned tauri-action; Phase 20 moves benchmarks to frontend | Reproducibility; benchmark data lives where it's consumed (Settings UI) |
| Auto-pick recommended model server-side | Maintainer-written `verdict` field per JSON row | Phase 20 (D-04) | Removes complexity — explicit > implicit. |

**Deprecated/outdated:**
- `wmic` on Windows: removed in 25H2 (2025). Use PowerShell `Get-CimInstance`.
- Single hardware-tier readings as authoritative recommendation (Pitfall 7 root cause #2): documented as honest-reporting per D-14; the README copy in Phase 23 frames the table as "Measured on: …" not "Recommended for your hardware".
- The architecture-research-time suggestion of `src-tauri/resources/benchmarks.json` (`.planning/research/ARCHITECTURE.md:138`) is **superseded by CONTEXT.md D-16** (`src/data/model-benchmarks.json`). Frontend asset, not Tauri resource.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 90-min transcript (`97,741` chars) triggers chunked path on every Ollama model — including `llama3.2:3b` (8192-token context window) | Architecture, §Chunked summarization | If `llama3.2:3b`'s context window is large enough to fit the 90-min transcript single-pass at the prompt-overhead estimate, the chunked path won't be exercised for that model. **Mitigation:** the chunking decision is `transcript.len() > MAX_SINGLE_PASS_CHARS` (chars, not tokens), which is a fixed threshold — so the path WILL trigger for both models. Verified by reading `llm/mod.rs:580`. **Downgraded to VERIFIED.** |
| A2 | `prompt_eval_duration_ns / 1e6` is an acceptable proxy for time-to-first-token | Pattern 4 + Pitfall 2 | If TTFT precision matters for marketing, switch to streaming + first-chunk wall-clock. Acceptable for v1.3 README. |
| A3 | The maintainer's CI/local environment will have Python ≥ 3.10 on PATH | Pre-flight | If false, harness aborts with a clear error. No silent fail. |
| A4 | `system_profiler SPDisplaysDataType` on Apple Silicon always returns `Chipset Model: Apple <SoC>` as the first match | Pattern 3 | [VERIFIED on this machine: returned `Chipset Model: Apple M3 Max`.] Other Apple Silicon SoCs (M1/M2/M4) follow the same naming convention per Apple's documentation. |
| A5 | The committed quality-pass output files (`runs/<model>/quality/<transcript>.md`) at ~50KB each × 6 files = ~300KB total will not bloat the repo meaningfully | D-22a (CONTEXT.md) | Already locked by user — no risk to research. |
| A6 | Vite ^7.0.4 in this repo supports direct JSON imports as documented (`import data from './example.json'`) | §Vite static JSON import | Vite has supported this since 1.x; ^7.0.4 unchanged behavior. [CITED: Context7 `/websites/vite_dev`] |
| A7 | The harness reading existing JSON before partial rerun (for `--model <name>`) is idempotent: re-running with the same model produces the same output ± determinism drift | D-22 partial-rerun design | If determinism drift causes a `--model llama3.2:3b` rerun to overwrite phi4-mini's row with phi4-mini's previous numbers (because phi4-mini wasn't re-measured but its row is preserved verbatim), this is correct behavior. **Confirm in planner: partial rerun MUST preserve unchanged rows verbatim.** [ASSUMED] |
| A8 | Path-sanitizing `llama3.2:3b` → `llama3.2-3b` for directory names is safe and reversible (no other model name in v1.3 or v1.4 plans would collide with the sanitized form) | Pitfall 6 | Low risk — Ollama model names use `:` only as the tag separator. Any collision would be visible in `git status` immediately. |

**Items still needing user confirmation:** A7 (partial rerun semantics on unchanged rows) — recommend planner adds a 1-line CONTEXT.md amendment OR makes a discretionary choice and documents it in the script's top comment.

## Open Questions (RESOLVED)

1. **Should the planner record per-transcript timing in JSON (15min + 45min + 90min) or only 45min as D-09 specifies?**
   - What we know: D-09 locks 45-min-only as the speed-pass transcript.
   - What's unclear: a "Claude's Discretion" note in CONTEXT.md mentions the planner *may* extend speed measurement to 15min if it adds negligible runtime.
   - **RESOLVED:** **Stay with 45min-only for v1.3.** The 15min speed adds ~5min runtime per model (15min × N=6 incl. warmup × 2 models = 30min added), the README has limited column space, and PITFALLS §Pitfall 7 specifically discusses tier'd-hardware not tier'd-transcript-length. Defer to v1.4.

2. **Should the harness do its own quality-pass N>1 to absorb stochastic quality drift, or stay at quality = 1 run per transcript?**
   - What we know: D-10 says quality pass is `1 run × 3 transcripts`. D-23 acknowledges quality scores drift ±1-3% between runs.
   - What's unclear: whether the README's "Quality Score 92.4" is precise enough to be honest about drift.
   - **RESOLVED:** **Stay at 1-run-per-transcript for v1.3.** The full quality sweep is 6 transcript-summaries which already takes ~15min for the chunked 90-min on phi4-mini alone. Doubling that for N=2 doubles harness runtime for a 1-2 point precision improvement. Add a footnote in BENCHMARK.md: *"Quality scores reflect a single measurement run. Ollama is documented to drift ±1-3% across runs; treat differences of <5 points between models as noise."*

3. **The CONTEXT.md says ≥ 0.5.0 Ollama; actual lower bound for `ollama stop` is 0.3.11. What error message should pre-flight emit on 0.4.x?**
   - What we know: Both versions support `ollama stop`. CONTEXT.md is conservative.
   - What's unclear: Whether the maintainer running ollama 0.4.x will hit unrelated bugs (e.g., the v0.5.0 API response shape change for /api/chat referenced earlier).
   - **RESOLVED:** Keep the pre-flight at ≥ 0.5.0 per CONTEXT.md. Error message: `"openNotes benchmark harness requires Ollama ≥ 0.5.0 (you have <version>). The 'ollama stop' command (introduced 0.3.11) and modern /api/generate timing fields are stable from 0.5.0+. Upgrade: https://ollama.com/download"`.

4. **The Settings UI imports `model-benchmarks.json` at module scope and runs the validator there. If the JSON is malformed (manual edit gone wrong), the entire SummarySection module fails to load. Acceptable?**
   - What we know: D-29 specifies module-scope import + validator call.
   - What's unclear: Does a malformed JSON break only the Settings UI, or the whole app boot?
   - **RESOLVED:** **Acceptable for v1.3.** The JSON is repo-tracked and never user-edited at runtime. A bad commit would be caught in `bun run build` (TypeScript will likely accept the `unknown` import but the validator would throw at module-load time). The blast radius is the Settings → Summary view; recording/library/etc continue to work. If the planner wants softer degradation, wrap the import in a try/catch and fall back to `BENCHMARKS = { models: [] }` — but this hides bugs and is not recommended.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node ≥ 22 | Harness orchestrator (`scripts/benchmark-models.mjs`) | ✓ (project requirement) | matches `package.json` engines | — |
| Python ≥ 3.10 | Subprocess call to `evaluate.py` | Maintainer-machine-dependent | 3.10+ | None — harness fails pre-flight if missing |
| Ollama CLI ≥ 0.5.0 | `ollama pull`, `ollama stop` | Maintainer-machine-dependent | ≥ 0.5.0 (≥ 0.3.11 actual; see Pitfall 11) | None — harness fails pre-flight |
| Ollama daemon on :11434 | All `/api/generate` calls | Must be started by maintainer | latest | None — fails pre-flight |
| `system_profiler` (macOS) | GPU detection on Darwin | ✓ (macOS built-in) | system | Soft-fail to `gpu_model: null` |
| `lspci` (Linux) | GPU detection on Linux | Most distros ship it; on Debian-derived in `pciutils` | system | Soft-fail to `gpu_model: null` |
| `powershell.exe` (Windows) | GPU detection on Windows | ✓ (Windows built-in, all supported versions) | 5.1+ | Soft-fail to `gpu_model: null` |
| `git` (CLI) | `git rev-parse HEAD` for `generator_git_sha` | ✓ (project is a git repo) | any modern | None — harness fails pre-flight |
| Vitest | Run `bun run test src/lib/benchmarks.test.ts` | ✓ (devDep) | `^4.0.18` | — |
| Vite ≥ 7 | Build-time JSON import bundling | ✓ (devDep) | `^7.0.4` | — |

**Missing dependencies with no fallback:**
- The 4 required external tools (Node, Python, Ollama CLI, Ollama daemon, git) — each has its own pre-flight check with a single concrete error message. Maintainer installs the missing piece and retries.

**Missing dependencies with fallback:**
- GPU-detection commands (`system_profiler` / `lspci` / `powershell.exe`) — soft-fail to `gpu_model: null` and `gpu_present: false`. The JSON is still well-formed; only the README footnote loses the GPU annotation.

## Validation Architecture

> Phase 20 includes Validation Architecture per the standard GSD workflow (`.planning/config.json` has no explicit `nyquist_validation` key — treat as enabled).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^4.0.18` (devDep) |
| Config file | `vite.config.ts:test` (two projects: `.tsx → jsdom`, `.ts → node`) |
| Quick run command | `bun run test src/lib/benchmarks.test.ts` |
| Full suite command | `bun run test` (alias for `vitest run`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BENCH-01 | v1.1 BENCHMARK.md no longer contains `PENDING` cells in iteration-2 rows for phi4-mini | manual inspection + smoke | `grep -E "iteration 2.*PENDING" .planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` returns nothing | N/A (file edit) |
| BENCH-01 | v1.1 BENCHMARK.md still contains iteration-0 and iteration-1 PENDING rows with explicit footnote | manual inspection | `grep -A1 "unrecoverable" .planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` returns the footnote text | N/A |
| BENCH-02 | Each JSON row has `methodology.warmup_runs: 1`, `methodology.measured_runs: 5`, `methodology.aggregation: "median"`, plus a populated `hardware_tier` object | unit | `bun run test src/lib/benchmarks.test.ts -- -t "methodology"` (assertion on fixture JSON) | ❌ Wave 0 |
| BENCH-03 | `src/data/model-benchmarks.json` `models` array has length ≥ 2 with names `phi4-mini` and `llama3.2:3b` | unit | `bun run test src/lib/benchmarks.test.ts -- -t "lineup"` | ❌ Wave 0 |
| BENCH-04 | The JSON validates against the TS schema at module-load time without throwing | unit | `bun run test src/lib/benchmarks.test.ts -- -t "validateBenchmarks"` | ❌ Wave 0 |
| BENCH-04 | `src/data/model-benchmarks.json` is imported by `SummarySection.tsx` via `resolveJsonModule`-driven static import and bundles into the production JS chunk | build smoke | `bun run build && grep -c "model-benchmarks" dist/assets/*.js` returns >= 1 | N/A (build artifact) |
| BENCH-05 | `formatModelLabel`'s recommended-detection no longer contains the literal string `'phi4-mini'` | static analysis | `grep -c "'phi4-mini'" src/components/settings/SummarySection.tsx` returns 0 | N/A (file edit) |
| BENCH-05 | `matchesBenchmarkModel` returns true for the `:latest` suffix variant | unit | `bun run test src/lib/benchmarks.test.ts -- -t ":latest"` | ❌ Wave 0 |
| BENCH-05 | Removing the `verdict: "recommended"` row from JSON causes the badge to disappear (no code change required) | integration | Manually edit JSON to set both verdicts to `"alternate"`, run `bun run dev`, verify no model shows " · Recommended"; revert | N/A — manual one-time verification |

### Test Files To Create

**Wave 0 (must exist before implementation):**
- `src/lib/benchmarks.test.ts` — covers `validateBenchmarks`, `matchesBenchmarkModel`. Test cases per D-31: `:latest` suffix tolerance, case sensitivity (case-sensitive), empty-models tolerance, missing-verdict tolerance, schema_version mismatch.
- `src/lib/benchmarks.ts` — implementations.
- `src/types/model-benchmarks.ts` — TS types backing the validator.

### Sampling Rate

- **Per task commit:** `bun run test src/lib/benchmarks.test.ts` (~1s)
- **Per wave merge:** `bun run test` (full suite, ~5-15s on the existing test set)
- **Phase gate (before `/gsd-verify-work`):** Full suite green + `bun run build` clean + manual harness dry-run (`bun run benchmark --model phi4-mini` produces a valid JSON file)

### Per-File Validation Inventory

**New files:**

| File | What it does | How to validate | Specific assertion |
|------|--------------|------------------|--------------------|
| `src/data/model-benchmarks.json` | Single source of truth — quality + speed metrics for 2 models | Schema validator at module-load time (runs automatically) + Vitest test loading the same JSON via fs.readFileSync and asserting shape | `validateBenchmarks(JSON.parse(text))` does not throw; `data.models.length === 2`; `data.models.find(m => m.name === 'phi4-mini').verdict === 'recommended'` |
| `src/types/model-benchmarks.ts` | TypeScript schema types — `BenchmarkData`, `BenchmarkModel`, `Verdict`, `HardwareTier`, `Methodology`, `Quality`, `Speed` | `tsc --noEmit` passes; types imported by `validateBenchmarks` return correct narrowed shape | `bun run build` (which runs `tsc && vite build` per `package.json:8`) succeeds |
| `src/lib/benchmarks.ts` | `validateBenchmarks(raw): BenchmarkData` + `matchesBenchmarkModel(a, b): boolean` | Vitest unit tests in `benchmarks.test.ts` | See test map above |
| `src/lib/benchmarks.test.ts` | Vitest suite for the above | `bun run test src/lib/benchmarks.test.ts` | All tests pass; coverage includes `:latest` variant, case sensitivity, empty models, throw-on-bad-shape |
| `scripts/benchmark-models.mjs` | Maintainer-only Node ESM orchestrator | Manual smoke run with `--model phi4-mini` flag (D-22) on a machine with Ollama running. Pre-flight error messages tested by running with intentionally missing prerequisites (no python3, no ollama daemon). | Smoke run produces a well-formed `src/data/model-benchmarks.json` whose `validateBenchmarks` accepts; pre-flight without Ollama emits the documented error message and exits 1 |
| `scripts/render-benchmark-readme.mjs` | Reads JSON, writes markdown table between marker comments in README.md | Smoke run after the benchmark harness produces the JSON. Verify idempotency: run twice, second run produces zero diff. | `bun run benchmark:render-readme && git diff README.md` is empty after a re-run |
| `.planning/phases/20-.../runs/.gitignore` | Excludes warmup + speed pass outputs | Manual inspection | `runs/<model>/warmup/` and `runs/<model>/speed/` are in `git status --ignored` after a smoke run |
| `.planning/phases/20-.../runs/<model>/quality/<transcript>.md` (6 committed files) | Audit set per D-22a | Each file is the actual summary output that `evaluate.py` scored; checked in for future re-verification | A future maintainer can re-run `python3 evaluate.py <committed-file> <ground-truth>` and reproduce the score within drift tolerance (D-23 ±2.0 quality_score points) |

**Modified files:**

| File | What changes | How to validate | Specific assertion |
|------|--------------|------------------|--------------------|
| `src/components/settings/SummarySection.tsx` | Line 35 predicate rewire to JSON-driven; `formatModelLabel` signature gains `recommendedLabel` parameter (D-30a option a); module-scope JSON import + validator call added | Vitest in jsdom env? — No, this component already has integration tests via `src/contexts/OllamaSetupContext.test.tsx`. Direct DOM render test for the recommended badge is OPTIONAL (D-32 says no UI redesign, the change is wiring). Static-analysis check is sufficient. | `grep -c "'phi4-mini'" src/components/settings/SummarySection.tsx` returns `0`; `grep -c "BENCHMARKS.models.some" src/components/settings/SummarySection.tsx` returns `1`; `bun run build` succeeds (catches the rules-of-hooks violation if option (a)/(b) is botched) |
| `package.json` | New scripts `"benchmark": "node scripts/benchmark-models.mjs"` and `"benchmark:render-readme": "node scripts/render-benchmark-readme.mjs"` | Manual | `bun run benchmark --help` (if `--help` flag implemented) or `bun run benchmark:render-readme` exits 0 against the committed JSON |
| `.planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` | Iteration-2 PENDING cells replaced with measured values; new footnote about iteration-0/1 unrecoverability | manual inspection | `grep -c "PENDING" BENCHMARK.md` count drops appropriately (iteration 2 has 9 PENDING cells × 3 transcripts = 9 to replace; iterations 0 and 1 retain their PENDINGs); footnote contains the word "unrecoverable" |
| `README.md` | Empty `<!-- BEGIN:BENCHMARK_TABLE -->` / `<!-- END:BENCHMARK_TABLE -->` markers added near bottom (D-26) | manual inspection | `grep -c "BEGIN:BENCHMARK_TABLE" README.md` returns `1`; `grep -c "END:BENCHMARK_TABLE" README.md` returns `1` |

### Wave 0 Gaps

- [ ] `src/lib/benchmarks.test.ts` — covers BENCH-04 + BENCH-05 (validator + normalizer); MUST exist before any UI rewire
- [ ] `src/lib/benchmarks.ts` — implementations the test file expects; MUST exist before tests can pass
- [ ] `src/types/model-benchmarks.ts` — TS types the validator returns
- [ ] `src/data/model-benchmarks.json` — needed for SummarySection module import to compile (even an empty `{ "schema_version": 1, "models": [], ... }` skeleton is enough for Wave 0 compilation)

*(Framework already installed; no install step needed in Wave 0.)*

## Project Constraints (from CLAUDE.md)

> No top-level `./CLAUDE.md` exists in this repo. No `.claude/skills/` or `.agents/skills/` directories. There are no additional project-specific actionable directives beyond what is already encoded in CONTEXT.md and the `.planning/research/` set.

Inherited from existing project patterns (not strict CLAUDE.md directives, but worth surfacing):
- **No new npm or Cargo runtime deps without exact-pinning** (Phase 10 sherpa-rs, Phase 19 tar/bzip2/sha2/fs2 set the precedent). Phase 20 introduces zero new deps.
- **i18n-driven user-facing copy** — `t('model_recommended')` replaces the hard-coded English literal (closes a latent i18n bug en route).
- **No hard-coded English strings in UI code paths** — D-30 enforces.
- **Atomic file writes via temp + rename** — `scripts/release-bump.mjs:90-94` is the canonical pattern in this repo.
- **Bun-or-Node compatibility** — scripts use pure Node stdlib so `bun run` and `node` both work.

## Sources

### Primary (HIGH confidence)

- **Context7 `/websites/ollama`** — `/api/generate` timing fields, `keep_alive` parameter semantics, `ollama stop` command documentation, `/api/show` model context length endpoint. [Snippets verified verbatim above.]
- **Context7 `/websites/vite_dev`** — Direct JSON import behavior in Vite. [Confirms `import json from './example.json'` is supported with tree-shaking via named exports.]
- **Ollama official docs:** https://docs.ollama.com/api/generate, https://docs.ollama.com/faq, https://docs.ollama.com/cli
- **GitHub Ollama releases:** `gh api repos/ollama/ollama/releases/tags/v0.3.11` — verbatim release note confirming `ollama stop` was introduced 2024-09-17.
- **Microsoft Support — WMIC deprecation:** https://support.microsoft.com/en-us/topic/windows-management-instrumentation-command-line-wmic-removal-from-windows-e9e83c7f-4992-477f-ba1d-96f694b8665d
- **Direct codebase inspection (HIGH):** `src-tauri/src/llm/mod.rs:1-684` (production summarization path, constants), `src/components/settings/SummarySection.tsx:1-462` (rewire site), `src/lib/constants.ts:1-39` (default model), `src/lib/recordStartState.test.ts:1-30` + `src/lib/libraryFilterParams.test.ts:1-50` (Vitest pattern), `scripts/release-bump.mjs:1-155` (atomic write pattern), `vite.config.ts:1-65` (test environment, JSON import config), `tsconfig.json:1-25` (`resolveJsonModule: true`), `.planning/milestones/v1.1-phases/13-llm-quality-tuning/eval/evaluate.py:1-172` (subprocess output format), `.planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md:1-215` (backfill target structure), `package.json:1-56` (scripts wiring location), `src-tauri/Cargo.toml:1-57` (no `[[bin]]` target needed for option (b)).
- **Local environment verification (HIGH):** `system_profiler SPDisplaysDataType` executed on the current machine, confirmed `Chipset Model: Apple M3 Max` output format for D-13a regex.

### Secondary (MEDIUM confidence)

- **Node.js fs.rename atomicity on Windows:** Cross-referenced from npm/nodejs issue tracker (nodejs/node#29481, npm/write-file-atomic#227, npm/cli#9021) — confirmed EPERM-on-Windows is real for adversarial concurrent access but not for sequential maintainer scripts. The existing `release-bump.mjs` validates this in practice.
- **`lspci` output format for multi-GPU:** Multiple community sources confirm the `VGA compatible controller` / `3D controller` / `Display controller` keyword set. Using first-match heuristic per D-13.
- **Vitest "two-project" config behavior:** Confirmed by reading `vite.config.ts:test` directly; both `.test.ts` (node env) and `.test.tsx` (jsdom env) work in this repo.

### Tertiary (LOW confidence — flagged for validation)

- None. All claims either traced to primary docs / repo code, or downgraded to assumptions in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — zero new deps, all libraries already in repo, all versions verified in `package.json`.
- **Architecture:** HIGH — direct codebase inspection of every modified file; option (b) chunked-path mirroring is straightforward and the alternative options (a) and (c) are explicitly rejected with reasons.
- **Ollama HTTP API:** HIGH — Context7 + official docs returned exact timing field semantics; cross-verified with `gh api` for `ollama stop` introduction version.
- **Pitfalls:** HIGH — every pitfall traces to either direct code observation (Pitfall 5, 6, 9, 10), official docs (Pitfall 1, 2, 11), or an inherited PITFALLS.md item (Pitfall 7).
- **Cross-platform GPU detection:** MEDIUM-HIGH — Apple Silicon path verified locally; Linux + Windows paths verified against community usage and Microsoft deprecation announcement.
- **JSON validation pattern:** HIGH — hand-rolled type guards are vanilla TypeScript; no library uncertainty.

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (30 days for stable; Ollama version drift is the main risk surface, but the API timing fields have been stable since pre-0.3.0)

---

## RESEARCH COMPLETE
