# Stack Research — v1.1 Hardening

**Domain:** openNotes v1.1 — LLM model selection, frontend bundle optimization, sherpa-rs risk mitigation
**Researched:** 2026-03-02
**Confidence:** HIGH (all three areas verified via official docs and direct codebase inspection)

> This file covers ONLY new stack needs for v1.1. The v1.0 baseline stack (Tauri 2, React, SQLite/sqlx,
> cpal, sherpa-rs, Ollama/reqwest) is already validated and in production. Do not re-research it.

---

## Area 1: Ollama Model Benchmarking and User-Selectable Models

### What the Codebase Already Has

The v1.0 code already has the full model selection scaffolding in place:

- `list_ollama_models` Tauri command hits `GET /api/tags` and returns `Vec<String>` of model names
- `generate_summary` Tauri command already accepts an `Option<String>` model parameter
- `pull_ollama_model` Tauri command already accepts an `Option<String>` model
- `llm::DEFAULT_MODEL = "phi4-mini"` is the only hardcoded default
- `SummaryRow` already stores `llm_model: Option<String>` in SQLite

**The backend plumbing for model selection is done.** v1.1 needs: (a) UI to expose the picker, (b) benchmark tooling to inform recommended models, and (c) prompt tuning for long meetings.

### Ollama API Surface (verified against docs.ollama.com)

| Endpoint | Method | Purpose | Key Response Fields |
|----------|--------|---------|---------------------|
| `/api/tags` | GET | List downloaded models | `models[].name`, `models[].details.parameter_size`, `models[].size` (bytes) |
| `/api/show` | POST | Show model metadata | `model_info`, `parameters` (includes default `num_ctx`) |
| `/api/ps` | GET | List currently loaded models | Running models in VRAM/RAM |
| `/api/generate` | POST | Generate text | `options.num_ctx` controls context window per-request |

The codebase uses `reqwest` directly (not `ollama-rs`). This is the right call — the existing integration is lean and sufficient. **Do not add `ollama-rs` as a dependency.**

### Recommended Models for Meeting Summarization (Ollama)

Research findings on small-to-medium models suitable for local CPU/iGPU use:

| Model | Size | Context | Notes | Confidence |
|-------|------|---------|-------|------------|
| `phi4-mini` | 3.8B (~2.5 GB) | 128K tokens | Current default. Strong reasoning, optimized for low-resource. Sufficient for most meetings. | MEDIUM |
| `qwen2.5:7b` | 7B (~4.5 GB) | 128K tokens | Better instruction following and structured output than phi4-mini at 2x the RAM cost. Good upgrade for users with 8+ GB RAM. | MEDIUM |
| `mistral:7b` | 7B (~4.1 GB) | 32K tokens | Strong summarization quality, widely tested, moderate context. Fallback for users preferring Mistral. | MEDIUM |
| `llama3.2:3b` | 3B (~2.0 GB) | 128K tokens | Faster than phi4-mini, lower quality. Suitable for quick summaries or weak hardware. | LOW |

**Key finding on phi4-mini and long meetings:** phi4-mini's 128K context window is large enough to hold any meeting transcript before chunking is needed. The current `MAX_SINGLE_PASS_CHARS = 96_000` (~24K tokens) means most meetings go through the single-pass path. The risk is prompt-following quality on the structured output format, not context length. Tuning the prompt and testing structured output compliance is the correct v1.1 investigation, not replacing the model by default.

**Key finding on `num_ctx`:** Ollama's default `num_ctx` at runtime is 2048 tokens regardless of model capability. The codebase already overrides this to `32768` in `run_generate_stream`. This should be verified during benchmark testing — some models may benefit from higher values.

### No New Rust Dependencies for Area 1

The existing `reqwest 0.12` + `serde_json` stack handles all Ollama API calls. No new crates needed.

### Benchmark Infrastructure (dev tool only)

For the benchmark work (not shipped in the binary), use a simple Rust test harness or shell script that:
1. Calls `GET /api/tags` to enumerate available models
2. Times TTFT (time-to-first-token) and total generation time via wall clock
3. Sends fixed test transcripts of 3 lengths: short (5 min / ~1K tokens), medium (30 min / ~6K tokens), long (90 min / ~20K tokens)

No additional crate needed. Use `std::time::Instant` in a test file or `cargo bench`.

---

## Area 2: Frontend Bundle Optimization

### Current Bundle Profile

From `package.json`, the heaviest dependencies are:

| Package | Estimated Gzipped Size | Load Characteristic |
|---------|------------------------|---------------------|
| `@react-pdf/renderer` ^4.3.2 | ~450 KB minified (large) | Needed only on PDF export, never on startup |
| `jszip` ^3.10.1 | ~100 KB minified | Needed only on ZIP export |
| `react-markdown` + `remark-gfm` | ~50 KB combined | Needed only in MeetingCompleteView and LibraryView |
| `lucide-react` ^0.575.0 | Varies (tree-shakeable) | Should be fine with current Vite tree-shaking |
| `date-fns` ^4.1.0 | Varies (tree-shakeable) | Should be fine with modern import patterns |

**The two high-impact targets are `@react-pdf/renderer` and `jszip`.** One industry report documented a bundle growing from 500 KB to 1.2 MB from `@react-pdf/renderer` alone. Both are used only during export operations — they have no business being in the initial bundle.

### Recommended Stack Additions for Area 2

#### 1. `rollup-plugin-visualizer` (dev dependency only)

**Version:** 7.0.0 (published ~March 2026)
**Purpose:** Generates an interactive HTML treemap showing bundle composition by module
**Why this one:** 302K GitHub users, actively maintained (Node 22+ requirement, recent v7 release), direct Vite plugin integration, works as last entry in `plugins[]` array
**How to use:** Add to `vite.config.ts` for analysis builds only; remove or gate behind `process.env.ANALYZE` for normal builds

```bash
npm install -D rollup-plugin-visualizer
```

```typescript
// vite.config.ts (analysis mode only)
import { visualizer } from 'rollup-plugin-visualizer';

plugins: [
  react(),
  tailwindcss(),
  process.env.ANALYZE && visualizer({ open: true, gzipSize: true, template: 'treemap' }),
].filter(Boolean)
```

**Confidence:** HIGH — official Vite docs reference this plugin, actively maintained, widely used

#### 2. React.lazy + Suspense for Route-Level Code Splitting (no new dependency)

**Version:** Built into React 19 (already installed)
**Purpose:** Defer loading of heavy view components until routes are actually visited
**Why:** Vite automatically creates separate chunks for each `dynamic import()`. Combined with `React.lazy`, the initial JS payload shrinks to only what the landing route needs.

The `SummaryExport.tsx` and any component tree that imports `@react-pdf/renderer` or `jszip` should be the primary targets. The App.tsx router already uses static imports — converting to lazy imports requires zero new dependencies.

Pattern for `App.tsx`:
```typescript
// Before (static — @react-pdf/renderer lands in initial bundle):
import { MeetingCompleteView } from './views/MeetingCompleteView';

// After (lazy — @react-pdf/renderer only loads when route is visited):
const MeetingCompleteView = React.lazy(() => import('./views/MeetingCompleteView'));
```

Wrap the `<Route>` tree in `<Suspense fallback={<div>Loading...</div>}>`.

**Confidence:** HIGH — React core feature, Vite native support, well-documented pattern

#### 3. Vite `build.rollupOptions.output.manualChunks` (no new dependency)

**Version:** Built into Vite 7 (already installed — note: project already uses Vite 7.0.4 per package.json, not 6.x as the old research stated)
**Purpose:** Explicit vendor chunking to maximize browser caching across deploys
**Why:** Separating rarely-changing libraries (React, react-router) from frequently-changing app code gives each a stable cache hash.

Pattern for `vite.config.ts`:
```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom', 'react-router'],
        'vendor-markdown': ['react-markdown', 'remark-gfm'],
        // @react-pdf/renderer and jszip will be split automatically
        // via React.lazy dynamic imports — do NOT include them here
      },
    },
  },
},
```

**Important:** Do NOT put `@react-pdf/renderer` or `jszip` in `manualChunks`. Let `React.lazy` dynamic imports handle those — `manualChunks` is for synchronously imported vendor code only. Mixing both causes the Vite issue #17653 where lazy loading breaks.

**Confidence:** HIGH — standard Vite pattern, Vite 7 fully supports this

### No Additional npm Packages Needed for Area 2

The optimization is purely configuration and import pattern changes:
1. `rollup-plugin-visualizer` (dev-only, for analysis)
2. Convert heavy-import views to `React.lazy()` (code change, no new package)
3. Add `manualChunks` to `vite.config.ts` (config change, no new package)

---

## Area 3: sherpa-rs Dependency Health Evaluation

### Finding: sherpa-rs is Acceptable to Pin, Not Replace

**Codebase currently uses:** `sherpa-rs = { version = "0.6.8", features = ["download-binaries"] }`

