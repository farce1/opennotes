---
phase: 20
slug: benchmark-rerun-and-settings-recommendation-ui
status: green
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-13
audited: 2026-05-14
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Lifted from `20-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^4.0.18` (devDep) |
| **Config file** | `vite.config.ts` (two-project setup: `.tsx → jsdom`, `.ts → node`) |
| **Quick run command** | `bun run test src/lib/benchmarks.test.ts` |
| **Full suite command** | `bun run test` (alias for `vitest run`) |
| **Estimated runtime** | ~1s quick · ~5–15s full |

---

## Sampling Rate

- **After every task commit:** Run `bun run test src/lib/benchmarks.test.ts` (~1s)
- **After every plan wave:** Run `bun run test` (~5–15s)
- **Before `/gsd-verify-work`:** Full suite green + `bun run build` clean + manual harness dry-run (`bun run benchmark --model phi4-mini` produces a JSON file that `validateBenchmarks` accepts)
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| BENCH-01 | v1.1 BENCHMARK.md iteration-2 rows no longer contain `PENDING` for phi4-mini | smoke | `! grep -E "iteration 2.*PENDING" .planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` | N/A (file edit) | ⏸ pending P20-05 |
| BENCH-01 | v1.1 BENCHMARK.md iteration-0/1 PENDING rows are explicitly footnoted as unrecoverable | manual inspection | `grep -A1 -i "unrecoverable" .planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` returns footnote | N/A | ⏸ pending P20-05 |
| BENCH-02 | Each JSON row has `methodology.warmup_runs: 1`, `methodology.measured_runs: 5`, `methodology.aggregation: "median"`, plus a populated `hardware_tier` object | unit (contract) | `bun run test src/lib/benchmarks.test.ts -t "methodology"` | ✅ `src/lib/benchmarks.test.ts:14` | ✅ green |
| BENCH-03 | `src/data/model-benchmarks.json` `models` array has length ≥ 2 with names `phi4-mini` and `llama3.2:3b` | unit (contract) | `bun run test src/lib/benchmarks.test.ts -t "lineup"` | ✅ `src/lib/benchmarks.test.ts:15` | ✅ green (contract); ⏸ live data pending P20-05 |
| BENCH-04 | The shipped JSON validates against the TS schema at module-load time without throwing | unit | `bun run test src/lib/benchmarks.test.ts -t "validateBenchmarks"` | ✅ `src/lib/benchmarks.test.ts:6-13` (8 tests) | ✅ green |
| BENCH-04 | `src/data/model-benchmarks.json` bundles into the production JS chunk via Vite static import | build smoke | `bun run build && grep -lc "phi4-mini" dist/assets/*.js \| awk -F: '{s+=$NF} END{exit !(s>=1)}'` | N/A (build) | ⏸ pending P20-05 (mechanism wired in Plan 02; needs live data) |
| BENCH-05 | `formatModelLabel`'s recommended-detection no longer contains the literal `'phi4-mini'` | static | `! grep -n "'phi4-mini'" src/components/settings/SummarySection.tsx` | N/A | ✅ green |
| BENCH-05 | `matchesBenchmarkModel` returns true for the `:latest` suffix variant | unit | `bun run test src/lib/benchmarks.test.ts -t ":latest"` | ✅ `src/lib/benchmarks.test.ts:2` | ✅ green |
| BENCH-05 | Removing the `verdict: "recommended"` row from JSON makes the badge disappear without a code change | manual integration | Edit JSON to set both verdicts to `"alternate"`, run `bun run dev`, verify no model shows ` · Recommended`; revert | N/A (one-time) | ✅ manual gate (Plan 02 ships the predicate; awaits live JSON from P20-05) |
| Harness prompt-mirror | `scripts/benchmark-models.mjs::DEFAULT_STANDARD_PROMPT` is byte-identical to `src-tauri/src/llm/mod.rs:455` | byte-diff guard | `bun run test scripts/benchmark-models.prompts.test.mjs` | ✅ `scripts/benchmark-models.prompts.test.mjs` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ⏸ pending P20-05 (gated on maintainer-machine live run)*

---

## Wave 0 Requirements

- [x] `src/types/model-benchmarks.ts` — TS types (`BenchmarkData`, `BenchmarkModel`, `Verdict`, `HardwareTier`, `Methodology`, `Quality`, `Speed`) — shipped in Plan 20-01 (`f0cfbbb`)
- [x] `src/lib/benchmarks.ts` — `validateBenchmarks(raw: unknown): BenchmarkData` (hand-rolled type guards, throws on shape mismatch) + `matchesBenchmarkModel(modelName: string, jsonRowName: string): boolean` — shipped in Plan 20-01 (`5c51262`)
- [x] `src/lib/benchmarks.test.ts` — Vitest suite (15 tests) covering `:latest` suffix tolerance, case sensitivity (case-sensitive), empty-models tolerance, missing-verdict tolerance, schema_version mismatch, BENCH-02 methodology assertion against a fixture, and BENCH-03 lineup contract — shipped in Plan 20-01 (`13d5671` RED → `5c51262` GREEN)
- [x] `src/data/model-benchmarks.json` — skeleton with `schema_version: 1` and empty `models: []` (Plan 20-01, `d3668ac`); will be overwritten by Plan 20-05 maintainer-machine run

