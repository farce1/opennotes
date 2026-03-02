# Project Research Summary

**Project:** openNotes v1.1 Hardening
**Domain:** Local-first AI meeting transcription and summarization — desktop (Tauri 2 + React + Rust)
**Researched:** 2026-03-02
**Confidence:** HIGH

## Executive Summary

openNotes v1.1 is a hardening release on top of a fully-shipped v1.0 MVP. The v1.0 codebase is in production with ~23,600 LOC covering the full meeting record-to-summary pipeline: CPAL audio capture, sherpa-rs/Parakeet TDT transcription, Ollama/phi4-mini summarization, and a Tauri 2 + React 19 + Vite 7 frontend. The three v1.1 concerns are precisely scoped: (1) LLM summarization quality on long and domain-specific meetings, (2) frontend bundle size regression from adding `@react-pdf/renderer`, and (3) sherpa-rs dependency health. All three are addressable without introducing new architectural patterns or major new dependencies — the work is configuration, targeted code changes, and documentation.

The recommended approach is to execute v1.1 in dependency order: first close the open risk on sherpa-rs with version pinning and a documented escape hatch, then fix the two hardcoded `phi4-mini` references that prevent model selection from working end-to-end, then eliminate the `@react-pdf/renderer` eager-load penalty with a dynamic import refactor. This order minimizes risk: each step is independently testable, the Rust and frontend changes do not overlap, and the highest-risk change (frontend build system) comes last when the other two are already validated. The only net-new dependency is `rollup-plugin-visualizer` (devDep, analysis only).

The primary risks are subtle, not structural. The `num_ctx: 32768` hardcode will silently break or hang when users select small models with restricted Modelfiles. Model name normalisation (stripping `:latest`) is required before storing to the database to prevent invisible audit-trail corruption. And `manualChunks` in Vite must never include `@react-pdf/renderer` — doing so promotes the chunk into the eager load graph and defeats the lazy-load goal. All three risks are well-documented with specific prevention steps in PITFALLS.md.

---

## Key Findings

### Recommended Stack

The v1.0 stack (Tauri 2, React 19, Vite 7, SQLite/sqlx, cpal, sherpa-rs, Ollama/reqwest) is validated and unchanged. **One new dev dependency is added:** `rollup-plugin-visualizer` 7.0.0 for bundle analysis under a `ANALYZE=true` environment guard. All other changes are import pattern changes (`React.lazy` + dynamic `import()`), `vite.config.ts` configuration (`manualChunks` for React and markdown vendors only), and `Cargo.toml` version-pin tightening. `ollama-rs`, `react-query`, and any sherpa-onnx native Rust crate are explicitly out of scope — the existing `reqwest`-based Ollama integration and `sherpa-rs 0.6.8` are both sufficient for v1.1.

**Core technologies (v1.1 delta only):**
- `rollup-plugin-visualizer` 7.0.0 — bundle treemap analysis, dev-only; the only justified new package
- `React.lazy` + `Suspense` (React 19, already installed) — route-level lazy loading for heavy views
- `dynamic import()` inside event handlers — for `@react-pdf/renderer` and `jszip` in `export.ts`
- `vite manualChunks` (Vite 7.0.4, already installed) — explicit vendor chunking for cache stability; React + markdown vendors only
- `sherpa-rs = "=0.6.8"` (exact pin) — freeze native binary downloads, document upgrade path

**Critical version constraint:** `rollup-plugin-visualizer` 7.0.0 requires Node 22+. Must be placed last in the Vite `plugins[]` array and gated behind `process.env.ANALYZE` so it does not run in production builds.

See `.planning/research/STACK.md` for the full technical rationale and code patterns for each change.

### Expected Features

v1.0 shipped the full feature set. v1.1 tightens three known gaps identified before launch.

