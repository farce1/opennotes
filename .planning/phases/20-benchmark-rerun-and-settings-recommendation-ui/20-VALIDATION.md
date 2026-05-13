---
phase: 20
slug: benchmark-rerun-and-settings-recommendation-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
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
| BENCH-01 | v1.1 BENCHMARK.md iteration-2 rows no longer contain `PENDING` for phi4-mini | smoke | `! grep -E "iteration 2.*PENDING" .planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` | N/A (file edit) | ⬜ pending |
| BENCH-01 | v1.1 BENCHMARK.md iteration-0/1 PENDING rows are explicitly footnoted as unrecoverable | manual inspection | `grep -A1 -i "unrecoverable" .planning/milestones/v1.1-phases/13-llm-quality-tuning/BENCHMARK.md` returns footnote | N/A | ⬜ pending |
| BENCH-02 | Each JSON row has `methodology.warmup_runs: 1`, `methodology.measured_runs: 5`, `methodology.aggregation: "median"`, plus a populated `hardware_tier` object | unit | `bun run test src/lib/benchmarks.test.ts -t "methodology"` | ❌ W0 | ⬜ pending |
| BENCH-03 | `src/data/model-benchmarks.json` `models` array has length ≥ 2 with names `phi4-mini` and `llama3.2:3b` | unit | `bun run test src/lib/benchmarks.test.ts -t "lineup"` | ❌ W0 | ⬜ pending |
| BENCH-04 | The shipped JSON validates against the TS schema at module-load time without throwing | unit | `bun run test src/lib/benchmarks.test.ts -t "validateBenchmarks"` | ❌ W0 | ⬜ pending |
| BENCH-04 | `src/data/model-benchmarks.json` bundles into the production JS chunk via Vite static import | build smoke | `bun run build && grep -lc "phi4-mini" dist/assets/*.js \| awk -F: '{s+=$NF} END{exit !(s>=1)}'` | N/A (build) | ⬜ pending |
| BENCH-05 | `formatModelLabel`'s recommended-detection no longer contains the literal `'phi4-mini'` | static | `! grep -n "'phi4-mini'" src/components/settings/SummarySection.tsx` | N/A | ⬜ pending |
| BENCH-05 | `matchesBenchmarkModel` returns true for the `:latest` suffix variant | unit | `bun run test src/lib/benchmarks.test.ts -t ":latest"` | ❌ W0 | ⬜ pending |
| BENCH-05 | Removing the `verdict: "recommended"` row from JSON makes the badge disappear without a code change | manual integration | Edit JSON to set both verdicts to `"alternate"`, run `bun run dev`, verify no model shows ` · Recommended`; revert | N/A (one-time) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/types/model-benchmarks.ts` — TS types (`BenchmarkData`, `BenchmarkModel`, `Verdict`, `HardwareTier`, `Methodology`, `Quality`, `Speed`)
- [ ] `src/lib/benchmarks.ts` — `validateBenchmarks(raw: unknown): BenchmarkData` (hand-rolled type guards, throws on shape mismatch) + `matchesBenchmarkModel(modelName: string, jsonRowName: string): boolean`
- [ ] `src/lib/benchmarks.test.ts` — Vitest suite covering `:latest` suffix tolerance, case sensitivity (case-sensitive), empty-models tolerance, missing-verdict tolerance, schema_version mismatch, and the BENCH-02 methodology assertion against a fixture
- [ ] `src/data/model-benchmarks.json` — skeleton with `schema_version: 1` and empty `models: []` is enough for Wave 0 to compile; live data lands in a later wave once the harness produces it

*Framework already installed; no install step needed in Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Removing the `verdict: "recommended"` row makes the badge disappear without a code change | BENCH-05 / ROADMAP SC #4 | Requires editing a data file and re-rendering the running dev server | (1) `bun run dev`, (2) open Settings → Summary, observe ` · Recommended` on phi4-mini, (3) edit `src/data/model-benchmarks.json` to set every `verdict` to `"alternate"`, save, (4) Vite HMR reloads, no model shows ` · Recommended`, (5) revert. |
| Harness end-to-end dry run | BENCH-01..03 | Requires Ollama daemon + maintainer hardware | (1) `ollama serve` in a separate terminal, (2) `bun run benchmark --model phi4-mini` (single-model speed pass for fast feedback), (3) confirm `src/data/model-benchmarks.json` is well-formed (`validateBenchmarks` does not throw), (4) confirm pre-flight error messages by intentionally killing the daemon and re-running. |
| README marker block exists in expected position | BENCH-04 (and DOCS-07 forward dep) | The user-visible placement is finalized in Phase 23; P20 only places the empty markers | `grep -c "BEGIN:BENCHMARK_TABLE" README.md` returns `1` and `grep -c "END:BENCHMARK_TABLE" README.md` returns `1`. |
| `scripts/render-benchmark-readme.mjs` idempotency | BENCH-04 | Idempotency is structural, not regression-testable in CI without committing the rendered table | `bun run benchmark:render-readme && git diff --quiet README.md`; expected exit 0 (no diff after a re-run on the same JSON). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`src/lib/benchmarks.ts`, `src/lib/benchmarks.test.ts`, `src/types/model-benchmarks.ts`, `src/data/model-benchmarks.json` skeleton)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