*Framework already installed; no install step needed in Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Removing the `verdict: "recommended"` row makes the badge disappear without a code change | BENCH-05 / ROADMAP SC #4 | Requires editing a data file and re-rendering the running dev server | (1) `bun run dev`, (2) open Settings → Summary, observe ` · Recommended` on phi4-mini (after P20-05 lands live data), (3) edit `src/data/model-benchmarks.json` to set every `verdict` to `"alternate"`, save, (4) Vite HMR reloads, no model shows ` · Recommended`, (5) revert. |
| Harness end-to-end dry run | BENCH-01..03 | Requires Ollama daemon + maintainer hardware | (1) `ollama serve` in a separate terminal, (2) `bun run benchmark --model phi4-mini` (single-model speed pass for fast feedback), (3) confirm `src/data/model-benchmarks.json` is well-formed (`validateBenchmarks` does not throw), (4) confirm pre-flight error messages by intentionally killing the daemon and re-running. |
| README marker block exists in expected position | BENCH-04 (and DOCS-07 forward dep) | The user-visible placement is finalized in Phase 23; P20 only places the empty markers | ✅ `grep -c "BEGIN:BENCHMARK_TABLE" README.md` returns `1` and `grep -c "END:BENCHMARK_TABLE" README.md` returns `1` (verified 2026-05-14). |
| `scripts/render-benchmark-readme.mjs` idempotency | BENCH-04 | Idempotency is structural, not regression-testable in CI without committing the rendered table | `bun run benchmark:render-readme && cp README.md /tmp/r1 && bun run benchmark:render-readme && diff -q /tmp/r1 README.md`; expected exit 0 (byte-identical after second render). |
| Plan 20-05 live-run output review (T-20-03 mitigation) | BENCH-01, BENCH-02, BENCH-03, BENCH-04 | Maintainer must visually inspect hardware-tier fields before commit (no hostname/username/IP/MAC leakage) | After `bun run benchmark`, inspect `src/data/model-benchmarks.json` `hardware_tier` block — only `cpu_model`, `total_ram_gb`, `gpu_present`, `gpu_model`, `os` should be present. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (8 automated rows + 5 manual-only with explicit reasons)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (`src/lib/benchmarks.ts`, `src/lib/benchmarks.test.ts`, `src/types/model-benchmarks.ts`, `src/data/model-benchmarks.json` skeleton — all shipped in Plan 20-01)
- [x] No watch-mode flags
- [x] Feedback latency < 15s (measured: ~145ms for benchmarks.test.ts, ~82ms for prompts test)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-14 (post-execution audit). Live-data-dependent rows (BENCH-01 a/b, BENCH-04 build-smoke) remain `⏸ pending P20-05` and are correctly classified as Manual-Only because Plan 20-05 is an autonomous:false maintainer-machine wave (requires live Ollama daemon, ~6 GB disk, ~45 min compute — exceeds Claude's tool budget per Plan 20-05 frontmatter).

---

## Validation Audit 2026-05-14

| Metric | Count |
|--------|-------|
| Requirement rows audited | 9 |
| Automated rows ✅ green | 6 |
| Automated rows ⏸ pending P20-05 (live data) | 3 |
| Manual-only entries | 5 |
| New test files generated this audit | 0 |
| Escalated to Manual-Only this audit | 0 |
| Extra tests discovered & added to map | 1 (`scripts/benchmark-models.prompts.test.mjs` — Rust prompt byte-diff guard) |

**Auditor finding:** Every Phase 20 requirement already has an automated unit/contract test (15 Vitest cases in `src/lib/benchmarks.test.ts` + 1 byte-diff guard in `scripts/benchmark-models.prompts.test.mjs`, all green at audit time). No test gaps required filling. The remaining "live data" rows are gated on Plan 20-05's maintainer-machine execution and are correctly bucketed as Manual-Only/⏸-pending — not Nyquist gaps. Phase 20 is Nyquist-compliant at the contract level; full compliance closes after P20-05 commits the live JSON.

**Commands run during audit:**
- `bun run test src/lib/benchmarks.test.ts` → 15 passed, 0 failed
- `bun run test scripts/benchmark-models.prompts.test.mjs` → 1 passed, 0 failed
- `bun run build` → exit 0
- `bun run test src/lib/benchmarks.test.ts -t "methodology"` → 1 passed (BENCH-02)
- `bun run test src/lib/benchmarks.test.ts -t "lineup"` → 1 passed (BENCH-03)
- `bun run test src/lib/benchmarks.test.ts -t ":latest"` → 2 passed (BENCH-05)
- `bun run test src/lib/benchmarks.test.ts -t "validateBenchmarks"` → 8 passed (BENCH-04)
- `grep -n "'phi4-mini'" src/components/settings/SummarySection.tsx` → 0 hits (BENCH-05)
- `grep -c "BEGIN:BENCHMARK_TABLE" README.md` → 1; `grep -c "END:BENCHMARK_TABLE" README.md` → 1