**Must have (table stakes — v1.1 must close these):**
- LLM model selection works end-to-end — the dropdown already exists; `useOllamaSetup.ts` and `check_ollama_status` must read the user's setting instead of hardcoding `phi4-mini`
- Summarization quality measurably better on long meetings — benchmark phi4-mini on 15/45/90-min transcripts, tune `build_summary_prompt()`, validate hierarchical chunking output
- App startup noticeably faster — `@react-pdf/renderer` must be removed from the initial bundle via dynamic import in `export.ts`
- Dependencies pinned and upgrade path documented — `sherpa-rs = "=0.6.8"` in `Cargo.toml` with inline comment on fallback

**Should have (competitive — make v1.1 a quality signal, not just a fix release):**
- Model recommendation labels in the Settings dropdown (e.g., "Recommended" badge on phi4-mini) — low cost, high signal; the gap versus LM Studio is guidance, not mechanics
- Actionable error messages on Ollama failures — surface "model requires more RAM" from Ollama 500 response bodies; parse the body already available in `run_generate_stream`
- Model name `:latest` normalisation before persistence — prevents database audit-trail inconsistency across users and Ollama versions

**Defer to v1.2:**
- In-app model comparison (dual summarization) — high user value, high implementation cost, doubles LLM invocations
- Prompt template customization UI — requires user-editable store, validation, and reset-to-default logic
- `num_ctx` slider exposed as a user setting — power user feature, low general priority
- sherpa-onnx native Rust migration — crate not yet on crates.io; wait for official publication

**Defer to v2+:**
- Custom model backends beyond Ollama (llama.cpp, LM Studio, vLLM)
- Quantization-aware hardware recommendations

See `.planning/research/FEATURES.md` for the full feature prioritization matrix and competitor analysis.

### Architecture Approach

v1.1 touches six components across the stack; the rest is unchanged. The architecture is settings-driven: `AppSettings` in `src/types/index.ts` is the single source of truth for preferences, and every backend command already accepts `Option<String>` for model and server URL. The two violations of this pattern are exactly the two items to fix: `useOllamaSetup.ts` line 138 hardcodes `'phi4-mini'` for the model pull step, and `commands.rs::check_ollama_status` passes `llm::DEFAULT_MODEL` constant to `full_status()` instead of the caller-supplied model. Both are one-line Rust changes and a single TypeScript change.

**Components modified in v1.1:**
1. `commands.rs` + `llm/detect.rs` — add `model: Option<String>` to `check_ollama_status`; wire through to `full_status()`
2. `useOllamaSetup.ts` + `SetupView.tsx` — replace hardcoded `'phi4-mini'` with `getSetting('ollamaModel')`
3. `src/lib/export.ts` — convert `@react-pdf/renderer` and `jszip` static imports to dynamic `import()` inside `buildPdfBlob()` and `bulkExportZip()`
4. `vite.config.ts` — add `manualChunks` for React and markdown vendors; add `rollup-plugin-visualizer` under `ANALYZE` guard
5. `Cargo.toml` — tighten `sherpa-rs` to exact version pin `= "0.6.8"`
6. `llm/mod.rs` — tune `build_summary_prompt()` based on benchmark findings; address `num_ctx` hardcode for non-default models

**Components explicitly unchanged:** `transcription/worker.rs`, `SummarySection.tsx`, `useSummary.ts`, `llm/mod.rs::run_summary` (already accepts any model string), `SessionCoordinator`, SQLite schema.

See `.planning/research/ARCHITECTURE.md` for the full before/after data flow diagrams and anti-patterns to avoid.

### Critical Pitfalls

1. **`num_ctx: 32768` hardcode breaks non-default models** — Ollama ignores or rejects override values that exceed a small model's Modelfile-configured maximum; causes 100% CPU spin (Ollama issue #13461) or a 500 error with no user-facing explanation. Must be made dynamic (or omitted) before model selection is user-facing. See PITFALLS.md Pitfall 1.

