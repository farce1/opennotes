# Phase 20: Benchmark Rerun & Settings Recommendation UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 20-benchmark-rerun-and-settings-recommendation-ui
**Areas discussed:** Alternate model lineup, Recommended-verdict mechanism, Benchmark metrics scope, README ↔ JSON sync mechanism

---

## Pre-Discussion Framing

Phase 20's domain boundary, methodology details, and most schema constraints are already locked by upstream artifacts:

- **ROADMAP.md** locks the 5 success criteria including: (a) hardware-tier stamp per row, (b) warmup + N=5 + median methodology, (c) `src/data/model-benchmarks.json` as single source of truth with `generated` timestamp + Vite static import, (d) badge predicate driven by JSON's `verdict: "recommended"` row with no hard-coded literal, (e) dependency-free at user-install time.
- **REQUIREMENTS.md** locks BENCH-01 through BENCH-05.
- **PITFALLS.md §Pitfall 7** locks the methodology specifics: `temperature: 0`, `seed: 42`, `num_predict: 512` for bounded speed measurement, `ollama stop` between models, hardware-tier'd README recommendations.
- **PROJECT.md §Out of Scope** locks: no live re-benchmarking per user install, no auto-recommendation override of user choice.
- **Phase 13 (v1.1) artifacts** locked the measurement spine: Python evaluator, synthetic transcripts, ground-truth fixtures, completeness-first quality dimension.

The remaining gray areas presented below are the genuine open questions that downstream agents (researcher + planner) needed user direction on.

---

## Alternate model lineup

| Option | Description | Selected |
|--------|-------------|----------|
| llama3.2:3b only | Single alternate, minimum bar, fastest bench | ✓ |
| qwen2.5:3b only | Different family, strong instruction-follower | |
| Both llama3.2:3b + qwen2.5:3b | Richer comparison, ~doubles bench runtime | |
| Add gemma3:12b too | Hardware-tier'd "for Apple Silicon unified memory", biggest model, slowest | |

**User's choice:** "i trust your recommendation, that you will bring best practices and robust solution" — best-practice default locked.
**Notes:** llama3.2:3b chosen as the single alternate because (a) different model family from phi4-mini gives a meaningful comparison rather than two variants of the same family, (b) 2 GB download runs on any 16 GB-RAM laptop without GPU, exercising the broad-compatibility tier the README will benefit from, (c) keeps the v1.3 bench window to ~30-60 min on a single dev machine. qwen2.5:3b and gemma3:12b deferred to v1.4+. The model list is data-driven in the harness so adding more is a config edit, not a code change.

---

## Recommended-verdict mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Maintainer manual `verdict` field | Maintainer writes `verdict: "recommended"` literally into JSON | ✓ |
| Auto-pick by highest overall_score | Helper picks top-scoring row at render time | |
| Hybrid (manual override + rule-based fallback) | Manual wins if set, otherwise auto-pick | |

**User's choice:** Locked to best-practice default.
**Notes:** Manual `verdict` field chosen because (a) "best" is context-dependent (speed vs quality vs RAM ceiling), (b) auto-pick on a tied score oscillates, (c) hybrid is over-engineering for v1.3. JSON schema permits multiple rows marked `recommended` for forward-compat with v1.4 hardware-tier'd recommendations, but v1.3 ships exactly one (`phi4-mini`). UI predicate iterates rows and applies the badge to any row matching by name with `verdict === "recommended"` — no hard-coded `phi4-mini` literal remains.

---

## Benchmark metrics scope

| Option | Description | Selected |
|--------|-------------|----------|
| Quality only | v1.1 completeness scores (action items, decisions) | |
| Quality + speed | Quality + tokens/sec + time-to-first-token + e2e latency | ✓ |

**User's choice:** Locked to best-practice default.
**Notes:** Quality + speed chosen because (a) ROADMAP P20 success criterion 3 implies a "verifiable benchmark table" with apples-to-apples comparison context, (b) PITFALLS pitfall 7 explicitly recommends bounded `num_predict: 512` speed measurement on top of unbounded quality measurement, (c) README's "model recommendations" benefit from both dimensions. Two measurement passes per model: quality pass uses production settings (`num_predict: -1`) on all 3 transcripts; speed pass uses bounded settings (`num_predict: 512`) on the 45-min transcript only, N=5 measured runs after a discarded warmup, median reported.

---

## README ↔ JSON sync mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-write the table at P23 release time | No script, accept drift risk | |
| Generator script + comment-bracketed block | `bun run benchmark:render-readme` writes between markers | ✓ |
| CI assertion fails PR on drift | CI greps and asserts block matches JSON | |

**User's choice:** Locked to best-practice default.
**Notes:** Generator + bracketed-block markers chosen. Phase 20 ships `scripts/render-benchmark-readme.mjs` and places empty `<!-- BEGIN:BENCHMARK_TABLE -->` / `<!-- END:BENCHMARK_TABLE -->` markers near the bottom of README.md as anchors. Phase 23 decides where the table lives in the rewritten end-user README and whether to add a CI assertion. Generator is idempotent and tolerates marker repositioning (re-finds by exact comment, not line number). Hand-write rejected because ROADMAP P23 success criterion 3 forbids hand-maintained numbers in prose.

---

## Claude's Discretion

Areas explicitly left to the planning agent's judgment:

- Whether the Node orchestrator calls Ollama directly via `fetch('http://localhost:11434/api/generate')` or shells out to the `ollama` CLI binary.
- Exact regex/parser for the BENCHMARK.md backfill (file shape preservation is the only requirement).
- Whether the in-app summary path (chunked summarization logic from `src-tauri/src/llm/mod.rs`) is reused by the harness via a small Rust binary or reimplemented in the Node orchestrator at the HTTP level.
- Per-platform GPU detection edge cases (Apple Silicon SoC vs discrete; Linux multi-GPU `lspci` output).
- Whether to add a brief speed measurement on the 15-min transcript in addition to the canonical 45-min.
- Whether to add a `scripts/benchmark-models.test.mjs` self-test with a mock Ollama responder.

---

## Deferred Ideas

Items captured during discussion that belong in other phases or future milestones:

- Additional models (qwen2.5:3b, gemma3:12b, larger Llama variants) — v1.4+ via lineup config edit.
- Multi-machine hardware-tier sweeps — v1.4+ once schema's `hardware_tiers[]` extension is wired.
- Hardware-tier'd "Recommended" badges in the UI (which one applies to this user) — v1.4 UI design problem.
- CI assertion on README ↔ JSON drift — Phase 23 (DOCS-07) decision.
- Auto-recommendation that overrides user model choice — out of v1.3 scope (PROJECT.md).
- Real-time per-user benchmark — out of v1.3 scope (PROJECT.md).
- Visual badge redesign (chip/icon/color stripe) — ROADMAP P20 explicitly forbids UI redesign in v1.3.
- JSON Schema (.json spec) file — over-engineering for single producer + single consumer.