**sherpa-rs status (as of March 2026):**
- Maintainer: thewh1teagle (single maintainer)
- Latest published version: 0.6.8 (October 2025)
- sherpa-onnx it wraps: v1.12.9 (as of v0.6.8 release notes)
- Open issues: present, issues going unanswered for 4-6 months in some cases
- Last significant release: v0.6.8 (Oct 5, 2025) — no new version since October

**Upstream sherpa-onnx status (k2-fsa/sherpa-onnx):**
- Extremely active: v1.12.28 released Feb 28, 2026 (releases every 1-2 weeks)
- Adding Rust API surface directly (v1.12.27 added VAD + FireRedASR Rust API, v1.12.26 added more Rust APIs)
- This means sherpa-onnx is building native Rust APIs that do NOT require the sherpa-rs community wrapper

**Risk assessment:** sherpa-rs v0.6.8 wraps sherpa-onnx v1.12.9 (5 months stale). The upstream has released 19 versions since then. For v1.1, the wrapped version is sufficient — Parakeet TDT and Silero VAD are stable APIs that haven't changed.

### Recommended Action: Pin and Document, Not Replace

For v1.1:
1. Pin to exact version `sherpa-rs = "=0.6.8"` (already the effective version, make it explicit)
2. Document the escape hatch in code comments
3. No code changes to the transcription pipeline — it works

### Escape Hatch: sherpa-onnx Native Rust API

**Version:** sherpa-onnx v1.12.27+ (Feb 2026)
**Status:** k2-fsa is adding official Rust APIs directly to the sherpa-onnx repo. As of v1.12.27, it includes VAD and FireRedASR CTC bindings. Parakeet TDT (transducer) Rust bindings are not yet confirmed in these releases.

The escape hatch is: if sherpa-rs becomes unable to compile on a future platform (e.g., new macOS, new ONNX Runtime), the transducer FFI interface is stable and the C API can be called directly via `unsafe` Rust FFI blocks. The codebase's use of `sherpa-rs` is isolated to `src-tauri/src/transcription/worker.rs` — the FFI surface is small.

**No new Rust crates needed for v1.1.** The evaluation conclusion is: current version is safe to ship, document the upgrade path in the codebase.

### chobits-sherpa-rs (fork)

A fork exists at `chobits-sherpa-rs` that releases "new versions early." This is LOW confidence as a production dependency — it is not the canonical fork and may diverge. Avoid adding it unless sherpa-rs itself stops compiling.

---

## Summary of Net-New Dependencies for v1.1

| Package | Type | Version | Purpose | Add To |
|---------|------|---------|---------|--------|
| `rollup-plugin-visualizer` | npm devDep | 7.0.0 | Bundle composition analysis | `package.json` devDependencies |

**That is the only new package.** Everything else is configuration changes, import pattern changes, and documentation.

### What NOT to Add

| Do NOT Add | Why |
|------------|-----|
| `ollama-rs` Rust crate | codebase already uses reqwest directly and it's simpler; ollama-rs adds a dependency with less control over streaming behavior |
| `vite-bundle-visualizer` npm | wrapper of rollup-plugin-visualizer that targets Vite 4, not actively maintained for Vite 7; use rollup-plugin-visualizer directly |
| `vite-bundle-analyzer` npm | alternative to rollup-plugin-visualizer; fine but rollup-plugin-visualizer is more widely used and just released v7.0.0 |
| Any new Rust FFI crate for ASR | sherpa-rs 0.6.8 still works; no justification to rewrite FFI in v1.1 |
| `react-query` / `tanstack-query` | solving a different problem; v1.1 does not add server state complexity |

---

## Recommended Stack Additions (Condensed)

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `rollup-plugin-visualizer` | 7.0.0 | Bundle treemap visualization | During audit only; gate behind `ANALYZE=true` env var |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `rollup-plugin-visualizer` | Identify large initial-bundle contributors | Run `ANALYZE=true npm run build` once to establish baseline before and after optimization |
| `std::time::Instant` (stdlib) | Ollama model benchmark timing | In a Rust test file; no new crate; measures wall-clock TTFT and total generation time |

---

## Version Compatibility Notes

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `rollup-plugin-visualizer` 7.0.0 | Vite 7.x, Node 22+ | Requires Node 22 per its package.json; works as last entry in `plugins[]` |
| `React.lazy` / `Suspense` | React 19.x (already installed) | No version change needed; built into React |
| `vite manualChunks` | Vite 7.0.4 (already installed) | Standard Rollup option exposed through Vite build config |
| `sherpa-rs` 0.6.8 (pinned) | sherpa-onnx 1.12.9, current platforms | Pin exact version; do not allow SemVer minor bumps that could pull in incompatible sherpa-onnx binaries |

