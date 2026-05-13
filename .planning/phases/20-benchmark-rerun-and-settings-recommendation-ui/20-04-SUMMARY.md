---
phase: 20-benchmark-rerun-and-settings-recommendation-ui
plan: 04
subsystem: benchmarks
one_liner: "README marker block + idempotent Node ESM generator that renders model-benchmarks.json into the table block, anchored by exact string for Phase 23 relocation"
tags:
  - benchmarks
  - readme
  - generator
  - nodejs
  - scripts
requires:
  - 20-01  # src/data/model-benchmarks.json + src/lib/benchmarks.ts (validator)
provides:
  - readme-benchmark-table-block      # the <!-- BEGIN/END:BENCHMARK_TABLE --> anchor near README.md bottom
  - render-benchmark-readme-generator # scripts/render-benchmark-readme.mjs (Node ESM, atomic, idempotent)
  - npm-script-benchmark-render-readme # package.json "benchmark:render-readme" entry
affects:
  - README.md
  - scripts/
  - package.json
tech_stack_added: []
patterns_used:
  - atomic-write-rename            # scripts/release-bump.mjs pattern: temp file + renameSync
  - marker-anchored-substring-edit # indexOf(BEGIN_MARKER)/indexOf(END_MARKER) — NOT line numbers
  - defense-in-depth-shape-check   # inline minimum validator in .mjs (cannot import TS validator — D-19)
  - idempotent-no-op-short-circuit # next === readmeText → skip write
key_files:
  created:
    - scripts/render-benchmark-readme.mjs
  modified:
    - README.md
    - package.json
decisions:
  - "Marker block placed between '## Roadmap' and '## License' per PATTERNS guidance — Phase 23 may relocate without breaking the generator since markers are anchored by exact string (D-26)"
  - "Generator duplicates a minimum inline shape check rather than importing the TS validator from src/lib/benchmarks.ts — D-19 forbids new deps including tsx/esbuild-register that would be needed for .mjs→.ts import; the Vite/Settings-UI validator at module-load time is the canonical enforcement"
  - "Parameters column derived from model name via regex (e.g., llama3.2:3b → '3B'); Download column is intentionally blank for v1.3 — Phase 23 may wire from Ollama library catalog if needed (TODO comment in script flags this)"
  - "Idempotency verified by post-1st-render vs post-2nd-render byte-diff (NOT git diff against HEAD which always differs after marker insertion in Task 1)"
duration_minutes: 5
completed_date: 2026-05-13
---

# Phase 20 Plan 04: README Marker Block + Render Generator Summary

## What Was Built

Plan 20-04 lays down two of the three remaining BENCH-04 pieces that prove `src/data/model-benchmarks.json` is the single source of truth for downstream consumers (the third — the Settings UI consumer — landed in Plan 20-02). The marker block in README.md and the generator script behind `bun run benchmark:render-readme` give Phase 23 DOCS-07 a stable hook to relocate and re-render the table after the real benchmark data lands in Plan 20-05.

### 1. README.md marker block (Task 1)

A two-line empty marker pair was inserted between `## Roadmap` and `## License`:

```markdown
<!-- BEGIN:BENCHMARK_TABLE -->

<!-- END:BENCHMARK_TABLE -->
```

The pair is anchored by exact string match (`indexOf`), not by line number, so Phase 23 can freely relocate it within the README without breaking the generator. No surrounding prose was added; Phase 23 owns the table caption and explanatory copy (D-26).

### 2. `scripts/render-benchmark-readme.mjs` generator (Task 2)

Pure Node ESM (no shebang, no top-level await, zero new npm deps per D-19). Three-stage shape:

1. **Load + shape-check JSON.** `fs.readFileSync` + `JSON.parse` against `src/data/model-benchmarks.json`. Inline shape check: `schema_version === 1`, `models` is array, `hardware_tier` and `methodology` are objects, `generated` is string. On any mismatch: `console.error` + `process.exit(1)`. Defense-in-depth — the canonical validator lives in `src/lib/benchmarks.ts`, but `.mjs` cannot import `.ts` without a transpiler so the script re-implements only the fields it uses. Divergence between the two is caught by `bun run build` which exercises the full TS validator at Vite module-load time.

2. **Render table + footnote.** Header + divider + per-model row. Columns: Model | Parameters | Download | Quality Score | Tokens/sec | Time-to-first-token | Recommended (D-27). Parameters derived from model name regex (`/:(\d+(?:\.\d+)?[bB])\b/` then dash-prefixed fallback). Download intentionally blank for v1.3 with a `TODO(P23-DOCS-07)` comment. Quality and tokens/sec rounded to 1 decimal; time-to-first-token rendered as integer milliseconds; Recommended is `★` for `verdict === 'recommended'`, empty otherwise. Footnote includes `cpu_model / total_ram_gb GB / <gpu_label> · Methodology: warmup + N=<measured_runs> + <aggregation> · Generated: <generated>`. `<gpu_label>` falls back from `gpu_model` → `'integrated graphics'` (if `gpu_present === true`) → `'no discrete GPU'`.

