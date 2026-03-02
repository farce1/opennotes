# Architecture Research

**Domain:** Local-first AI meeting transcription and summarization desktop app — v1.1 Hardening integration
**Researched:** 2026-03-02
**Confidence:** HIGH (based on direct codebase reading; research supplements with verified external sources)

---

## Context: What v1.1 Changes

This is not a greenfield architecture document. The v1.0 architecture is fully shipped and working.
v1.1 adds three targeted concerns:

1. **LLM model selection** — users pick any Ollama model; `check_ollama_status` is model-aware
2. **Frontend code-splitting** — lazy-load heavy imports (`@react-pdf/renderer`, `jszip`) to cut startup time
3. **sherpa-rs dependency health** — evaluate crate health, pin version, document upgrade path

The diagram and component list below reflect **only the components touched by v1.1**, how they integrate with
the existing architecture, and what changes vs. what stays the same.

---

## System Overview — v1.1 Touch Points

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       React / TS Frontend (WebView)                      │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  Settings > Summary tab                                              │ │
│  │  SummarySection.tsx                                                  │ │
│  │  ┌──────────────────────┐  ┌───────────────────────────────────┐    │ │
│  │  │ Model selector       │  │ Ollama Management panel           │    │ │
│  │  │ (select populated    │  │ list / delete / pull any model    │    │ │
│  │  │  from list_ollama_   │  │                                   │    │ │
│  │  │  models command)     │  │ [NEW: pull model UI re-uses       │    │ │
│  │  │                      │  │  model param already wired]       │    │ │
│  │  └──────────────────────┘  └───────────────────────────────────┘    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  export.ts — CURRENTLY eager-imported at module level               │ │
│  │  @react-pdf/renderer  (~450 KB gz)    → MOVE to dynamic import()    │ │
│  │  jszip                (~100 KB gz)    → MOVE to dynamic import()    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────────────┐  │
│  │ SetupView.tsx     │  │ useSummary.ts     │  │ useOllamaSetup.ts  │  │
│  │ (Ollama setup     │  │ reads ollamaModel │  │ hardcodes          │  │
│  │  hardcodes        │  │ from settings,    │  │ 'phi4-mini' for    │  │
│  │  'phi4-mini')     │  │ passes to command)│  │ pull — needs param)│  │
│  └───────────────────┘  └───────────────────┘  └─────────────────────┘  │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                      Tauri IPC Bridge                                    │
│                                                                          │
│  check_ollama_status(serverUrl, model?)   ← needs model param          │
│  pull_ollama_model(serverUrl, model)      already parameterised         │
│  list_ollama_models(serverUrl)            already exists                │
│  generate_summary(meetingId, model?)     already parameterised         │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                       Rust Backend (src-tauri)                           │
│                                                                          │
│  ┌──────────────────────┐    ┌──────────────────────────────────────┐   │
│  │  llm/detect.rs       │    │  llm/mod.rs                          │   │
│  │                      │    │                                      │   │
│  │  full_status()       │    │  DEFAULT_MODEL = "phi4-mini"         │   │
│  │  hardcodes           │    │  run_summary(transcript, url,        │   │
│  │  DEFAULT_MODEL as    │    │    model, on_token) — already        │   │
│  │  model_name arg      │    │    accepts any model string          │   │
│  │  → needs to accept   │    │                                      │   │
│  │    caller-supplied   │    │  save_summary() stores llm_model     │   │
│  │    model param       │    │  column — already schema-ready       │   │
│  └──────────────────────┘    └──────────────────────────────────────┘   │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │  transcription/worker.rs + mod.rs                                 │   │
│  │  sherpa-rs 0.6.8  (pinned in Cargo.toml)                         │   │
│  │  SileroVad  +  TransducerRecognizer (Parakeet TDT)               │   │
│  │                                                                   │   │
│  │  HEALTH: 0.6.8 released Oct 2025, upstream sherpa-onnx 1.12.9   │   │
│  │  Open issues: 24. PRs: 7. Stars: 298. Forks: 64.                │   │
│  │  Single maintainer (@thewh1teagle). Community-maintained.        │   │
│  │  RISK: maintainer dropout could strand the crate.               │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities — v1.1 Delta

