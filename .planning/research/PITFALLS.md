# Pitfalls Research

**Domain:** Adding LLM model selection, frontend performance optimization, and dependency risk mitigation to an existing Tauri 2 + React + Rust desktop app
**Researched:** 2026-03-02
**Confidence:** HIGH (codebase inspected directly; findings verified against Ollama official docs, Vite GitHub issues, sherpa-rs releases, and community post-mortems)

> **Context:** This document covers pitfalls specific to v1.1 hardening work on a working v1.0 MVP. The app already ships with 68 validated requirements, `~23,600 LOC`, Tauri 2 + React + Rust, sherpa-rs for transcription, and Ollama for summaries. Pitfalls from v1.0 construction (WASAPI silence gaps, CPAL callback blocking, macOS notarization, etc.) are documented in the prior research pass and are not repeated here. This file answers: "what breaks when adding model selection, bundle optimization, and dependency pinning to a working system?"

---

## Critical Pitfalls

### Pitfall 1: Hardcoded `num_ctx: 32768` Breaks When Users Switch to Models with Smaller Context Windows

**What goes wrong:**
The existing `run_generate_stream` and `run_generate_non_stream` functions in `src-tauri/src/llm/mod.rs` always send `"num_ctx": 32768` in the Ollama options. For phi4-mini this is fine — its theoretical maximum is 128k. However, if users switch to a smaller quantized model (e.g., `llama3.2:1b`, `gemma2:2b`, `qwen2.5:0.5b`) that was pulled with a Modelfile capping context at 2048 or 4096, Ollama either silently ignores the overriding value or — in some versions — crashes the model runner and returns a 500 error. The user sees a vague "Ollama generate failed" and has no explanation.

**Why it happens:**
Developers test model selection with well-known large models and never test a user-pulled 1B-parameter model that has a restricted context Modelfile. The `num_ctx` sent by the client is treated by Ollama as a hint but some model variants reject values that exceed their Modelfile-configured maximum. GitHub issue `ollama/ollama#9890` documents cases where large `num_ctx` values "completely break usability" — 100% CPU spin and no response.

**How to avoid:**
- Remove the hardcoded `"num_ctx": 32768` from both generate functions in `llm/mod.rs`
- Instead, estimate required context from transcript length at the call site: `max(required_tokens * 1.2, 4096)` capped at `131072`
- Before sending a generate request, call `/api/show` to inspect the model's `parameters` field and extract its actual `num_ctx` limit
- Alternatively, omit `num_ctx` from the request entirely and let Ollama use the model's Modelfile default — then handle context overflow via the existing `generate_summary_chunked` path that already exists in the codebase
- Add a clear error message distinguishing "Ollama not running" from "Ollama returned an error" (the current `format!("Ollama generate failed: {status} {body}")` is close — preserve the body in the user-visible message)

**Warning signs:**
- Summary generation hangs indefinitely or returns a 500 after switching models
- CPU pinned at 100% on the machine during summary generation after a model change
- Works with phi4-mini but fails with any other pulled model

**Phase to address:**
Phase implementing LLM model selection. The `num_ctx` handling must be resolved before exposing the model dropdown to users.

---

### Pitfall 2: Model Name Mismatch Between `/api/tags` Response and `/api/generate` Request

**What goes wrong:**
Ollama's `/api/tags` returns model names as `"phi4-mini:latest"` (with the `:latest` suffix) when the user has the default tag. The existing `check_model_pulled` function in `detect.rs` correctly normalises this with `starts_with` matching. However, the `SummarySection.tsx` saves the raw model name from the dropdown (which is populated from `list_ollama_models`) into `plugin-store` as the `ollamaModel` setting. If Ollama returns `"phi4-mini:latest"` and this full string is saved, then `DEFAULT_MODEL = "phi4-mini"` in `llm/mod.rs` will no longer match as a fallback and existing users who have never changed the setting (stored as `"phi4-mini"` without the tag) will have different behaviour from new users (stored as `"phi4-mini:latest"`). Both work with Ollama's generate endpoint, but the model name stored in the `summaries` table `llm_model` column will be inconsistent across users.