---

## Integration Points (Where Code Changes Are Required)

### 1. vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// Import visualizer only when ANALYZE env var is set
const { visualizer } = process.env.ANALYZE
  ? await import('rollup-plugin-visualizer')
  : { visualizer: () => null };

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss(), visualizer({ open: true, gzipSize: true })].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
  // ... rest of config unchanged
});
```

### 2. src/App.tsx (route-level lazy loading)

```typescript
import React, { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';

// Light routes — keep static (they are always needed at startup)
import { RecordView } from './views/RecordView';
import { WidgetView } from './views/WidgetView';

// Heavy routes — lazy load (import only when route is visited)
const SetupView = lazy(() => import('./views/SetupView'));
const MeetingCompleteView = lazy(() => import('./views/MeetingCompleteView'));
const LibraryView = lazy(() => import('./views/LibraryView'));
const SettingsView = lazy(() => import('./views/SettingsView'));

export function App() {
  return (
    <HashRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/widget" element={<WidgetView />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/record" replace />} />
            <Route path="/record" element={<RecordView />} />
            <Route path="/setup" element={<SetupView />} />
            <Route path="/meeting-complete" element={<MeetingCompleteView />} />
            <Route path="/library" element={<LibraryView />} />
            <Route path="/settings" element={<SettingsView />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
```

Note: `RecordView` is the landing route (user navigates to `/record` on startup). Keep it static. `WidgetView` is the floating widget window — also keep static. The remaining routes can be lazy-loaded.

### 3. src-tauri/Cargo.toml (sherpa-rs version pinning)

```toml
# Pin to exact version to prevent surprise sherpa-onnx binary updates
# Escape hatch: sherpa-onnx v1.12.27+ has growing native Rust API if sherpa-rs stops compiling
# See: https://github.com/thewh1teagle/sherpa-rs/releases
sherpa-rs = { version = "=0.6.8", features = ["download-binaries"] }
```

---

## Sources

- [Ollama API docs — /api/tags](https://docs.ollama.com/api/tags) — response structure verified (HIGH confidence)
- [Ollama API — GitHub docs/api.md](https://github.com/ollama/ollama/blob/main/docs/api.md) — endpoint list verified (HIGH confidence)
- [Ollama context length docs](https://docs.ollama.com/context-length) — num_ctx default of 2048 confirmed (HIGH confidence)
- [phi4-mini Ollama library page](https://ollama.com/library/phi4-mini) — 128K context, 3.8B params (HIGH confidence)
- [rollup-plugin-visualizer GitHub](https://github.com/btd/rollup-plugin-visualizer) — v7.0.0, Node 22+, 302K users (HIGH confidence)
- [Vite code splitting with React.lazy — mykolaaleksandrov.dev 2025](http://www.mykolaaleksandrov.dev/posts/2025/10/react-lazy-suspense-vite-manualchunks/) — manualChunks + React.lazy patterns (MEDIUM confidence)
- [Vite issue #17653 — manualChunks breaks React.lazy](https://github.com/vitejs/vite/issues/17653) — confirmed: do not put lazy-imported modules in manualChunks (HIGH confidence)
- [@react-pdf/renderer bundle size ~450 KB](https://bundlephobia.com/package/@react-pdf/renderer) — confirmed large initial-bundle cost (MEDIUM confidence)
- [sherpa-rs releases](https://github.com/thewh1teagle/sherpa-rs/releases) — v0.6.8 from Oct 2025, wraps sherpa-onnx 1.12.9 (HIGH confidence)
- [sherpa-onnx releases](https://github.com/k2-fsa/sherpa-onnx/releases) — v1.12.28 Feb 28 2026, very active upstream (HIGH confidence)
- [sherpa-onnx v1.12.27 release notes](https://github.com/k2-fsa/sherpa-onnx/releases) — native Rust API expanding (HIGH confidence)
- openNotes v1.0 codebase — `src-tauri/src/llm/mod.rs`, `src-tauri/src/commands.rs`, `src/App.tsx`, `package.json`, `vite.config.ts` (direct inspection, HIGH confidence)

---
*Stack research for: openNotes v1.1 — LLM model selection, bundle optimization, sherpa-rs risk*
*Researched: 2026-03-02*