### New vs Modified vs Unchanged

| Component | v1.1 Status | What Changes |
|-----------|-------------|--------------|
| `llm/detect.rs :: full_status()` | MODIFIED | Accept optional `model_name` param instead of always using `DEFAULT_MODEL`; `check_ollama_status` Tauri command passes it through |
| `commands.rs :: check_ollama_status` | MODIFIED | Accept optional `model: Option<String>` and forward to `llm::detect::full_status` |
| `useOllamaSetup.ts` | MODIFIED | Replace hardcoded `'phi4-mini'` pull with `ollamaModel` setting value |
| `SetupView.tsx` | MODIFIED | Pass configured model name to pull step, not hardcoded constant |
| `lib/export.ts` | MODIFIED | Convert top-level `@react-pdf/renderer` and `jszip` imports to dynamic `import()` inside `buildPdfBlob()` and `bulkExportZip()` |
| `vite.config.ts` | MODIFIED | Add `build.rollupOptions.output.manualChunks` to extract `@react-pdf/renderer`, `jszip`, `react-markdown`/`remark-gfm`, `lucide-react` into separate vendor chunks |
| `Cargo.toml :: sherpa-rs` | MODIFIED (evaluated) | Pin exact version `= "0.6.8"` (already `"0.6.8"`); add CHANGELOG note; document fallback path |
| `transcription/worker.rs` | UNCHANGED | No code changes needed for sherpa-rs evaluation |
| `SummarySection.tsx` | UNCHANGED | Model selector and pull UI already fully parameterised |
| `useSummary.ts` | UNCHANGED | Already reads `ollamaModel` from settings and passes to `generate_summary` |
| `llm/mod.rs :: run_summary` | UNCHANGED | Already accepts `model: &str` — no changes needed |
| `SessionCoordinator` / audio pipeline | UNCHANGED | v1.1 does not touch recording or transcription path |
| SQLite schema | UNCHANGED | `summaries.llm_model` column already stores the model name |

---

## Integration Points

### Feature 1: LLM Model Selection

**Integration surface is smaller than it looks.** Most of the pipeline is already parameterised. The two gaps are:

**Gap A — `check_ollama_status` ignores the caller-configured model.**

Current path:
```
check_ollama_status(serverUrl: Option<String>)
  → llm::detect::full_status(&url, llm::DEFAULT_MODEL)   ← constant, not user setting
  → OllamaStatus { model_ready: bool, model_name: "phi4-mini" }
```

Required path:
```
check_ollama_status(serverUrl: Option<String>, model: Option<String>)
  → let m = model.unwrap_or_else(|| llm::DEFAULT_MODEL.to_string());
  → llm::detect::full_status(&url, &m)
  → OllamaStatus { model_ready: bool, model_name: m }
```

Impact: one-line change to `commands.rs` and `llm/detect.rs`. `full_status()` already accepts `model_name: &str`.

**Gap B — `useOllamaSetup.ts` hardcodes `'phi4-mini'` for the pull step.**

```typescript
// Line 138 — current
await invoke('pull_ollama_model', { model: 'phi4-mini', onEvent: channel });

// Required
const model = await getSetting('ollamaModel');
await invoke('pull_ollama_model', { model: model || 'phi4-mini', onEvent: channel });
```

`SetupView.tsx` calls `useOllamaSetup.pullModel()` — it will automatically pull the user's configured model rather than always pulling phi4-mini.