**Why it happens:**
The `/api/tags` API is not documented to guarantee whether `:latest` is included or stripped, and this has changed between Ollama versions. String equality is used in the status check flow. When model selection is added, the model name becomes user-input rather than a constant, making normalisation suddenly important.

**How to avoid:**
- Normalise model names before storing: strip a trailing `:latest` suffix before saving to plugin-store or the `summaries` table
- Apply the same normalisation in the `list_ollama_models` command before returning names to the frontend
- Add a migration guard in `getSettingsStore()` (in `settings.ts`) that reads the stored `ollamaModel`, strips `:latest`, and re-saves if it changed — this handles existing users who may have `:latest` stored from a previous session

**Warning signs:**
- Ollama status check shows model as "not ready" even though it is visible in the model list
- `summaries.llm_model` column shows inconsistent values like `"phi4-mini"` vs `"phi4-mini:latest"` across meetings

**Phase to address:**
Phase implementing LLM model selection, specifically the `list_ollama_models` command and the settings persistence logic.

---

### Pitfall 3: `@react-pdf/renderer` Adds ~700KB+ to the Initial JS Bundle and Cannot Be Tree-Shaken

**What goes wrong:**
`@react-pdf/renderer` at v4.x bundles yoga-wasm, pdfkit, fontkit, and other heavy dependencies that cannot be removed via tree-shaking because the library's internals reference them unconditionally. The library accounts for approximately 700KB–1.2MB of the minified+gzipped bundle (community reports, GitHub issue `diegomura/react-pdf#632`). Currently `SummaryExport.tsx` imports the library at the top level, meaning every user who opens the app pays this cost on startup — even before they ever try to export a PDF.

**Why it happens:**
The import is static and unconditional in `SummaryExport.tsx`:
```typescript
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
```
Vite cannot split this because it cannot know the export is only used on demand. The component renders in the `MeetingCompleteView` which is eagerly loaded on the `/meeting-complete` route. In a Tauri app, the bundle is loaded from disk (no CDN latency), but bundle parsing and JS execution cost still impact startup time, especially on slower machines.

**How to avoid:**
- Lazy-load the PDF export logic using a dynamic import triggered only when the user clicks "Export PDF":
  ```typescript
  const onExportPdf = async () => {
    const { pdf } = await import('@react-pdf/renderer');
    // ... rest of export
  };
  ```
- Move the `SummaryDocument` component and all `@react-pdf/renderer` imports into a separate file (`SummaryPdfExport.ts`) and import it only inside the async handler
- Do NOT use `React.lazy` for this — the component does not need to be lazily rendered, only the library needs to be lazily loaded for the export action
- Verify the split works using `vite-bundle-visualizer` (`npx vite-bundle-visualizer`) before and after
- The Markdown export and clipboard copy paths do not need the library and should remain synchronous

**Warning signs:**
- Running `npx vite-bundle-visualizer` shows `@react-pdf/renderer` in the main or eagerly-loaded chunk
- App startup time exceeds 800ms measured with DevTools Performance tab
- `dist/` contains a single large JS file exceeding 1MB

**Phase to address:**
Phase performing frontend bundle optimization. This is the highest-ROI single change for startup performance.

---

### Pitfall 4: Adding `manualChunks` to `vite.config.ts` Can Break the Existing `@react-pdf` Lazy Split

**What goes wrong:**
A well-intentioned addition of `build.rollupOptions.output.manualChunks` to extract vendor libraries into named chunks can inadvertently defeat any dynamic import-based lazy loading. Vite/Rollup's `manualChunks` function is evaluated **before** tree-shaking and chunk-splitting. If a `manualChunks` function assigns `@react-pdf/renderer` (or any of its transitive dependencies like `fontkit`, `pdfkit`) to a named chunk, Rollup may promote that chunk into the initial load graph to satisfy dependency ordering, undoing the lazy split. Vite GitHub issue `#5189` documents exactly this: "scripts set in manualChunks are loaded directly on the front page instead of being lazy loaded."

