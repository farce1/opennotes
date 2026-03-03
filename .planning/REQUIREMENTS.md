# Requirements: openNotes

**Defined:** 2026-03-02
**Core Value:** One-click meeting recording that produces structured, actionable meeting notes — entirely local, entirely free.

## v1.1 Requirements

Requirements for v1.1 Hardening & Quality release. Each maps to roadmap phases.

### LLM Model Selection & Quality

- [x] **LLM-01**: User can select any installed Ollama model and it is used for summary generation end-to-end (no hardcoded phi4-mini)
- [x] **LLM-02**: Model names are normalised (`:latest` stripped) before storage so the `summaries.llm_model` audit trail is consistent
- [x] **LLM-03**: Context window (`num_ctx`) adapts to the selected model instead of hardcoding 32768
- [x] **LLM-04**: User sees actionable error messages when Ollama fails (OOM, model too large, connection refused)
- [x] **LLM-05**: Model dropdown is disabled during active summary generation to prevent settings race
- [x] **LLM-06**: Settings dropdown shows recommendation labels (e.g., "Recommended" badge on phi4-mini)
- [ ] **LLM-07**: phi4-mini benchmarked on 15/45/90-min transcripts with documented quality findings
- [ ] **LLM-08**: `build_summary_prompt()` tuned based on benchmark results for better long-meeting output

### Frontend Performance

- [x] **PERF-01**: `@react-pdf/renderer` loaded via dynamic import, removed from initial bundle (~450KB savings)
- [x] **PERF-02**: `jszip` loaded via dynamic import, removed from initial bundle
- [x] **PERF-03**: `vite.config.ts` updated with `manualChunks` for React and markdown vendor cache stability
- [x] **PERF-04**: `rollup-plugin-visualizer` added as dev dependency for bundle analysis
- [x] **PERF-05**: Bundle audit completed with before/after measurements documenting improvements
- [x] **PERF-06**: First PDF export shows loading indicator during WASM init delay

### Dependency Risk

- [x] **DEPS-01**: `sherpa-rs` pinned to exact version (`= "0.6.8"`) in `Cargo.toml`
- [x] **DEPS-02**: Upgrade path documented (sherpa-onnx native Rust API as v1.2 migration path)
- [x] **DEPS-03**: GitHub Actions CI caches `sherpa-rs-sys` binary downloads to speed up builds

## v1.2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### LLM Enhancements

- **LLM-09**: In-app model comparison (dual summarization side-by-side)
- **LLM-10**: User can customise prompt templates with validation and reset-to-default
- **LLM-11**: `num_ctx` slider exposed as user setting for power users

### Dependency Migration

- **DEPS-04**: Migrate from sherpa-rs to sherpa-onnx native Rust API (when published to crates.io)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom model backends (llama.cpp, LM Studio, vLLM) | Ollama abstraction is sufficient; complexity not justified for v1.1 |
| Quantization-aware hardware recommendations | Requires hardware detection infrastructure; defer to v2+ |
| Model fine-tuning or custom training | Core constraint: use pre-trained models only |
| sherpa-rs → sherpa-onnx migration | Native Rust crate not yet on crates.io; evaluate in v1.2 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LLM-01 | Phase 11 | Complete |
| LLM-02 | Phase 11 | Complete |
| LLM-03 | Phase 11 | Complete |
| LLM-04 | Phase 11 | Complete |
| LLM-05 | Phase 11 | Complete |
| LLM-06 | Phase 11 | Complete |
| LLM-07 | Phase 13 | Pending |
| LLM-08 | Phase 13 | Pending |
| PERF-01 | Phase 12 | Complete |
| PERF-02 | Phase 12 | Complete |
| PERF-03 | Phase 12 | Complete |
| PERF-04 | Phase 12 | Complete |
| PERF-05 | Phase 12 | Complete |
| PERF-06 | Phase 12 | Complete |
| DEPS-01 | Phase 10 | Complete |
| DEPS-02 | Phase 10 | Complete |
| DEPS-03 | Phase 10 | Complete |

**Coverage:**
- v1.1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 after roadmap creation (phases 10-13)*