**Data flow after fix:**
```
User changes model in SummarySection dropdown
  → useSetting('ollamaModel') persisted to settings.json (tauri-plugin-store)
  → useSummary.generate() reads ollamaModel via getSetting()
  → invoke('generate_summary', { model: ollamaModel, ... })
  → Rust: run_summary(transcript, url, model)    [already correct]
  → llm_model stored in summaries table           [already correct]

check_ollama_status now passes model to full_status
  → OllamaStatus.modelReady reflects the selected model, not always phi4-mini
```

**AppSettings type** already has `ollamaModel: string` and `DEFAULT_SETTINGS.ollamaModel = 'phi4-mini'`. No type changes needed.

---

### Feature 2: Frontend Bundle Size / Lazy-Loading

**Root cause:** `src/lib/export.ts` uses top-level static imports.

```typescript
// Current — loaded on every app startup even for users who never export
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import JSZip from 'jszip';
```

`@react-pdf/renderer` adds ~450 KB gzipped to the main bundle. `jszip` adds ~100 KB. Together ~550 KB of payload loaded even on the Record screen.

**Fix A — Dynamic imports in export.ts:**

```typescript
async function buildPdfBlob(data: MeetingExportData): Promise<Blob> {
  // Loaded only when PDF export is triggered — not at app startup
  const { Document, Page, StyleSheet, Text, View, pdf } = await import('@react-pdf/renderer');
  // ... existing code unchanged
}

export async function bulkExportZip(meetingIds: number[], format: ExportFormat): Promise<void> {
  const JSZip = (await import('jszip')).default;
  // ... existing code unchanged
}
```

`createElement` is already from React (top-level React import) — not from react-pdf.

**Fix B — vite.config.ts manualChunks:**

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-pdf': ['@react-pdf/renderer'],
          'vendor-zip': ['jszip'],
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
  // ...existing server config unchanged
});
```

`manualChunks` defines stable chunk names for caching. Dynamic imports in Fix A ensure pdf/zip chunks are not loaded until needed. The two fixes work together: manualChunks controls cache identity, dynamic import controls load timing.

**Fix C — Audit remaining eager imports:**

Files to audit for unnecessary eager loading:
- `SummaryPanel.tsx` imports `ReactMarkdown` + `remark-gfm` — used only on meeting detail screens, candidate for `React.lazy()`
- `SummaryExport.tsx` — check if it re-imports pdf-related code

Route-level lazy loading is lower priority since the app currently has few routes and Tauri's webview does local file loads (no network latency cost like a web app).

**Expected impact:** Main chunk shrinks by ~40–50%. App cold startup noticeably faster, especially on first launch when WebView cache is cold.

**What does NOT change:** The Tauri backend, IPC commands, SQLite schema, and all Rust code are completely untouched by this feature.

---

### Feature 3: sherpa-rs Dependency Health Evaluation

**Current state:**
- `Cargo.toml` pins `sherpa-rs = { version = "0.6.8", features = ["download-binaries"] }`
- `0.6.8` released October 2025, wraps upstream `sherpa-onnx 1.12.9`
- Single maintainer (`@thewh1teagle`), 298 stars, 64 forks, 24 open issues, 7 open PRs
- Community-maintained, not backed by a company or foundation
- Open issue #96: CMake 4.0 compatibility (build system concern, not functional)

**Risk profile:** MEDIUM. The crate works today and is actively maintained, but it is one maintainer with no institutional backing. If the maintainer stops, the project would need:
1. Direct FFI bindings to `sherpa-onnx-sys` (the underlying C library)
2. Or a fork of `sherpa-rs` with the project as de-facto owner

**Evaluation tasks (no code changes needed):**

| Task | Type | Outcome |
|------|------|---------|
| Confirm `0.6.8` builds cleanly on all three platforms in CI | Verification | Pass/fail documented |
| Review open issues for anything blocking v1.1 | Audit | Issue #96 (CMake) is build-env only, not a runtime bug |
| Document upgrade path to next minor version | Documentation | Note breaking API changes between `0.6.x` releases |
| Document FFI fallback plan | Documentation | Direct `sherpa-onnx` C bindings via `cc` crate if sherpa-rs abandoned |
| Pin to exact version `= "0.6.8"` | Cargo.toml | Already done — keep it; do not use `^0.6.8` semver range |

**Architecture impact:** Zero. This feature produces documentation and CI verification, not code changes. `transcription/worker.rs` and `transcription/mod.rs` are unchanged.

**Upgrade note for later:** sherpa-rs `0.6.x` → `0.7.x` is a minor version bump in their scheme but has historically included API changes to recognizer config structs. Test on a branch before upgrading. The `WorkerConfig` struct in `transcription/worker.rs` directly mirrors `TransducerConfig` fields — these will need auditing on any sherpa-rs upgrade.

---

## Data Flow Changes

### LLM Model Selection — before and after

**Before (v1.0):**
```
User setting 'ollamaModel' stored in settings.json
  → useSummary reads it → passed to generate_summary command ✓
  → check_ollama_status ignores it → always checks phi4-mini ✗
  → useOllamaSetup pulls phi4-mini regardless of setting ✗