**Why it happens:**
Developers add `manualChunks: { vendor: [/@react-pdf/] }` or use the `SplitVendorChunkPlugin` strategy, expecting React-PDF to be isolated. Instead, Rollup sees that the named chunk is needed by the initial module graph (through static imports that weren't yet removed) and marks it as a synchronous dependency.

**How to avoid:**
- Remove all static imports of `@react-pdf/renderer` from the module graph **before** adding any `manualChunks` configuration
- Verify that `vite-bundle-visualizer` shows the PDF chunk as a separate async chunk after the dynamic import refactor
- Only then, optionally, add `manualChunks` to extract React and other truly-shared vendor libraries — but do not include `@react-pdf/renderer` in any manual chunk definition; let Rollup split it automatically from the dynamic import
- Use `manualChunks` only for libraries that are legitimately shared synchronous dependencies (React, React DOM, date-fns, lucide-react)

**Warning signs:**
- After adding `manualChunks`, the PDF-related code appears in `index-[hash].js` instead of a separate async chunk
- Network tab shows `@react-pdf` chunk loading on page load rather than on button click

**Phase to address:**
Phase performing frontend bundle optimization, after the dynamic import refactor for `@react-pdf` is completed and verified.

---

### Pitfall 5: `useSetting` Returns `null` on First Render, Causing Model Selection to Flash or Auto-Generate with Wrong Model

**What goes wrong:**
`useSettings.ts` is async: it loads settings from `plugin-store` on mount and returns `null` until the async read completes. The `SummarySection` guards against this with `currentModel = ollamaModel ?? DEFAULT_SETTINGS.ollamaModel`, which is correct. However, if `useSummary.ts` is called during the auto-summary flow triggered immediately after session end (before the settings hook has resolved), `getSetting('ollamaModel')` in `useSummary.generate()` reads from the store directly and could race with a concurrent `setSetting` from a settings change. More dangerously: if the user changes the active model in Settings while a summary is being generated, the mid-flight IPC call to `generate_summary` has already committed to `model: oldModel` on the Rust side, but the frontend's streaming channel will reflect the new model name in the next call. The mismatch is invisible to the user but the `llm_model` column in `summaries` will record the wrong model.

**Why it happens:**
The settings are loaded lazily and are not passed down as props to the summary generation — instead, `useSummary.generate()` reads settings at call time. This is fine for a single model but becomes a consistency hazard when the active model can change at any time.

**How to avoid:**
- Capture the model name at the start of `generate()` and pass it through the entire generation pipeline — do not re-read it mid-flow
- Disable the model dropdown in `SummarySection` while a summary is actively being generated (the `generating` state in `useSummary` can gate this)
- The `generate_summary` Tauri command already accepts `model` as a parameter; this is architecturally correct — the risk is on the call site not capturing the value before any async delay

**Warning signs:**
- `summaries.llm_model` in the database records `"phi4-mini"` even though user changed to a different model before clicking Generate
- Summary generation starts with one model and the logs show a different model name in the Rust backend output

**Phase to address:**
Phase implementing LLM model selection, during integration testing of the Settings → Summary flow.

---

### Pitfall 6: Updating `sherpa-rs` Version Pins Can Break CI Without Warning Due to `download-binaries` Network Calls

**What goes wrong:**
`sherpa-rs = { version = "0.6.8", features = ["download-binaries"] }` in `Cargo.toml` means every `cargo build` in CI downloads pre-built native sherpa-onnx binaries from GitHub Releases at compile time. When updating to a newer `sherpa-rs` version, the downloaded binaries change to a different sherpa-onnx upstream version. If the `sherpa-rs` build script's checksum validation fails (network fluke, CDN hiccup, GitHub rate limiting on the CI runner), the build silently fails or panics. The `UNSAFE_DISABLE_CHECKSUM_VALIDATION=1` escape hatch exists but is unsafe for production builds. Additionally, CI runners have no local cache of the downloaded binaries between runs, so a version bump that pulls a new 50MB binary adds that download to every CI invocation until caching is configured.

**Why it happens:**
The `download-binaries` feature is convenient for development but was not designed with reproducible CI caching in mind. The sherpa-rs build script downloads to a per-run temp directory by default, so Rust's `swatinem/rust-cache` does not cache the downloaded binaries (it caches compiled Rust artifacts, not build script downloads).

**How to avoid:**
- When evaluating a sherpa-rs version bump, test the new version on all three CI platforms (macOS, Windows, Linux) in a branch before merging — do not assume a version that works locally will work in CI
- Cache the sherpa-onnx binaries explicitly in the GitHub Actions workflow by caching the directory where `sherpa-rs-sys` places the downloaded artifacts (typically `$CARGO_HOME/registry/src/.../sherpa-rs-sys-*/`); check the exact path with `cargo build -v` to find the download destination
- Pin to an exact version in `Cargo.toml` using `= "0.6.8"` (already done) and commit `Cargo.lock` to the repository — this ensures CI always downloads the same binary
- Do not use `cargo update` on sherpa-rs without first verifying the new version's binaries are available for all three target platforms

**Warning signs:**
- CI fails on `cargo build` with a network error or checksum mismatch, while local builds succeed
- macOS CI builds succeed but Windows or Linux CI fails after a `sherpa-rs` version bump (binary availability varies per platform per release)
- Build time increases by 2–5 minutes after a `sherpa-rs` update (binary re-download, no cache hit)

**Phase to address:**
Phase evaluating sherpa-rs dependency health. The caching strategy for `download-binaries` must be implemented before any version bump is attempted.

---

### Pitfall 7: The Existing `check_model_pulled` Logic Will Silently Pass for Models That Are Pulled but Too Large for the User's RAM

**What goes wrong:**
`check_model_pulled` in `detect.rs` confirms that a model name appears in `/api/tags`. It does not confirm the model can actually run. A user may have pulled a large model (e.g., `llama3.3:70b` at 40GB) in a previous session; it appears in the model list and `model_ready: true`, but attempting to generate a summary with it on a machine with 8GB RAM will cause Ollama to fail with an OOM error. The error surfaces as `"Ollama generate failed: 500 ..."` with a body containing `"model requires more system memory"` — but the current error handling in `llm/mod.rs` strips this to a generic message.

**Why it happens:**
Status checking is separated from capability checking. The `/api/tags` response includes `size` (bytes on disk) but not runtime RAM requirements. Adding a free-form model picker lets users select models that cannot run on their hardware.

**How to avoid:**
- Parse the error body from Ollama 500 responses and surface model-specific messages to the user (the `body` is already available in `run_generate_stream` and `run_generate_non_stream` — currently it is included in the error string but formatted as a Rust-internal message)
- In the UI, show model file size from `/api/tags` (the `size` field) next to each model name in the dropdown as a heuristic warning
- On summary generation failure, check if the error body contains "requires more system memory" or similar and show a targeted error: "This model requires more RAM than is available. Try a smaller model."

**Warning signs:**
- Users report "summary failed" errors after selecting non-default models from the list
- Logs show `Ollama generate failed: 500` with a body mentioning memory
- Error message gives no actionable guidance

**Phase to address:**
Phase implementing LLM model selection, specifically in error handling and the model selection UX.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep hardcoded `"num_ctx": 32768` for all models | No change required | Breaks on small models; may cause OOM on low-RAM machines with large context models | Never — must be made dynamic before model selection is user-facing |
| Store raw model name from Ollama API without normalising | Simple code | `:latest` suffix inconsistency corrupts the `llm_model` audit trail in the DB | Never — normalise before storing |
| Add `manualChunks` without first removing static PDF imports | Bundle appears "organised" | Actually increases initial bundle size by promoting the PDF chunk into eager load | Never — fix static imports first, then optionally add `manualChunks` |
| Pin `sherpa-rs` forever without a documented upgrade path | No breaking changes risk | Security vulnerabilities in bundled sherpa-onnx binaries go unpatched; potential FFI incompatibility accumulates | Acceptable for v1.1, but the upgrade path must be documented in this milestone |
| Lazy-load PDF with `React.lazy` instead of a dynamic import | Familiar API | `React.lazy` only works for component default exports; `@react-pdf/renderer` exports are not React components | Never for this use case — use dynamic `import()` inside the button handler |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Ollama `/api/tags` | Treating the response as a stable list of ready-to-run models | Treat it as "models available on disk." Filter for models that are actively usable given hardware. Show size as a hint. |
| Ollama `/api/show` | Not calling it before generate to validate model context limits | Call `/api/show` to get the model's `parameters.num_ctx` before sending a prompt. Use that value to determine chunking strategy. |
| Ollama model pull during active summary | Allowing pull while a summary generation is in-flight | The `SummarySection` pull flow and `useSummary.generate` both invoke Ollama. If a pull starts while generation is running, Ollama may return 503 or queue the request indefinitely. Gate pull behind a "no active generation" check. |
| `plugin-store` settings on v1.0 → v1.1 upgrade | Adding a new setting key without migration for users who already have a store file | `getSettingsStore()` already checks `hasTheme` as a proxy for "first run." If a new key is added (e.g., `ollamaContextOverride`), existing users' store files will not have it. `store.get()` returns `undefined`, and the fallback `?? DEFAULT_SETTINGS[key]` handles it. This is safe — but do not change the type of an existing key (e.g., `ollamaModel` from `string` to `string | null`) without verifying all call sites handle the new type. |
| `@react-pdf/renderer` dynamic import | Calling `import('@react-pdf/renderer')` inside a React render path (e.g., in a `useMemo`) | Dynamic imports must only be called inside event handlers or `useEffect`. Calling inside render creates a new Promise on every render cycle and breaks React's rendering guarantees. |
| Vite build in Tauri's `beforeBuildCommand` | Forgetting that Tauri runs `npm run build` (tsc + vite build) in CI — bundle visualizer plugins left in production config slow down build | Keep `rollup-plugin-visualizer` in `vite.config.ts` only under `process.env.ANALYZE` guard |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Model list refresh on every Settings tab open | 200–400ms Ollama HTTP round-trip delay on every Settings navigation | Cache the model list in component state with a manual "Refresh" button; do not re-fetch on every mount | On every navigation to Settings if Ollama is on a remote host |
| `@react-pdf/renderer` WASM initialisation delay on first use | First PDF export takes 3–5 seconds while yoga-wasm initialises | Accept this as unavoidable first-use cost (WASM init is one-time per session); display a spinner and "Generating PDF..." label | First export per session — subsequent exports are fast |
| Vite splitting too many chunks | 30+ small chunk files in `dist/` cause many parallel HTTP requests on startup (even from disk in Tauri) | Target 3–6 chunks total: `index`, `react-vendor`, `pdf-vendor` (lazy), and route-specific lazy chunks. Avoid splitting below 20KB. | When `manualChunks` is overly granular; not critical for Tauri disk loads but adds IPC overhead |
| Ollama status check on every RecordView mount | Extra 200ms round-trip delay every time user navigates to Record tab | Poll Ollama status once at startup; update on manual refresh or on navigation to Settings/Summary views only | With slow Ollama host or network latency |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Displaying raw Ollama error bodies in the UI | Ollama error bodies may contain file system paths (e.g., model file paths), internal port numbers, or stack traces | Strip or truncate Ollama error bodies before displaying in the UI; show a simplified user-facing message and log the full body only to Rust stderr |
| Allowing arbitrary URL input for Ollama server without validation | User could type a URL pointing to an internal network resource, turning the app into an SSRF proxy | Validate the Ollama server URL allows only `http://` or `https://` schemes and reject non-HTTP schemes; the existing `currentServerUrl` is passed verbatim to Rust HTTP calls |
| Model names used directly in Ollama API calls without sanitisation | A model name containing newlines or JSON escape sequences could break the JSON payload sent to Ollama | Model names should only come from the `/api/tags` list (trusted source) or be validated against a safe character set (`[a-zA-Z0-9:._-]`) before use |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing all pulled models including ones that cannot run on the user's hardware | User selects a 70B model, generation fails with a cryptic error | Show model file size in the dropdown (from `/api/tags` `size` field). Consider greying out models larger than a configurable threshold. |
| No indication that model switching affects existing summaries | User switches from phi4-mini to llama3 and regenerates; expects same format | Add a note: "Switching models affects future summaries. Existing summaries are not changed." |
| Lazy-loaded PDF chunk shows a blank/frozen UI while loading | User clicks Export PDF, nothing visible happens for 2–3 seconds while WASM loads | Show a loading spinner immediately on click, before the dynamic import resolves; set `creatingPdf: true` before calling `import()` |
| Bundle optimization breaks existing layout if CSS chunks split incorrectly | App loads with unstyled content for a frame (Flash Of Unstyled Content) | Tailwind CSS v4 uses a Vite plugin that inlines critical CSS; verify this still works after any `vite.config.ts` changes by doing a production build and checking for FOUC |

---

## "Looks Done But Isn't" Checklist

- [ ] **Model selection:** Verify model selection persists across app restart — check `plugin-store` `settings.json` contains the chosen model name after restart
- [ ] **Model selection:** Verify model switching does NOT interrupt an in-progress summary generation — test by changing model mid-generation
- [ ] **Model selection:** Verify the `ollamaModel` setting stored in the DB `summaries.llm_model` column matches the model that actually generated the summary
- [ ] **PDF lazy load:** Run `npx vite-bundle-visualizer` and confirm `@react-pdf/renderer` chunks are absent from the eager load set
- [ ] **PDF lazy load:** Test PDF export after the dynamic import refactor — verify the generated PDF content is identical to pre-refactor output
- [ ] **sherpa-rs pinning:** Confirm `Cargo.lock` is committed to the repository and CI uses it (`cargo build` not `cargo build --update`)
- [ ] **sherpa-rs upgrade path:** Verify on all three CI platforms (macOS, Windows, Linux) that the pinned version builds successfully in a clean environment with no cached binaries
- [ ] **Settings migration:** Install v1.0, then upgrade to v1.1 with the new code, and verify no settings are lost or reset to defaults
- [ ] **Ollama num_ctx:** Test summary generation with a model that has a Modelfile capping context at 4096 tokens — verify no 500 error or hang
- [ ] **Ollama error body:** Verify that Ollama error messages shown in the UI do not expose internal file system paths

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Hardcoded `num_ctx` breaks small model users | LOW | Remove `"num_ctx"` from both generate functions or make it dynamic; 1 day including testing |
| Model name `:latest` suffix inconsistency in DB | LOW | Add normalisation in `list_ollama_models` command and a one-time migration in `getSettingsStore()`; half a day |
| `@react-pdf` in eager bundle after `manualChunks` added | LOW | Remove `@react-pdf` from `manualChunks` config and verify dynamic import is working; 2-4 hours |
| Static PDF import not removed before `manualChunks` | MEDIUM | Refactor `SummaryExport.tsx` to use dynamic import handler pattern; 1 day including regression test |
| sherpa-rs version bump breaks CI | MEDIUM | Revert `Cargo.toml` and `Cargo.lock` to previous version; investigate binary availability for the new version per platform; 1-3 days depending on platform-specific issues |
| Model RAM error surfaces as generic "failed" message | LOW | Parse Ollama error body and add model-specific error routing in `run_generate_stream`; 2-4 hours |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Hardcoded `num_ctx` breaks non-default models | LLM model selection phase | Summary generation succeeds with 3 different models including a <2B parameter model |
| Model name `:latest` normalisation | LLM model selection phase — settings persistence task | `summaries.llm_model` column contains normalised names across multiple model selections |
| `useSetting` race during auto-generate | LLM model selection phase — integration testing | Change model in Settings while a summary generates; verify DB records the pre-change model |
| `@react-pdf` in eager bundle | Frontend performance phase — bundle audit task | `vite-bundle-visualizer` shows PDF chunk as async-only |
| `manualChunks` undoing lazy split | Frontend performance phase — must come after dynamic import refactor | Network tab shows PDF chunk loads on button click, not on page load |
| sherpa-rs `download-binaries` CI caching | Dependency risk phase — CI audit task | CI build completes without re-downloading binaries on second run (cache hit confirmed) |
| Large model OOM error messages | LLM model selection phase — error handling task | OOM error surfaces as actionable UI message, not generic "failed" |
| Settings migration existing users | LLM model selection phase or frontend phase — whichever adds a new setting key first | Fresh install of v1.0 followed by in-place upgrade to v1.1 retains all settings |

---

## Sources

- [Ollama context-length official documentation](https://docs.ollama.com/context-length) (HIGH confidence)
- [Ollama GitHub issue #9890 — large context breaks model usability](https://github.com/ollama/ollama/issues/9890) (HIGH confidence)
- [Ollama GitHub issue #2714 — num_ctx misunderstanding](https://github.com/ollama/ollama/issues/2714) (HIGH confidence)
- [Ollama GitHub issue #5794 — expose model capabilities via /api/tags](https://github.com/ollama/ollama/issues/5794) (MEDIUM confidence)
- [Ollama GitHub issue #12094 — phi4-mini-reasoning crashes on recent Ollama versions](https://github.com/ollama/ollama/issues/12094) (HIGH confidence)
- [Ollama GitHub issue #13461 — 100% CPU spin near context limit](https://github.com/ollama/ollama/issues/13461) (HIGH confidence)
- [Ollama common mistakes in local LLM deployments (Medium)](https://sebastianpdw.medium.com/common-mistakes-in-local-llm-deployments-03e7d574256b) (MEDIUM confidence)
- [sherpa-rs GitHub releases — v0.6.8 is latest as of 2025-10-05](https://github.com/thewh1teagle/sherpa-rs/releases) (HIGH confidence)
- [sherpa-rs crates.io listing](https://crates.io/crates/sherpa-rs) (HIGH confidence)
- [diegomura/react-pdf GitHub issue #632 — huge bundle size](https://github.com/diegomura/react-pdf/issues/632) (HIGH confidence)
- [diegomura/react-pdf GitHub issue #1119 — tree-shaking not possible](https://github.com/diegomura/react-pdf/issues/1119) (HIGH confidence)
- [Vite GitHub issue #5189 — manualChunks loaded on front page instead of lazily](https://github.com/vitejs/vite/issues/5189) (HIGH confidence)
- [Vite GitHub issue #17653 — setting manualChunks breaks react lazy loading](https://github.com/vitejs/vite/issues/17653) (HIGH confidence)
- [Vite GitHub issue #12209 — using manualChunks breaks code-splitting](https://github.com/vitejs/vite/issues/12209) (HIGH confidence)
- [Mykola Aleksandrov — Route-level code-splitting with React.lazy, Suspense, and Vite manualChunks (2025)](http://www.mykolaaleksandrov.dev/posts/2025/10/react-lazy-suspense-vite-manualchunks/) (MEDIUM confidence)
- [infinitejs — Common pitfalls in React Suspense and lazy loading](https://infinitejs.com/posts/common-pitfalls-react-suspense-lazy-loading/) (MEDIUM confidence)
- [Cargo Book — Specifying Dependencies (version pinning)](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html) (HIGH confidence)
- [Effective Rust — Managing dependency graph](https://lurklurk.org/effective-rust/dep-graph.html) (HIGH confidence)
- Direct codebase inspection of `src-tauri/src/llm/mod.rs`, `src-tauri/src/llm/detect.rs`, `src/components/SummaryExport.tsx`, `src/components/settings/SummarySection.tsx`, `src/lib/settings.ts`, `src/hooks/useSettings.ts`, `src/hooks/useSummary.ts`, `Cargo.toml`, `package.json`, `vite.config.ts` (HIGH confidence — first-party)

---
*Pitfalls research for: v1.1 Hardening — LLM model selection, frontend performance, and dependency risk mitigation added to existing openNotes v1.0 MVP*
*Researched: 2026-03-02*