2. **`@react-pdf/renderer` in `manualChunks` defeats lazy loading** — If `@react-pdf/renderer` is listed in `vite.config.ts::manualChunks`, Rollup promotes the chunk into the eager load graph (Vite issue #17653), undoing the dynamic import split. Fix: remove all static PDF imports first, verify the async split with `vite-bundle-visualizer`, then add `manualChunks` for React/markdown only — never include pdf/zip in manual chunk definitions. See PITFALLS.md Pitfall 4.

3. **Model name `:latest` suffix inconsistency** — `/api/tags` may return `phi4-mini:latest` while `DEFAULT_MODEL = "phi4-mini"`. If the raw name is persisted, `summaries.llm_model` records inconsistent values across users and Ollama versions. Fix: normalise model names (strip `:latest`) in `list_ollama_models` before returning to the frontend and before storing. See PITFALLS.md Pitfall 2.

4. **`useSetting` race during auto-generate** — Settings load asynchronously; if a user changes the active model while summary generation is in-flight, the `llm_model` column records the wrong model. Fix: capture `ollamaModel` at the start of `generate()` and disable the model dropdown while `generating === true`. See PITFALLS.md Pitfall 5.

5. **sherpa-rs `download-binaries` CI cache miss on version bumps** — Upgrading sherpa-rs downloads new 50MB native binaries in CI; `swatinem/rust-cache` does not cache build-script downloads. Fix: cache the `sherpa-rs-sys` download directory explicitly in GitHub Actions; never bump sherpa-rs during a hardening release. See PITFALLS.md Pitfall 6.

---

## Implications for Roadmap

Based on combined research, v1.1 maps cleanly to three phases ordered by risk and independence. The build order is validated by the architecture research: Rust backend changes and frontend bundle changes are fully independent after Phase 1 closes the dependency risk.

### Phase 1: Dependency Risk Closure
**Rationale:** Pure documentation and verification — zero code risk, establishes a known-good baseline before any changes. Closes the open sherpa-rs question that blocks confident CI for the rest of v1.1.
**Delivers:** Exact version pin in `Cargo.toml`, confirmed CI builds on all three platforms, documented upgrade path (chobits-sherpa-rs fork, direct FFI fallback), inline comment pointing to sherpa-onnx 1.12.27 native Rust API as the v1.2 migration path.
**Addresses:** sherpa-rs dependency health (table stakes feature).
**Avoids:** Surprise build failures on Windows/Linux from binary availability gaps (Pitfall 6); version drift during subsequent work.

### Phase 2: LLM Model Selection End-to-End
**Rationale:** The two hardcoded `phi4-mini` references are small, targeted Rust + TypeScript changes independent of bundle work. Fixing them first means Phase 3 bundle testing can run against a fully-correct settings flow. This phase also covers model name normalisation and error message improvements.
**Delivers:** `check_ollama_status` passes user's configured model to `full_status()`; `useOllamaSetup` pulls the user's selected model; model name normalisation (`:latest` stripping) in `list_ollama_models`; model recommendation labels in Settings dropdown; actionable OOM error messages from Ollama 500 bodies; model dropdown disabled during active generation.
**Uses:** Existing `reqwest` Ollama integration, `AppSettings.ollamaModel` settings path, `list_ollama_models` Tauri command.
**Implements:** Settings-driven command parameterisation pattern (already the project's established pattern — closes the two violations).
**Avoids:** Pitfalls 1 (`num_ctx` dynamic strategy), 2 (model name normalisation), 5 (settings race), 7 (OOM error handling).

### Phase 3: Frontend Bundle Optimization
**Rationale:** Isolated to the frontend build system and one utility file. Goes last because Rollup chunk splitting has subtle edge cases (documented in Pitfall 4) and build regressions here are easier to diagnose when the Rust backend is already stable.
**Delivers:** `@react-pdf/renderer` and `jszip` removed from initial bundle via dynamic imports in `export.ts`; `vite.config.ts` updated with `manualChunks` for React/markdown vendors; bundle audit with `rollup-plugin-visualizer` before and after; main chunk shrinks ~40-50%; startup noticeably faster on cold launch.
**Uses:** React 19 `lazy`/`Suspense` for view-level splitting; `dynamic import()` for utility library splitting; `rollup-plugin-visualizer` 7.0.0 for measurement.
**Avoids:** Pitfall 3 (`@react-pdf` in eager bundle), Pitfall 4 (`manualChunks` defeating lazy split). Critical sequencing: remove static imports first, verify with visualizer, then add `manualChunks` — never reverse this order.

### LLM Quality Improvement (Cross-Cutting, Parallel to Phases 2-3)
**Rationale:** Prompt tuning for `build_summary_prompt()` is research-and-iteration work that can run in parallel with Phases 2 and 3. It does not block either phase but must complete before v1.1 ships.
**Delivers:** phi4-mini benchmarked on 15/45/90-min transcripts; identified failure modes (truncated action items, missed decisions); tuned prompt with forced structured output; validated hierarchical chunking synthesis; results documented for v1.2 model-switching decisions.
**Uses:** Existing chunking infrastructure (`MAX_SINGLE_PASS_CHARS = 96_000`, `MAP_CHUNK_CHARS = 80_000`); existing `build_summary_prompt()` and synthesis path in `llm/mod.rs`.
**Avoids:** Summaries that destroy user trust; premature default model change before prompt quality is validated.

### Phase Ordering Rationale

- **Phase 1 first:** Closes CI risk before any code changes; establishes `Cargo.lock` baseline; zero chance of introducing regressions.
- **Phase 2 before Phase 3:** Rust changes and frontend bundle changes are independent, but the settings fix should be merged and tested before the build system changes alter the test environment. Keeps PRs small and focused.
- **Prompt tuning parallel:** Can run in any order relative to Phases 2-3 since it only touches `llm/mod.rs` prompt strings; the only dependency is access to real meeting transcripts.
- **No new abstractions:** All three phases work within established patterns (settings-driven commands, dynamic imports, exact version pinning). No new Rust crates, no new frontend state management, no schema changes.

### Research Flags

Phases needing deeper research during planning:
- **LLM Quality (prompt tuning):** Empirical work required — collect 3-5 real meeting transcripts across length categories; run systematically through phi4-mini and at least one alternative model; iteration count is unknown. Budget more time than the LOC count suggests.
- **`num_ctx` dynamic strategy in Phase 2:** Two viable approaches — (a) estimate from transcript length at call site, or (b) query `/api/show` before each generate call. Right choice depends on Ollama round-trip latency. Test both before committing to one.

Phases with standard patterns (no additional research needed):
- **Phase 1 (sherpa-rs pinning):** `Cargo.toml` exact version syntax is documented; the finding is clear: pin and document, do not migrate.
- **Phase 3 (bundle splitting):** React dynamic import + Vite chunking is a well-worn pattern; specific files to change are already identified from direct source reads.
- **Phase 2 (settings wiring):** Call sites are identified from source; pattern is consistent with existing codebase conventions.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All findings from direct codebase inspection and official docs. Only one new package (`rollup-plugin-visualizer`); everything else is configuration. Vite 7 (not 6) confirmed from `package.json` directly. |
| Features | HIGH | Codebase read confirmed exact state of model selector, export imports, and sherpa-rs pin. Gap analysis is based on ground truth, not inference. Competitor analysis (LM Studio, Open WebUI) adds context for recommendation labelling. |
| Architecture | HIGH | v1.1 touch points identified by direct file reads. Component responsibility boundaries confirmed. Unchanged components explicitly listed. Both data flow diagrams (before/after) derived from source, not assumption. |
| Pitfalls | HIGH | Six of seven pitfalls cite specific GitHub issues or Vite issues as evidence. The `num_ctx` pitfall is backed by Ollama issues #9890 and #13461 (100% CPU spin confirmed). The `manualChunks` pitfall backed by Vite issues #5189 and #17653. |

**Overall confidence:** HIGH

### Gaps to Address

- **phi4-mini prompt quality on long meetings:** The failure mode profile (truncated action items, hallucinated names, synthesis contradictions) is predicted from architecture inspection but not yet measured. Actual benchmark results may reveal unexpected issues in the chunking synthesis path. Cannot be resolved without running real transcripts — this is the highest-uncertainty item in v1.1.

- **`num_ctx` implementation choice:** Research documents the problem clearly but leaves the implementation choice open: (a) dynamic estimation from transcript length, (b) `/api/show` query before generate, or (c) omit `num_ctx` entirely. Option (c) is lowest risk but loses control over context allocation. Resolve by testing a model with a restricted Modelfile (e.g., a <2B model capped at 4096) before deciding.

- **sherpa-rs CI binary caching path:** The exact download directory for `sherpa-rs-sys` binaries must be confirmed with `cargo build -v` in the actual CI environment. The caching strategy is documented but the filesystem path needs empirical confirmation before setting up the GitHub Actions cache key.

- **WASM init delay on first PDF export:** First PDF export after lazy load will incur a 3-5s delay for yoga-wasm initialisation. This is unavoidable but needs a UX treatment (spinner + "Generating PDF..." label set before the dynamic import resolves). Not a gap in the implementation plan but a UX detail to handle during Phase 3.

---

## Sources

### Primary (HIGH confidence)
- openNotes v1.0 codebase (direct inspection) — `llm/mod.rs`, `llm/detect.rs`, `commands.rs`, `transcription/worker.rs`, `export.ts`, `useOllamaSetup.ts`, `useSummary.ts`, `SummarySection.tsx`, `SummaryExport.tsx`, `types/index.ts`, `Cargo.toml`, `package.json`, `vite.config.ts`
- [Ollama API docs — /api/tags](https://docs.ollama.com/api/tags) — response structure, `size` field, model name format
- [Ollama context-length docs](https://docs.ollama.com/context-length) — default 2048 tokens confirmed; `num_ctx` override behaviour documented
- [Ollama issue #9890](https://github.com/ollama/ollama/issues/9890) — large `num_ctx` "completely breaks usability"
- [Ollama issue #13461](https://github.com/ollama/ollama/issues/13461) — 100% CPU spin near context limit
- [Vite issue #17653](https://github.com/vitejs/vite/issues/17653) — `manualChunks` breaks React lazy loading
- [Vite issue #5189](https://github.com/vitejs/vite/issues/5189) — manual chunks loaded eagerly instead of lazily
- [react-pdf issue #632](https://github.com/diegomura/react-pdf/issues/632) — bundle size ~700KB-1.2MB confirmed (not tree-shakeable)
- [sherpa-rs releases](https://github.com/thewh1teagle/sherpa-rs/releases) — v0.6.8 from October 2025; single maintainer
- [sherpa-onnx releases](https://github.com/k2-fsa/sherpa-onnx/releases) — v1.12.28 Feb 2026; native Rust API added in v1.12.27
- [rollup-plugin-visualizer](https://github.com/btd/rollup-plugin-visualizer) — v7.0.0, Node 22+, 302K users
- [Phi-4-Mini technical report](https://arxiv.org/html/2503.01743v1) — 128K context, summarization training scope confirmed
- [Vite dynamic import features](https://vite.dev/guide/features) — code splitting patterns, official docs
- [Cargo specifying dependencies](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html) — exact version pin syntax (`= "0.6.8"`)

### Secondary (MEDIUM confidence)
- [Askimo Ollama UI comparison](https://askimo.chat/app/ollama/best-gui-for-ollama/) — model selector patterns in LM Studio, Open WebUI; basis for recommendation label guidance
- [Mykola Aleksandrov — Vite manualChunks + React.lazy (2025)](http://www.mykolaaleksandrov.dev/posts/2025/10/react-lazy-suspense-vite-manualchunks/) — safe interaction pattern between lazy and manualChunks
- [ollama-rs community Rust crate comparison] — basis for "do not add ollama-rs" recommendation; reqwest direct is simpler and already works

### Tertiary (LOW confidence)
- Model quality comparisons (phi4-mini vs. qwen2.5 vs. mistral for meeting summarization) — benchmarks are context-dependent; confidence on hardware fit is MEDIUM, confidence on meeting-summarization-specific quality is LOW until tested against real transcripts

---
*Research completed: 2026-03-02*
*Ready for roadmap: yes*