```

**After (v1.1):**
```
User setting 'ollamaModel' stored in settings.json
  → useSummary reads it → passed to generate_summary command ✓ (unchanged)
  → check_ollama_status reads it → OllamaStatus.modelReady is accurate ✓ (fixed)
  → useOllamaSetup reads it → pulls user's chosen model ✓ (fixed)
```

### Frontend Bundle Load — before and after

**Before:**
```
App startup
  → main.tsx → App.tsx → (all routes eagerly imported)
  → export.ts loaded → @react-pdf/renderer loaded (~450 KB gz)
  → export.ts loaded → jszip loaded (~100 KB gz)
  [User on Record tab never exports, paid full cost anyway]
```

**After:**
```
App startup
  → main.tsx → App.tsx → routes loaded
  → export.ts loaded (module) but @react-pdf/renderer NOT loaded
  → jszip NOT loaded
  [User clicks Export PDF for first time]
     → dynamic import('@react-pdf/renderer') resolves from vendor-pdf chunk
     → buildPdfBlob executes with loaded module
  [Subsequent exports: chunk already in memory, no re-download]
```

---

## Architectural Patterns Relevant to v1.1

### Pattern 1: Settings-Driven Command Parameterisation

**What:** The `AppSettings` type in `src/types/index.ts` is the single source of truth for user preferences. Commands already accept `Option<String>` for `model` and `server_url`. The correct pattern is: read from settings in the hook, pass to command, do not hardcode in backend.

**When to use:** Any new preference that affects backend behaviour. This is how `ollamaModel`, `ollamaServerUrl`, `preferredMicDevice`, and `transcriptionLanguage` are all handled.

**Anti-pattern caught:** `useOllamaSetup.ts` line 138 hardcodes `'phi4-mini'` — this is the specific violation to fix. Every other LLM call already reads from settings.

### Pattern 2: Dynamic Import for Heavy Frontend-Only Libraries

**What:** Libraries used only on user action (export, print, download) should never be in the initial bundle. Vite's Rollup integration handles the chunking automatically when you use `await import('lib')` syntax. The pattern is:

```typescript
// Before: static import at module top — always bundled
import { pdf } from '@react-pdf/renderer';

// After: dynamic import inside the function — bundled separately, loaded on demand
async function buildPdfBlob(...) {
  const { pdf } = await import('@react-pdf/renderer');
}
```

**When to use:** Any dependency over ~50 KB gzipped that is not needed on the critical render path (app startup, main navigation).

**Tauri-specific note:** In Tauri, the frontend loads from a local file (`tauri://localhost` protocol), so there is no network latency for chunk loading. Dynamic imports are still worthwhile because they reduce WebView JS parse/compile time on startup, which is the dominant startup cost on lower-end hardware.