3. **Marker-anchored atomic write.** `replaceBetweenMarkers` uses `readmeText.slice(0, begin + BEGIN_MARKER.length) + '\n' + body + '\n' + readmeText.slice(end)` — preserves the BEGIN line verbatim, replaces everything between BEGIN and END (exclusive). `writeTextAtomic` writes to `README.md.bench-readme.tmp` then `renameSync` (scripts/release-bump.mjs pattern). The `main()` short-circuits with `[render] README.md already up to date — no write needed.` if `next === readmeText`, which is the idempotency guarantee.

### 3. `package.json` script entry (Task 2)

Added `"benchmark:render-readme": "node scripts/render-benchmark-readme.mjs"` adjacent to the existing `"benchmark"` entry from Plan 20-03. Surgical Edit — preserves all other scripts and the existing `"benchmark"` line verbatim (added trailing comma only).

## Idempotency Verification

The acceptance gate compares **post-1st-render to post-2nd-render** rather than naive `git diff README.md`:

```bash
bun run benchmark:render-readme       # first run — exits 0
cp README.md /tmp/readme-after-1.md   # snapshot post-1st-render
bun run benchmark:render-readme       # second run — emits "already up to date" and skips write
diff -q /tmp/readme-after-1.md README.md   # exits 0 — byte-identical
```

The naïve `git diff README.md` is buggy: Task 1 inserts the marker block, so README.md *always* differs from HEAD after the first render. The correct property is "two consecutive renders against unchanged JSON produce byte-identical output", which the snapshot-diff measures directly. All 8 inline verify checks pass:

| # | Check | Result |
|---|-------|--------|
| 1 | `node --check scripts/render-benchmark-readme.mjs` | PASS |
| 2 | `package.json` contains the wired script | PASS |
| 3 | Marker constants are exact strings in the generator | PASS |
| 4 | `replaceBetweenMarkers` function present | PASS |
| 5 | `writeTextAtomic` helper present | PASS |
| 6 | First render against Wave 1 skeleton exits 0 | PASS |
| 7 | Snapshot to /tmp/readme-after-1.md | PASS |
| 8 | Second render produces byte-identical README | PASS |

All 16 Task 2 acceptance criteria from the plan pass (file exists, no shebang, marker exact strings, fs.readFileSync vs Vite import, atomic write pattern, marker-anchored replace, defense-in-depth shape check, no TS-validator import, package.json entry, idempotency check, empty-table header in README, zero new npm deps).

## Plan-Level Verification

- `bun run build`: exits 0 (tsc + vite build succeeds; bundle 351 KB initial chunk unchanged from Plan 20-03 baseline)
- `bun run test`: 38 of 38 vitest-discovered tests pass (see "Deferred Issues" below for the pre-existing `scripts/release-bump.test.mjs` collector edge case)
- `grep -c "BEGIN:BENCHMARK_TABLE" README.md` → `1`
- `grep -c "END:BENCHMARK_TABLE" README.md` → `1`
- `bun run benchmark:render-readme` exits 0 against the empty-models skeleton

## Deferred / Future Work

- **Download column (currently blank).** The JSON schema does not carry a `download_size` field — runtime UI sources it from Ollama's `/api/show` via `OllamaModelInfo`. A `TODO(P23-DOCS-07)` comment in `deriveDownload` flags this as a candidate wiring task for Phase 23 if the README needs the column populated. For v1.3 the README table will be sparse in that column — acceptable because the Settings UI is the primary consumer and already shows download sizes there.
- **Parameters column heuristic.** Regex-derived from model name; works for `phi4-mini:3.8b`, `llama3.2:3b`, `qwen2.5:7b`, etc. Anything without a `:<N>b` or `-<N>b` segment renders blank. Phase 23 may need a hand-curated lookup table if the model lineup ever includes uncategorizable names. Out of scope for Plan 20-04.

## Deviations from Plan

None — plan executed exactly as written. The 3 files modified match the frontmatter's `files_modified` field (scripts/render-benchmark-readme.mjs, README.md, package.json). All acceptance criteria pass.

## Deferred Issues (Pre-existing — Out of Scope)

- `scripts/release-bump.test.mjs` reports "No test suite found" under vitest's runner — the file uses `node:test` style rather than `vitest`-native syntax. Pre-existing from Plan 19-02 (commit `462efbb`), confirmed by inspection. Already documented in `.planning/phases/20-benchmark-rerun-and-settings-recommendation-ui/deferred-items.md` (logged during Plan 20-02 execution). Not caused by this plan; no new entry needed.

## Threat Flags

No new security-relevant surface introduced by this plan beyond what the threat model in 20-04-PLAN.md already covers (T-20-01 variant: schema drift between .mjs and .ts validators — mitigated by `bun run build` catching divergence at module-load time; T-20-04 variant: interrupted README write — mitigated by atomic temp-rename in `writeTextAtomic`).

## Self-Check: PASSED

- File `scripts/render-benchmark-readme.mjs`: FOUND
- File `README.md` (modified, contains markers): FOUND
- File `package.json` (modified, contains `benchmark:render-readme` entry): FOUND
- Commit `9637dfd` (Task 1 — README markers): FOUND
- Commit `01e16e2` (Task 2 — generator + package.json wiring): FOUND
