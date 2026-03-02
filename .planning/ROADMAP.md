# Roadmap: openNotes

## Milestones

- ✅ **v1.0 MVP** — Phases 01-09 (shipped 2026-03-01)
- 🚧 **v1.1 Hardening & Quality** — Phases 10-13 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 01-09) — SHIPPED 2026-03-01</summary>

- [x] Phase 01: App Shell & Storage Foundation — completed 2026-02-26
- [x] Phase 02: Audio Capture Foundation (2/2 plans) — completed 2026-02-27
- [x] Phase 03: Transcription Engine Integration (3/3 plans) — completed 2026-02-27
- [x] Phase 04: Recording Orchestration (3/3 plans) — completed 2026-02-27
- [x] Phase 05: Notes/Summary Pipeline (3/3 plans) — completed 2026-02-27
- [x] Phase 06: Library + Data Workflows (3/3 plans) — completed 2026-02-28
- [x] Phase 07: Settings Surface Expansion (3/3 plans) — completed 2026-02-28
- [x] Phase 08: Cross-Platform Hardening (4/4 plans) — completed 2026-03-01
- [x] Phase 09: Polish & Tech Debt Cleanup (3/3 plans) — completed 2026-03-01

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 🚧 v1.1 Hardening & Quality (In Progress)

**Milestone Goal:** Address all three v1.0 known concerns — sherpa-rs dependency risk, LLM model selection gaps, frontend bundle performance, and prompt quality on long meetings.

- [x] **Phase 10: Dependency Risk Closure** — Pin sherpa-rs, document upgrade path, cache CI binaries (completed 2026-03-02)
- [ ] **Phase 11: LLM Model Selection End-to-End** — Fix hardcoded phi4-mini, normalise model names, improve error messages, UI labels
- [ ] **Phase 12: Frontend Bundle Optimization** — Lazy-load export stack, vendor chunking, bundle audit
- [ ] **Phase 13: LLM Quality Tuning** — Benchmark phi4-mini on real meetings, tune prompt for long-meeting output

## Phase Details

### Phase 10: Dependency Risk Closure
**Goal**: The sherpa-rs dependency is frozen at a known-good version, CI builds reliably on all three platforms, and a documented escape hatch exists for the future.
**Depends on**: Nothing (first v1.1 phase)
**Requirements**: DEPS-01, DEPS-02, DEPS-03
**Success Criteria** (what must be TRUE):
  1. `cargo build` on macOS, Windows, and Linux succeeds against the pinned `sherpa-rs = "=0.6.8"` version with no floating caret.
  2. GitHub Actions CI completes without downloading sherpa-rs-sys binaries on cache-hit runs.
  3. A developer reading `Cargo.toml` finds an inline comment describing the v1.2 migration path to sherpa-onnx native Rust API.
  4. The DEPS-02 upgrade-path document exists at `.planning/research/` and covers both the chobits-sherpa-rs fork and the direct FFI fallback options.
**Plans**: 1/1 complete

Plans:
- [x] 10-01: Pin sherpa-rs, add CI binary cache, write upgrade path document (completed 2026-03-02)

### Phase 11: LLM Model Selection End-to-End
**Goal**: The model selector the user chose in Settings is actually used everywhere — summary generation, Ollama status checks, and the setup wizard — with consistent model names in the database and clear error messages when things go wrong.
**Depends on**: Phase 10
**Requirements**: LLM-01, LLM-02, LLM-03, LLM-04, LLM-05, LLM-06
**Success Criteria** (what must be TRUE):
  1. User selects a non-default model in Settings and all subsequent summaries are generated with that model (no phi4-mini in logs or `summaries.llm_model` column).
  2. `summaries.llm_model` records `phi4-mini` not `phi4-mini:latest` regardless of which Ollama version or platform the user runs.
  3. User selects a small model (e.g., 1B) and summary generation completes without hanging or a cryptic 500 error — a message like "This model ran out of memory" appears in the UI.
  4. The model dropdown is visually disabled while a summary is being generated; attempting to change it has no effect.
  5. The Settings model dropdown shows a "Recommended" label alongside phi4-mini.