### Pattern 3: Exact Version Pinning for Native Binaries

**What:** `sherpa-rs` uses `features = ["download-binaries"]` to download pre-compiled native `.so`/`.dylib`/`.dll` files at build time. Semver ranges (`^0.6.8`) mean `cargo update` can silently pull a new version that downloads different binary artifacts. Use exact pinning (`= "0.6.8"`) for any crate that downloads native binaries.

**Current status:** `Cargo.toml` uses `sherpa-rs = { version = "0.6.8", ... }` which Cargo interprets as `^0.6.8` (compatible releases). Change to `= "0.6.8"` for exact pinning.

---

## Build Order for v1.1

Dependencies between the three features determine safe build order:

```
Step 1: sherpa-rs evaluation (no code changes)
  ├── Audit open issues, document upgrade path
  ├── Verify CI builds clean on all three platforms
  └── Update Cargo.toml to exact pin (= "0.6.8")
  ← No code risk. Do this first to close the open question.

Step 2: LLM model selection fix (small Rust + small TS)
  ├── Rust: commands.rs — add model: Option<String> param to check_ollama_status
  ├── Rust: llm/detect.rs — full_status() already accepts model_name, just wire it
  ├── TS: useOllamaSetup.ts — replace hardcoded 'phi4-mini' with getSetting('ollamaModel')
  └── TS: SetupView.tsx — verify it passes through correctly
  ← Small, contained, low risk. Rust and TS changes are independent.
  ← Test: set ollamaModel to 'llama3.2:3b', verify status and pull use that model.

Step 3: Frontend code-splitting (TS + vite config only, no Rust)
  ├── export.ts — convert @react-pdf/renderer and jszip to dynamic imports
  ├── vite.config.ts — add manualChunks configuration
  └── Audit SummaryPanel.tsx imports (react-markdown, remark-gfm)
  ← No backend changes. Isolated to build system and one library file.
  ← Test: npm run build, inspect bundle, verify chunk sizes.
  ← Risk: dynamic import timing — ensure TypeScript types still work (they do with type imports).
```

**Why this order:**
- Step 1 is pure documentation/verification — no risk, establishes baseline health check
- Step 2 Rust changes and Step 3 TS changes are fully independent — can be developed in parallel if needed, but Step 2 should merge first to keep PRs small
- Step 3 has the most potential for subtle build regressions (Rollup chunk splitting edge cases) so it goes last

---

## Internal Boundaries — v1.1 Changes

| Boundary | v1.0 Communication | v1.1 Change |
|----------|--------------------|-------------|
| `useOllamaSetup` → Tauri `pull_ollama_model` | Hardcoded `model: 'phi4-mini'` | Read from `getSetting('ollamaModel')` |
| Frontend → `check_ollama_status` command | No model param | Add `model?: string` param |
| `commands.rs` → `llm::detect::full_status()` | Passes `llm::DEFAULT_MODEL` constant | Passes caller-supplied model or falls back to `DEFAULT_MODEL` |
| `export.ts` → `@react-pdf/renderer` | Static import at module level | Dynamic `import()` inside `buildPdfBlob()` |
| `export.ts` → `jszip` | Static import at module level | Dynamic `import()` inside `bulkExportZip()` |
| `Cargo.toml` → `sherpa-rs` | `version = "0.6.8"` (semver compatible) | `version = "= 0.6.8"` (exact pin) |

---

## Anti-Patterns to Avoid in v1.1

### Anti-Pattern 1: Propagating the Model Hardcode

**What people do:** Fix `useOllamaSetup.ts` but forget `SetupView.tsx` which calls it, or fix the Rust `check_ollama_status` but leave `check_model_pulled` called from elsewhere still using the constant.

