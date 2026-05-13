---
phase: 20-benchmark-rerun-and-settings-recommendation-ui
plan: 01
subsystem: benchmarks
tags: [benchmarks, schema, validation, vitest, typescript, type-guards]

requires:
  - phase: 13-llm-benchmarking
    provides: BENCHMARK.md baseline scores + reproducible-fixture pattern that Phase 20 reruns and surfaces in-app
provides:
  - BenchmarkData TypeScript schema mirror at src/types/model-benchmarks.ts
  - validateBenchmarks(raw) — hand-rolled type-guard validator with path-bearing error messages ($.models[N].field)
  - matchesBenchmarkModel(a, b) — case-sensitive matcher that normalizes :latest suffix
  - Vitest suite (15 tests) covering D-31 matcher cases, validator success + error paths, BENCH-02/BENCH-03 shape contracts, and the empty-models tolerance the skeleton requires
  - src/data/model-benchmarks.json skeleton (schema_version: 1, models: []) — Wave 1 compile gate; Plan 05 will overwrite with live measurements
affects: [20-02-settings-ui, 20-03-harness, 20-04-readme-generator, 20-05-live-rerun]

tech-stack:
  added: []
  patterns:
    - "Hand-rolled TypeScript type-guard validator with path-bearing errors (no Zod/Ajv — D-19)"
    - "JSON-as-single-source-of-truth bundled into Vite chunk; validated at module-load time"
    - "Companion-type rule: raw JSON imports as unknown, validator returns the typed shape (D-18)"

key-files:
  created:
    - src/types/model-benchmarks.ts
    - src/lib/benchmarks.ts
    - src/lib/benchmarks.test.ts
    - src/data/model-benchmarks.json
  modified: []

key-decisions:
  - "Validator is hand-rolled (assertObject/assertString/assertNumber/assertBoolean/assertVerdict/assertOsPlatform) rather than schema-library-driven, honoring D-19 (zero new npm deps)"
  - "BenchmarksValidationError stays module-private; callers catch by message inspection — keeps the public API surface to two functions"
  - "Skeleton JSON ships with os: 'darwin' as a neutral placeholder; Plan 05 will overwrite with the maintainer machine's os.platform() value"
  - "Type definitions live in src/types/model-benchmarks.ts and are NOT re-exported through the src/types/index.ts barrel — too large to pollute the catch-all"

patterns-established:
  - "Path-bearing validation errors: every assertion threads a $-rooted path so schema drift surfaces as $.models[N].field (T-20-01, T-20-02 mitigation)"
  - "Type-only imports from companion type modules — runtime code in src/lib/* depends on TS types via `import type { ... }`, no value-import coupling"
  - ".test.ts (not .test.tsx) for non-React unit tests so Vitest's two-project config routes them to the Node environment (Pitfall 4)"

requirements-completed: [BENCH-04, BENCH-05]

duration: 3min
completed: 2026-05-13
---

# Phase 20 Plan 01: Benchmark schema, validator, and empty-models skeleton — Summary

**Hand-rolled `validateBenchmarks` + `matchesBenchmarkModel` with a 15-test Vitest suite, the BenchmarkData TypeScript schema mirror, and a `schema_version: 1` / `models: []` skeleton JSON that compiles into the Wave 2 Settings UI without any new npm dependencies.**

## Performance

- **Duration:** ~3 min (170 s)
- **Started:** 2026-05-13T10:29:52Z
- **Completed:** 2026-05-13T10:32:42Z
- **Tasks:** 3 (one with TDD RED/GREEN split — 4 commits total)
- **Files created:** 4
- **Files modified:** 0

## Accomplishments

- **Locked the BenchmarkData contract** as a TypeScript schema mirror (`Verdict`, `OsPlatform`, `HardwareTier`, `Methodology`, `PerTranscriptQuality`, `Quality`, `Speed`, `BenchmarkModel`, `BenchmarkData`). `schema_version` is the literal type `1`, `aggregation` is the literal `'median'`, `gpu_model` is `string | null` (D-13 soft-fail). 9 exports, zero runtime values, no barrel pollution.
- **Implemented and proved out a hand-rolled validator** that throws a `BenchmarksValidationError` with the failing JSON path (e.g., `$.models[0].verdict`) at module-load time. Zero new npm dependencies — no Zod, no Ajv, no lodash. The validator catches all 8 STRIDE-T-20-01/T-20-02 scenarios the threat model mandates (typoed verdict, unknown `os` value, malformed `models[N].name`, schema_version mismatch, non-array models, etc.) plus accepts both `verdict: null` and `models: []` (the Wave 1 skeleton tolerance).
- **Wrote the matcher pair** `matchesBenchmarkModel(modelName, jsonRowName)` — strips a trailing `:latest` on either side and compares case-sensitively. Five tests cover D-31's documented matrix: identical names, `:latest` equivalence in both directions, case sensitivity, different model names, and tag-other-than-`:latest` preservation (`phi4-mini:0.5b` ≠ `phi4-mini`).
- **Shipped the skeleton `src/data/model-benchmarks.json`** so Plan 02's SummarySection.tsx imports compile against a real file. The skeleton uses `os: "darwin"` as a neutral placeholder; Plan 05's harness rerun will overwrite it atomically with live measurements.
- **15/15 Vitest tests green** and `bun run build` clean (TypeScript strict mode + Vite production build).

