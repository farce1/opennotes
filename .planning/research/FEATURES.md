# Feature Research

**Domain:** openNotes v1.1 — LLM Quality, Frontend Performance, Dependency Health
**Researched:** 2026-03-02
**Confidence:** HIGH (codebase read directly; ecosystem verified via official sources and WebSearch)

---

## Context: What Already Exists (v1.0)

v1.0 shipped on 2026-03-01. The full feature set is documented in the previous iteration of this file. This document covers only the **three v1.1 concerns**:

1. **LLM quality on long/domain-specific meetings** — phi4-mini is unbenchmarked at scale; need prompt tuning and user-selectable model support
2. **Frontend bundle size and startup performance** — @react-pdf/renderer added for export; bundle not audited since then; lazy-loading not applied
3. **sherpa-rs dependency health** — community-maintained crate last released October 2024; upstream sherpa-onnx has a native Rust API now

**Codebase reality (confirmed by reading source):**
- `@react-pdf/renderer` ^4.3.2 is a hard dependency loaded at startup — not lazy-loaded
- `SummarySection.tsx` already has a model selector dropdown (`<select>`) that shows all installed Ollama models
- `llm/mod.rs` uses `num_ctx: 32768`, hierarchical chunked summarization, and a single fixed prompt
- `llm/detect.rs` has `check_model_pulled()` using `/api/tags` — foundation for model management is already there
- `sherpa-rs` 0.6.8 (Oct 2024); upstream `sherpa-onnx` is at 1.12.28 (Feb 2026) with native Rust VAD API added in 1.12.27

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are the behaviors users assume any polished v1.1 hardening release will have. Missing them = the release feels like a regression or a skipped step.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Model quality is measurably better on long meetings | v1.0 shipped phi4-mini untested on long/domain-specific content; users expect v1.1 to address the known gap | MEDIUM | Requires benchmark runs on 30-min and 60-min real transcripts, prompt iteration, and validation of hierarchical summarization output quality |
| Model selection persists and applies correctly to all summary paths | Settings already has a model dropdown (confirmed in `SummarySection.tsx`); users assume the selected model is actually used everywhere, not just the happy path | LOW | Audit that `ollamaModel` setting is passed correctly through both `generate_summary_stream` and `generate_summary_chunked` paths in `llm/mod.rs` |
| App starts fast | After adding PDF export, users expect no startup regression — desktop apps must open in under 1 second subjectively | MEDIUM | `@react-pdf/renderer` is the primary suspect; needs lazy import via `React.lazy` + `Suspense` on the export button click path |
| Dependencies are pinned and upgrade path is documented | Shipping with a community crate that is 16 months behind upstream is a risk users don't know about, but maintainers must address proactively | LOW | Pin `sherpa-rs` version in `Cargo.toml`; document fallback plan; this is maintenance hygiene, not a user-visible feature |

### Differentiators (Competitive Advantage)