**Prevention:** Search all callsites of `DEFAULT_MODEL` in Rust and `'phi4-mini'` in TypeScript before closing the task. There are exactly two TypeScript callsites (useOllamaSetup and SetupView) and one Rust callsite (commands.rs check_ollama_status). `save_summary` in `commands.rs` also references `DEFAULT_MODEL` for manual saves — that should also be updated to accept the user's configured model.

### Anti-Pattern 2: Using React.lazy() for Non-Component Dynamic Imports

**What people do:** Try to apply `React.lazy(() => import('./export'))` to a utility module (non-component).

**Why it's wrong:** `React.lazy()` only works with modules that export a React component as their default export. `export.ts` exports plain async functions. Use `await import('...')` directly inside the function bodies.

**Do this instead:** Dynamic `import()` inside the async function, not `React.lazy()` at the module level.

### Anti-Pattern 3: Over-Splitting Vendor Chunks

**What people do:** Put every dependency in its own `manualChunks` entry, creating 20+ tiny chunks.

**Why it's wrong:** In Tauri's local file protocol, each chunk load is a synchronous disk read (fast), but too many chunks can cascade waterfall loads. Rollup's default chunking is already reasonable. Only manually chunk libraries that are genuinely large and independently cacheable.

**Do this instead:** Target `@react-pdf/renderer` (~450 KB gz) and `jszip` (~100 KB gz) as priority splits. Group `react-markdown` + `remark-gfm` together (they are always used together). Leave smaller utilities in the main vendor chunk.

### Anti-Pattern 4: Upgrading sherpa-rs During v1.1

**What people do:** See that a newer sherpa-rs version exists and upgrade "while we're in there."

**Why it's wrong:** sherpa-rs minor version bumps have historically changed `TransducerConfig` field names and `SileroVadConfig` defaults. An upgrade during v1.1 (which is a hardening release, not a feature release) introduces unrelated risk and obscures any regressions.

**Do this instead:** Pin at `= "0.6.8"`, document the upgrade path for v1.2, test the upgrade on a separate branch.

---

## Sources

- Direct codebase reading: `src-tauri/src/commands.rs`, `llm/mod.rs`, `llm/detect.rs`, `transcription/worker.rs`, `src/lib/export.ts`, `src/hooks/useOllamaSetup.ts`, `src/hooks/useSummary.ts`, `src/types/index.ts`, `src/lib/constants.ts`, `vite.config.ts`, `package.json`, `Cargo.toml` — HIGH confidence (ground truth)
- [sherpa-rs GitHub (thewh1teagle/sherpa-rs)](https://github.com/thewh1teagle/sherpa-rs) — v0.6.8 latest, 24 open issues, MEDIUM confidence (community crate)
- [sherpa-rs crates.io](https://docs.rs/crate/sherpa-rs/latest) — version history, release cadence — MEDIUM confidence
- [Vite code splitting — manualChunks](https://sambitsahoo.com/blog/vite-code-splitting-that-works.html) — MEDIUM confidence (community, consistent with Vite docs)
- [Vite features — dynamic import](https://vite.dev/guide/features) — HIGH confidence (official docs)
- [react-pdf bundle size issue](https://github.com/diegomura/react-pdf/issues/632) — confirmed ~450 KB gz, MEDIUM confidence (issue thread)
- [React.lazy and dynamic imports](https://www.freecodecamp.org/news/how-to-use-react-lazy-and-suspense-for-components-lazy-loading-8d420ecac58/) — MEDIUM confidence (community, standard React pattern)
- [Phi-4-Mini technical report](https://arxiv.org/html/2503.01743v1) — 128K context, summarization training limited to 30-min audio — HIGH confidence (official Microsoft paper)
- [Ollama API: list models](https://docs.ollama.com/api/tags) — `/api/tags` endpoint shape confirmed — HIGH confidence (official docs)

---
*Architecture research for: openNotes v1.1 — LLM model selection, frontend code-splitting, sherpa-rs evaluation*
*Researched: 2026-03-02*