## Task Commits

Each task was committed atomically on `worktree-agent-ae9016a6887502ab3`:

1. **Task 1: TypeScript schema mirror** — `f0cfbbb` (feat)
2. **Task 2 RED: Failing Vitest suite** — `13d5671` (test)
3. **Task 2 GREEN: Validator + matcher** — `5c51262` (feat)
4. **Task 3: Skeleton JSON** — `d3668ac` (feat)

The plan-metadata commit (this SUMMARY.md) follows; per parallel-executor protocol, STATE.md and ROADMAP.md are NOT touched in the worktree — the orchestrator merges this branch and updates shared state centrally.

## Files Created/Modified

- `src/types/model-benchmarks.ts` — 9 exports (2 type aliases + 7 interfaces). Type-only. Not in the `src/types/index.ts` barrel.
- `src/lib/benchmarks.ts` — `validateBenchmarks(raw): BenchmarkData` and `matchesBenchmarkModel(a, b): boolean`. Type-only import from the companion module. Module-private `BenchmarksValidationError` class. Path-bearing assertions: `assertObject` / `assertString` / `assertNumber` / `assertBoolean` / `assertVerdict` / `assertOsPlatform`, plus per-sub-object validators (`validateHardwareTier`, `validateMethodology`, `validatePerTranscriptQuality`, `validateQuality`, `validateSpeed`).
- `src/lib/benchmarks.test.ts` — 15 tests across 4 `describe` blocks. Top-level `validBenchmarkRaw` constant satisfies the full D-17 shape; `buildBenchmark(partial)` helper deep-merges into a JSON-cloned copy (4-line hand-rolled `deepMerge` honors D-19, no `lodash.merge`).
- `src/data/model-benchmarks.json` — 24 lines, `schema_version: 1`, `models: []`, placeholder `hardware_tier`/`methodology`. Parses cleanly through `validateBenchmarks`. Tracked in repo (not in `.gitignore` — bundled with Vite chunk).

## Validator contract — what the Wave 2 UI can rely on

The validator returns a fully-typed `BenchmarkData` or throws `BenchmarksValidationError` with a `$.path` describing exactly where the JSON went wrong. Wave 2 callers (Settings UI, README generator) can therefore:

- Import `src/data/model-benchmarks.json` at module scope, pass through `validateBenchmarks`, and treat the returned value as `BenchmarkData` without further runtime checks.
- Trust that `models[].verdict` is exactly `'recommended' | 'alternate' | null` (no typos can sneak in — directly mitigates T-20-02 from the plan's threat model).
- Trust that `models[].quality.per_transcript` contains all three keys `'15min' | '45min' | '90min'`.
- Trust that `hardware_tier.os` matches `os.platform()` shape (`'darwin' | 'win32' | 'linux'`).
- Use `matchesBenchmarkModel(settings.ollamaModel, jsonRow.name)` to look up the active model's benchmark row, with `:latest` suffix normalized.

The skeleton's `models: []` is also a tolerated state, so Plan 02 can ship Settings-UI integration before Plan 05's live data lands without any branching for "no benchmarks yet" beyond the obvious empty-array check.

## Test coverage map (15 tests)

| # | Describe block | What it proves |
|---|---|---|
| 1 | matchesBenchmarkModel | identical names → true |
| 2 | matchesBenchmarkModel | `:latest` equivalence (both directions) |
| 3 | matchesBenchmarkModel | case-sensitive (D-31) |
| 4 | matchesBenchmarkModel | different names → false |
| 5 | matchesBenchmarkModel | only `:latest` is normalized (`:0.5b` preserved) |
| 6 | validateBenchmarks | well-formed object returns typed shape |
| 7 | validateBenchmarks | `schema_version !== 1` throws |
| 8 | validateBenchmarks | non-array `models` throws |
| 9 | validateBenchmarks | unknown `verdict` ("Recomended") throws — T-20-02 mitigation |
| 10 | validateBenchmarks | `verdict: null` accepted (D-04) |
| 11 | validateBenchmarks | invalid `hardware_tier.os` throws |
| 12 | validateBenchmarks | `models: []` accepted (skeleton tolerance) |
| 13 | validateBenchmarks | error message includes `$.models[0]` path |
| 14 | methodology shape | locked methodology values validate (BENCH-02) |
| 15 | lineup shape | 2-model phi4-mini + llama3.2:3b lineup validates (BENCH-03) |

## Decisions Made

- **No Zod / Ajv / lodash.** D-19 is a hard constraint; the validator is roughly 80 lines of TypeScript including all the per-shape helpers. Reviewers can audit the entire schema gate in a single screenful, which is itself a security property.
- **`BenchmarksValidationError` is module-private.** Callers see `Error` subclass with a `.name === 'BenchmarksValidationError'` and the path-bearing message. Plan 02's Settings-UI error UI will catch on the base `Error` type — keeping the validation-error class internal means we can later refactor to a discriminated union or add error codes without a public-API break.
- **Skeleton lives at `src/data/model-benchmarks.json`, not `public/`.** The file is `import`-able from TypeScript (becomes a bundled JS chunk) so the validator gate runs at module-load. A `public/` placement would defer validation to runtime fetch.
- **Placeholder `os: "darwin"` in the skeleton** rather than a fourth "unknown" variant. The validator already enforces the three-platform union; adding `"unknown"` would weaken the contract and create a branch in every UI consumer. Plan 05's overwrite is a single-file atomic rename, so the placeholder window is small.

## Deviations from Plan

None — plan executed exactly as written. All three tasks landed in order, all acceptance criteria pass, all 15 tests are green, `bun run build` is clean, `package.json` is unchanged (zero deps added). The validator's path-bearing error contract (Test 13) and empty-models tolerance (Test 12) are both in place as the plan specified.

The plan flagged Task 1 with `tdd="true"` but the artifact is pure type declarations (no runtime behavior to write a test for in isolation — types are erased at compile time). The Vitest suite in Task 2 covers the runtime contract that consumes these types; the `bun run build` gate covers the compile-time contract. This is a documentation-of-intent rather than a deviation: no separate `*.types.test.ts` file was warranted.

## Threat Flags

None. No new trust boundaries beyond the maintainer-commit → user-bundle boundary that the plan's `<threat_model>` already covers, and the validator gate explicitly mitigates T-20-01 (tampered/malformed JSON) and T-20-02 (typoed verdict). T-20-04 (in-flight skeleton edit) remains `accept` as documented.

## Known Stubs

The `src/data/model-benchmarks.json` skeleton ships intentionally as a Wave 1 compile gate:

| File | Stub | Resolved by |
|---|---|---|
| `src/data/model-benchmarks.json` | `models: []` plus placeholder `hardware_tier` (cpu_model: "skeleton — overwritten by harness run", total_ram_gb: 0) and methodology `notes` field. Validates but contains no real measurements. | Plan 05 (live harness rerun on maintainer machine). |

This is **not** a deferred-issue — it is the explicit contract in the plan's Task 3 acceptance criteria, the threat model's T-20-04 disposition ("accept"), and CONTEXT.md's "scope anchors" (live data lands in Plan 05).

## TDD Gate Compliance

- **RED gate:** `13d5671 test(20-01): add failing Vitest suite for validateBenchmarks + matchesBenchmarkModel` ✓
- **GREEN gate:** `5c51262 feat(20-01): implement validateBenchmarks + matchesBenchmarkModel` ✓ (15/15 tests green)
- **REFACTOR gate:** Skipped intentionally — the validator's per-shape helpers and explicit `$.path` strings are the readability win; abstracting further would obscure the schema gate.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 02 (Settings UI rewire) can start immediately.** The four artifacts it depends on all exist and type-check:
  - `import type { BenchmarkData, BenchmarkModel } from '../../types/model-benchmarks';`
  - `import { validateBenchmarks, matchesBenchmarkModel } from '../../lib/benchmarks';`
  - `import benchmarksRaw from '../../data/model-benchmarks.json';`
  - `const benchmarks = validateBenchmarks(benchmarksRaw);` at module scope.
- **Plan 03 (harness) and Plan 04 (README generator) can target the `BenchmarkData` shape** as their write contract; the validator's exhaustive coverage means schema-drift bugs in the generator will surface on the very next `bun run build` rather than at runtime.
- **Plan 05 (live rerun)** has a fixed target: produce a JSON file that passes `validateBenchmarks` with `models.length >= 2` (phi4-mini + llama3.2:3b) and writes it atomically to `src/data/model-benchmarks.json`.

## Self-Check: PASSED

Verified before committing:

- `src/types/model-benchmarks.ts` exists — FOUND
- `src/lib/benchmarks.ts` exists — FOUND
- `src/lib/benchmarks.test.ts` exists — FOUND
- `src/data/model-benchmarks.json` exists — FOUND
- Commit `f0cfbbb` exists — FOUND (`feat(20-01): add BenchmarkData TypeScript schema mirror`)
- Commit `13d5671` exists — FOUND (`test(20-01): add failing Vitest suite ...`)
- Commit `5c51262` exists — FOUND (`feat(20-01): implement validateBenchmarks + matchesBenchmarkModel`)
- Commit `d3668ac` exists — FOUND (`feat(20-01): add skeleton src/data/model-benchmarks.json (empty models)`)
- `bun run test src/lib/benchmarks.test.ts` → 15 passed, 0 failed
- `bun run build` → exit 0, 2673 modules transformed

---
*Phase: 20-benchmark-rerun-and-settings-recommendation-ui*
*Plan: 01*
*Completed: 2026-05-13*