**Plans**: 2 plans

Plans:
- [ ] 11-01: Backend model wiring — normalise names, dynamic num_ctx, error classification, model-aware status checks, enriched model listing
- [ ] 11-02: Frontend UX — SummaryGenerationContext, enriched dropdown with sizes and Recommended badge, dropdown lock, SummaryError component, Generated-with label

### Phase 12: Frontend Bundle Optimization
**Goal**: The initial JavaScript bundle no longer includes the PDF renderer or zip library, making cold launch measurably faster, and a bundle analysis report exists documenting before/after size.
**Depends on**: Phase 10
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04, PERF-05, PERF-06
**Success Criteria** (what must be TRUE):
  1. Opening the app does not load `@react-pdf/renderer` or `jszip` — both appear only in lazily-fetched chunks visible in the network tab on first PDF export or ZIP download.
  2. The initial bundle main chunk is at least 40% smaller than the v1.0 baseline measurement, confirmed by `rollup-plugin-visualizer` treemap.
  3. `vite build` produces stable vendor chunk filenames for React and markdown libraries across rebuilds (no hash churn on unrelated changes).
  4. First PDF export after app launch shows a loading indicator ("Generating PDF...") for the duration of WASM initialization before the download begins.
  5. A bundle audit note exists (in a SUMMARY or CONTEXT file) with before/after chunk sizes as baseline for future regressions.
**Plans**: TBD

Plans:
- [ ] 12-01: Dynamic imports for @react-pdf/renderer and jszip in export.ts
- [ ] 12-02: vite.config.ts manualChunks, rollup-plugin-visualizer setup, bundle audit

### Phase 13: LLM Quality Tuning
**Goal**: phi4-mini's summarization quality on meetings of varying length is understood and measured, and the default prompt produces reliably complete structured output on long meetings.
**Depends on**: Phase 11
**Requirements**: LLM-07, LLM-08
**Success Criteria** (what must be TRUE):
  1. Benchmark results for 15-min, 45-min, and 90-min transcripts exist with documented quality findings (completeness of action items, decision capture accuracy, hallucination observations).
  2. `build_summary_prompt()` in `llm/mod.rs` is updated based on benchmark findings — the specific changes and rationale are documented.
  3. A 90-minute meeting transcript produces a summary with a non-empty Action Items section and no obviously truncated output.
**Plans**: TBD

Plans:
- [ ] 13-01: Benchmark phi4-mini on 15/45/90-min transcripts, tune build_summary_prompt()

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 01. App Shell & Storage Foundation | v1.0 | 3/3 | Complete | 2026-02-26 |
| 02. Audio Capture Foundation | v1.0 | 2/2 | Complete | 2026-02-27 |
| 03. Transcription Engine Integration | v1.0 | 3/3 | Complete | 2026-02-27 |
| 04. Recording Orchestration | v1.0 | 3/3 | Complete | 2026-02-27 |
| 05. Notes/Summary Pipeline | v1.0 | 3/3 | Complete | 2026-02-27 |
| 06. Library + Data Workflows | v1.0 | 3/3 | Complete | 2026-02-28 |
| 07. Settings Surface Expansion | v1.0 | 3/3 | Complete | 2026-02-28 |
| 08. Cross-Platform Hardening | v1.0 | 4/4 | Complete | 2026-03-01 |
| 09. Polish & Tech Debt Cleanup | v1.0 | 3/3 | Complete | 2026-03-01 |
| 10. Dependency Risk Closure | v1.1 | 1/1 | Complete | 2026-03-02 |
| 11. LLM Model Selection End-to-End | v1.1 | 1/2 | In Progress | - |
| 12. Frontend Bundle Optimization | v1.1 | 0/2 | Not started | - |
| 13. LLM Quality Tuning | v1.1 | 0/1 | Not started | - |