Features that make v1.1 meaningfully better than v1.0 and that no other fully-local meeting notes tool offers.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| User-selectable LLM model with quality guidance | LM Studio, Askimo, Open WebUI all show model dropdowns. openNotes already has the dropdown — the gap is guidance: which model is recommended for meeting summaries, and why | MEDIUM | Add model recommendation labels (e.g., "Recommended: phi4-mini" or "Fast: llama3.2:3b") in the settings dropdown; validated against known Ollama model characteristics |
| Improved summary quality on long meetings via tuned prompts | phi4-mini with 128K context is capable but prompt-sensitive; tuned prompts that force structured output and prevent hallucination on domain-specific terms are a genuine quality differentiator | MEDIUM | Requires iteration on `build_summary_prompt()` in `llm/mod.rs`; test on meeting transcripts > 30 min; measure section completeness and action item accuracy |
| Lazy-loaded export stack = faster perceived startup | Tauri apps are already small (~15 MB); lazy-loading the PDF renderer means the main bundle loads faster, improving first-impression quality — a meaningful polish win | MEDIUM | `React.lazy()` + `Suspense` wrapper around `SummaryExport.tsx` or dynamic import of `@react-pdf/renderer` inside `onExportPdf` handler |
| sherpa-rs version pinned + upgrade path documented | Users who build from source or self-host care about reproducibility; a pinned, tested dependency version is table stakes for a project claiming to be "auditable" | LOW | Pin exact version in `Cargo.toml` using `=0.6.8`; add comment in code documenting sherpa-onnx 1.12.x compatibility and fallback plan |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem like natural v1.1 additions but would create disproportionate complexity or scope creep.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Automatic model benchmarking in-app | Users want openNotes to test models and pick the best one automatically | Requires running the same transcript through multiple LLMs sequentially — slow, storage-intensive, and subjective (quality is task-dependent). No local meeting notes tool does this. | Provide curated recommendation text in the Settings UI based on external research; document benchmark methodology in GitHub README for power users |
| Full migration from sherpa-rs to sherpa-onnx native Rust API | sherpa-onnx now has native Rust VAD and ASR APIs (confirmed in 1.12.27); migrating would eliminate the community wrapper | sherpa-onnx's Rust API is not yet published as a crates.io crate — it is only available by building sherpa-onnx from source. This makes dependency management significantly harder and breaks cross-platform CI. Risk > reward for v1.1. | Pin sherpa-rs 0.6.8, document the migration path for v1.2, monitor sherpa-onnx Rust crate publication |
| Cloud model recommendations or model store | Users ask for a curated list of models to pick from (like LM Studio's model browser) | Requires fetching and caching remote data (Ollama registry), UI for browsing, and ongoing maintenance of recommendations as models evolve. Scope is a full sub-feature. | Hard-code a short recommended-models list in the Settings UI with Ollama pull names; link to ollama.com/library for browsing |
| Full bundle analysis CI gate | Adding bundle size CI checks to fail builds on regressions sounds like good practice | Tauri WebView bundle size is not the primary performance constraint — the Rust binary and model startup time dominate. A CI gate on JS bundle size would generate false urgency. | Use Vite's built-in `vite-bundle-visualizer` as a one-time audit tool to find the actual heavy imports; do not add ongoing CI gates for this |
| Replace phi4-mini as the default model | phi4-mini has known issues with some meeting types; switching defaults seems like a quality improvement | Changing the default model breaks existing user configurations silently (their local model may not be installed). The right approach is improving prompts before changing defaults. | Tune the prompt first; only change the default if benchmarks show a different model is consistently superior AND it is similarly small (3-4B params) for low-spec hardware |

---

## Feature Dependencies

```
[LLM Model Selection UX improvements]
    └──builds on──> [Existing model selector dropdown in SummarySection.tsx]
    └──requires──> [list_ollama_models Tauri command already implemented]
    └──enhances──> [Model quality benchmarking (offline research, not in-app)]

[Prompt Tuning for Quality]
    └──modifies──> [build_summary_prompt() in src-tauri/src/llm/mod.rs]
    └──affects both──> [generate_summary_stream (short meetings)]
    └──affects both──> [generate_summary_chunked (long meetings > 96K chars)]
    └──requires──> [Test corpus of real meeting transcripts]

[Frontend Bundle Optimization]
    └──targets──> [@react-pdf/renderer in SummaryExport.tsx]
    └──uses──> [React.lazy + Suspense (already available in React 19)]
    └──does NOT affect──> [Rust backend startup time]
    └──audit tool──> [vite-bundle-visualizer (one-time, not CI)]

[sherpa-rs Dependency Evaluation]
    └──reads──> [Cargo.toml sherpa-rs version pin]
    └──compares against──> [sherpa-onnx 1.12.28 changelog]
    └──produces──> [Version pin + upgrade path documentation]
    └──does NOT require──> [Code changes to transcription pipeline]
    └──future path──> [sherpa-onnx native Rust crate (not yet on crates.io)]
```

### Dependency Notes

- **Model selection UX builds on existing infrastructure:** The dropdown, `list_ollama_models` command, and settings persistence all exist. v1.1 work is additive — adding recommendation labels, not rebuilding the selector.
- **Prompt tuning affects both summarization paths:** The `build_summary_prompt()` function is shared. Any prompt change automatically applies to both single-pass and chunked summarization. This is the correct design.
- **PDF lazy-loading is isolated to SummaryExport.tsx:** The component already uses `useMemo` for section parsing and `useState` for async PDF creation. Converting to lazy import is a small, contained change.
- **sherpa-rs evaluation is research + documentation, not code:** The transcription pipeline is working correctly in v1.0. The v1.1 action is to document risk and pin versions — not to rewrite the integration.

---

## MVP Definition (v1.1 Scope)

### Ship in v1.1

Minimum changes to address the three documented v1.0 concerns.

- [ ] **Prompt benchmark + iteration** — Run phi4-mini on at least 3 real meeting transcripts of varying length (15 min, 45 min, 90 min+). Identify failure modes (truncated action items, missed decisions, hallucinated names). Iterate `build_summary_prompt()` until output is consistently structured. Document results.
- [ ] **Model recommendation labels in Settings** — Augment the existing model selector in `SummarySection.tsx` with a curated recommendation (e.g., mark `phi4-mini` as "Recommended"). Pull the curated list from a small constant in the frontend. Does not require backend changes.
- [ ] **Lazy-load @react-pdf/renderer** — Wrap the PDF export logic in a dynamic import so the PDF renderer does not load at app startup. Use `React.lazy` + `Suspense` or convert the import inside `onExportPdf` to `import('@react-pdf/renderer')`. Measure before/after with Vite's build output.
- [ ] **Bundle audit** — Run `npx vite-bundle-visualizer` or equivalent once, identify all imports over 100 KB in the initial chunk, and address the top 2-3 offenders beyond @react-pdf/renderer.
- [ ] **sherpa-rs version pin + upgrade path doc** — Pin `sherpa-rs = "=0.6.8"` in `Cargo.toml`. Add inline comment documenting sherpa-onnx version it targets (1.12.x) and the upgrade plan (monitor sherpa-onnx Rust crate on crates.io; fallback: write thin FFI if sherpa-rs falls > 3 versions behind). Update `.planning/research/STACK.md` with the finding that sherpa-onnx 1.12.27 added native Rust VAD API.

### Defer to v1.2

Features that are natural follow-ons but require more scope than v1.1 justifies.

- [ ] **In-app model comparison** — Let users generate summaries from the same transcript with different models side-by-side. High user value but doubles LLM invocations per meeting and requires significant UI work.
- [ ] **sherpa-onnx native Rust migration** — Wait for official crates.io publication of sherpa-onnx Rust crate (currently source-build only). Re-evaluate in v1.2 once the crate is stable and documented.
- [ ] **Prompt template customization UI** — Let users edit the summarization prompt. Currently the prompt is hardcoded in Rust (`build_summary_prompt()`). Moving it to a user-editable store requires UI, validation, and reset-to-default logic.
- [ ] **Context length slider** — Expose `num_ctx` as a user-facing setting. Currently hardcoded to 32768. Power users want control; general users do not need it. Good v1.2 setting.

### Future Consideration (v2.0+)

- [ ] **Custom model backends beyond Ollama** — Support llama.cpp directly, LM Studio API, or vLLM for users with specific hardware setups. Requires a provider abstraction layer.
- [ ] **Quantization-aware model recommendations** — Detect available VRAM/RAM and recommend specific quantization variants (Q4, Q5, Q8) per hardware. Complex hardware detection required.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Prompt benchmark + iteration on long meetings | HIGH | MEDIUM | P1 |
| Lazy-load @react-pdf/renderer | MEDIUM | LOW | P1 |
| Bundle audit (identify heavy imports) | MEDIUM | LOW | P1 |
| sherpa-rs version pin + upgrade doc | HIGH (risk mitigation) | LOW | P1 |
| Model recommendation labels in Settings | MEDIUM | LOW | P1 |
| In-app model comparison UI | MEDIUM | HIGH | P2 |
| Prompt template customization UI | MEDIUM | MEDIUM | P2 |
| Context length slider in Settings | LOW | LOW | P2 |
| sherpa-onnx native Rust migration | LOW (now) | HIGH | P3 |
| Custom model backend support | LOW | HIGH | P3 |

**Priority key:**
- P1: Target for v1.1 — directly addresses the documented concerns
- P2: Natural v1.2 follow-ons — additive improvements once P1 is validated
- P3: Future — requires ecosystem maturation or major scope expansion

---

## Detailed Feature Analysis

### Feature 1: LLM Quality on Long Meetings

**Current state (confirmed by reading source):**
- `MAX_SINGLE_PASS_CHARS = 96_000` (approximately 96K chars ≈ ~24K tokens at ~4 chars/token)
- `MAP_CHUNK_CHARS = 80_000` with `MAP_CHUNK_OVERLAP_CHARS = 2_000`
- `num_ctx = 32768` tokens hardcoded in both streaming and non-streaming paths
- Prompt is fixed: Overview + Key Points + Decisions Made + Action Items + TITLE line

**Known failure modes from architecture inspection:**
- phi4-mini is optimized for "math and logic" and "memory-constrained environments" — not specifically validated for meeting summarization
- Chunked path (`generate_summary_chunked`) concatenates partial summaries then runs a synthesis prompt — synthesis prompt quality is critical and currently minimal
- `num_ctx = 32768` at phi4-mini's 3.8B size is aggressive on low-RAM machines (< 8 GB)

**What good looks like:**
- Structured output sections are always complete (no truncated action items)
- Action items include person names when mentioned in transcript
- Decisions are not confused with general discussion
- Title is concise and accurate to meeting content
- Synthesis across chunks does not repeat or contradict

**Expected user behavior:** Users assume the AI summary is accurate. Summaries that miss half the meeting or repeat section headers without content destroy trust in the entire app.

**Complexity:** MEDIUM. Research and iteration, not new architecture. The chunking infrastructure already exists.

---

### Feature 2: Model Selection UX

**Current state (confirmed by reading source):**
- `SummarySection.tsx` already renders a `<select>` populated from `list_ollama_models` IPC call
- Default model is `phi4-mini` (hardcoded in `llm/mod.rs` as `DEFAULT_MODEL`)
- Model list is refreshed on settings page load and on explicit refresh button click
- No recommendation labels or size indicators shown
- Pull-model-by-name input exists for downloading new models

**What users expect (per LM Studio/Askimo research):**
- See which model is currently active and whether it is a good fit for the task
- Know model sizes so they can manage disk space
- Get a recommendation for which model to use if they are unsure
- Switch models without restarting the app (already works — it is just a settings save)

**Gap to address:** The mechanics are correct; the guidance is missing. Add recommendation annotation, not a new system.

**Complexity:** LOW. Frontend-only change to `SummarySection.tsx`. No backend changes needed.

---

### Feature 3: Frontend Bundle Optimization

**Current state (confirmed by reading package.json and SummaryExport.tsx):**
- `@react-pdf/renderer` ^4.3.2 is in `dependencies` (not devDependencies) — loaded on startup
- Import in `SummaryExport.tsx`: `import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'`
- This is a static top-level import — loaded when `SummaryExport` component is rendered
- `SummaryExport` is rendered in `SummaryPanel.tsx` (inferred from component structure)
- @react-pdf/renderer is known to be ~500-800 KB minified

**Other potential heavy imports (flagged for audit):**
- `jszip` ^3.10.1 — present in package.json; unclear which component imports it; ZIP export or bulk export
- `react-markdown` + `remark-gfm` — markdown rendering; likely smaller but worth checking
- `date-fns` ^4.1.0 — known for large bundle if not tree-shaken properly (though v4 improved this)
- `lucide-react` ^0.575.0 — icon library; tree-shakes well with named imports

**Recommended approach (HIGH confidence — standard React pattern):**
```typescript
// Before: static import at top of SummaryExport.tsx
import { pdf } from '@react-pdf/renderer';

// After: dynamic import inside the handler
const onExportPdf = async () => {
  const { pdf } = await import('@react-pdf/renderer');
  // ... rest of handler
};
```

**Impact:** @react-pdf/renderer moves from initial bundle to a separately loaded chunk. First app load is faster. PDF export still works — just has a brief load delay on first click (acceptable).

**Complexity:** LOW. Single file change. Vite handles dynamic import chunking automatically.

---

### Feature 4: sherpa-rs Dependency Health

**Confirmed facts (from source reads and WebFetch):**
- `sherpa-rs` last released: v0.6.8, October 5, 2024 (16 months ago as of research date)
- `sherpa-onnx` upstream: v1.12.28, February 28, 2026 — actively maintained with releases every 2-3 weeks
- `sherpa-onnx` v1.12.27 added native Rust VAD API; v1.12.26 added streaming ASR Rust API
- sherpa-onnx native Rust API is NOT yet published to crates.io — available only as source build
- `chobits-sherpa-rs` fork exists on crates.io (v0.7.0) — alternative if main crate stalls

**Risk assessment:**
- sherpa-rs v0.6.8 wraps sherpa-onnx ~1.12.x (confirmed in release notes)
- 16-month gap between sherpa-rs and sherpa-onnx does NOT mean incompatibility — sherpa-rs pins the sherpa-onnx it builds against via `sherpa-rs-sys`
- The risk is: if a future sherpa-onnx model format changes in a way that requires sherpa-rs API updates, openNotes would need to wait for sherpa-rs to catch up or fork

**What "health evaluation" means in practice:**
1. Verify which sherpa-onnx version `sherpa-rs 0.6.8` vendors/links against (check `sherpa-rs-sys` Cargo.toml)
2. Verify Parakeet TDT model files loaded in v1.0 still load correctly with current sherpa-onnx
3. Document the three fallback options (update sherpa-rs if released, use chobits-sherpa-rs fork, write thin FFI to sherpa-onnx C API)
4. Pin `sherpa-rs = "=0.6.8"` to prevent accidental breaking upgrades

**Complexity:** LOW. Research and documentation task with one small `Cargo.toml` change.

---

## Competitor Feature Analysis (v1.1 Scope)

*This section compares what analogous local-first tools do for the same three problem areas.*

| Area | LM Studio | Ollama Native App | Open WebUI | openNotes v1.0 | openNotes v1.1 target |
|------|-----------|-------------------|------------|----------------|----------------------|
| Model selector | Dropdown with size info, quantization type, hardware suitability | Dropdown in context window (added July 2025) | Per-chat dropdown with model descriptions | Dropdown with installed model names only | Dropdown with recommendation labels |
| Model recommendation | Hardware-aware recommendations, red/yellow/green suitability | None | None | None | Static curated recommendation text |
| Bundle/startup time | N/A (Electron) | N/A (Go) | N/A (server) | Not audited post-PDF export | Audited; PDF renderer lazy-loaded |
| Dependency management | Well-maintained | Well-maintained | Well-maintained | sherpa-rs 16 months behind upstream | Pinned + upgrade path documented |

**Key insight from competitor analysis:** LM Studio is the gold standard for local model management UX. Their pattern — show model size, quantization, hardware suitability, and a recommended badge — is what users expect after using LM Studio. openNotes does not need to match all of this (it is a meeting notes app, not a model manager), but adding a "Recommended" label and model size to the dropdown is a low-cost, high-signal improvement.

---

## Sources

- `src/components/settings/SummarySection.tsx` — confirmed model selector dropdown, pull flow, and model list behavior (HIGH confidence, direct source read)
- `src-tauri/src/llm/mod.rs` — confirmed prompt structure, context length (32768), chunking thresholds, and hierarchical summarization (HIGH confidence, direct source read)
- `src-tauri/src/llm/detect.rs` — confirmed `check_model_pulled()` and `list_ollama_models` infrastructure (HIGH confidence, direct source read)
- `src/components/SummaryExport.tsx` — confirmed static `@react-pdf/renderer` import (HIGH confidence, direct source read)
- `package.json` — confirmed `@react-pdf/renderer ^4.3.2` in runtime dependencies, `jszip ^3.10.1`, Vite 7.0.4 (HIGH confidence, direct source read)
- [sherpa-onnx GitHub releases](https://github.com/k2-fsa/sherpa-onnx/releases) — v1.12.28 Feb 28 2026; native Rust VAD API added v1.12.27 (HIGH confidence)
- [sherpa-rs GitHub](https://github.com/thewh1teagle/sherpa-rs) — v0.6.8, October 2024, 24 open issues, 298 stars (MEDIUM confidence — GitHub page summary)
- [Ollama phi4-mini model page](https://ollama.com/library/phi4-mini) — 128K context, 2.5 GB, optimized for math/logic/multilingual; no explicit meeting summarization claims (HIGH confidence)
- [React lazy loading documentation](https://react.dev/reference/react/lazy) — React.lazy + Suspense pattern for code splitting (HIGH confidence)
- [Vite bundle analysis](https://vueschool.io/lessons/vite-bundle-analyzer) — vite-bundle-visualizer as audit tool (MEDIUM confidence)
- [Askimo Ollama UI comparison](https://askimo.chat/app/ollama/best-gui-for-ollama/) — model selector patterns from Askimo, LM Studio, Open WebUI (MEDIUM confidence)
- [Local meeting notes with Ollama](https://dev.to/zackriya/local-meeting-notes-with-whisper-transcription-ollama-summaries-gemma3n-llama-mistral--2i3n) — Gemma3n, LLaMA, Mistral recommended for meeting summarization; model selection flexibility emphasized (MEDIUM confidence)

---
*Feature research for: openNotes v1.1 Hardening & Quality*
*Researched: 2026-03-02*
*Updated from: v1.0 feature research (2026-02-26)*
