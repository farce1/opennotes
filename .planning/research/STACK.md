# Stack Research

**Domain:** Local-first desktop meeting transcription and summarization app
**Researched:** 2026-02-26
**Confidence:** MEDIUM-HIGH (core stack verified via official sources; some niche integration points rely on community evidence)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Tauri | 2.10.x | Desktop app framework (Rust backend + webview frontend) | ~10 MB binary vs Electron's ~150 MB. Native Rust access to system APIs. Strong security sandbox. Stable v2 released Oct 2024 with active maintenance. | HIGH |
| React | 19.2.x | Frontend UI framework | Stable, massive ecosystem, best Tauri template support. React 19 adds Server Components and Actions, but for desktop the key win is maturity and library availability. | HIGH |
| TypeScript | 5.x | Frontend type safety | Non-negotiable for a project of this scope. Catches IPC contract errors at compile time. | HIGH |
| Vite | 6.4.x | Frontend build tool | Official Tauri integration. Sub-second HMR. Stick with 6.x (LTS) rather than jumping to Vite 7 -- Tauri docs are validated against 6.x. | MEDIUM |
| Rust | 1.77+ | Backend language | Required by Tauri 2. Handles audio capture, ASR inference, and LLM communication in concurrent threads with memory safety guarantees. | HIGH |
| pnpm | 10.x | Package manager | Faster installs, strict dependency resolution, disk-efficient symlinks. Tauri docs reference pnpm as first-class. | HIGH |

### Audio Capture

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| cpal | 0.17.x | Cross-platform audio I/O | The standard Rust audio library. v0.17.0 added CoreAudio loopback recording for macOS 14.6+ (system audio capture). WASAPI loopback on Windows works via output-device-as-input pattern. PulseAudio/PipeWire monitor sources on Linux. | HIGH |
| rubato | 1.0.x | Sample rate conversion | Needed to resample from device native rate (44.1/48 kHz) to Parakeet's required 16 kHz. Pure Rust, SIMD-optimized (AVX/SSE3/Neon), real-time safe (no allocations during processing). v1.0 is stable API. | HIGH |
| ringbuf | 0.4.x | Lock-free SPSC ring buffer | Passes audio between capture thread and ASR thread without locks. Zero-copy, no-std capable. Proven pattern for audio pipelines. | HIGH |

### ASR (Speech-to-Text)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| sherpa-rs | 0.6.x | Rust bindings to sherpa-onnx | Community-maintained bindings to sherpa-onnx. Supports speech-to-text, VAD, speaker diarization. Wraps sherpa-onnx C API for Rust. Feature flags for CUDA/DirectML. | MEDIUM |
| sherpa-onnx | 1.12.x | ASR runtime engine | Runs ONNX models (Parakeet, Silero VAD) without internet. Supports CPU (INT8), CUDA (GPU), Core ML (Apple Silicon). Active development with frequent releases. | HIGH |
| Parakeet-TDT-0.6B-v2 (INT8) | v2 | English ASR model | 6.05% WER, CC-BY-4.0 license. ~640 MB download. INT8 quantized for CPU inference. **CRITICAL: This is an OFFLINE model, not streaming.** Must use VAD-segmented approach. | HIGH |
| Parakeet-TDT-0.6B-v3 (INT8) | v3 | Multilingual ASR model | 25 European languages, 9.7% WER. Same architecture as v2. Offer as optional download for multilingual users. | HIGH |
| Silero VAD | v5 | Voice Activity Detection | Bundled with sherpa-onnx. Detects speech segments in audio stream. Essential for the VAD+offline-model pseudo-streaming pattern. MIT licensed, ~2 MB model. | HIGH |

**CRITICAL ARCHITECTURE NOTE: Parakeet TDT is NOT a streaming model.** It cannot do true real-time token-by-token streaming. The approach is:
1. Audio flows continuously into a buffer
2. Silero VAD detects speech segments (utterances)
3. Each completed utterance is sent to Parakeet for offline transcription
4. Results appear after each utterance ends (typically 1-5 second delay after speaker pauses)

This is "simulated streaming" / "VAD-segmented offline ASR" -- not true streaming. The UX shows text appearing after each phrase, not word-by-word. This is the standard pattern for using high-accuracy offline models in near-real-time applications.

### LLM Summarization

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| ollama-rs | 0.3.x | Rust client for Ollama API | Async, streaming, tool calling support. Wraps Ollama's REST API. Most popular Rust Ollama crate. | MEDIUM |
| Ollama | 0.x (latest) | Local LLM runtime | De facto standard for local LLM hosting. OpenAI-compatible REST API. Runs Llama 3.2, Mistral, Qwen, Phi models. Zero config for users. | HIGH |
| reqwest | 0.13.x | HTTP client | For cloud LLM fallback (Claude, GPT, OpenAI-compatible APIs). Also used by ollama-rs internally. | HIGH |

### Database & Storage

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| rusqlite | 0.38.x | SQLite wrapper for Rust | Ergonomic, bundled SQLite (compiles into binary), FTS5 support via feature flag. Zero external dependencies when bundled. Direct Rust access -- no need for Tauri SQL plugin overhead. | HIGH |
| SQLite (bundled) | 3.45+ | Embedded database | Single-file DB at `~/.opennotes/data.db`. FTS5 for full-text search on transcripts. WAL mode for concurrent reads during recording. | HIGH |

### Frontend Libraries

| Library | Version | Purpose | Why Recommended | Confidence |
|---------|---------|---------|-----------------|------------|
| Tailwind CSS | 4.x | Utility-first CSS | v4 uses Rust-powered engine (5x faster builds). CSS-first config (no tailwind.config.js). Production-ready since Jan 2025. | HIGH |
| Zustand | 5.x | Global state management | ~3 KB, minimal API, perfect for desktop app state (recording status, settings, current transcript). No boilerplate. | MEDIUM |
| tauri-specta | 2.x | Type-safe Tauri IPC bindings | Auto-generates TypeScript types from Rust command signatures. Eliminates IPC contract drift. Catches type errors at compile time. | MEDIUM |
| @tauri-apps/plugin-store | 2.x | Persistent key-value store | App preferences (audio device selection, model paths, LLM config). Replaces electron-store pattern. | HIGH |
| @tauri-apps/plugin-global-shortcut | 2.x | Global keyboard shortcuts | Start/stop recording from any app. System-wide hotkey registration. | HIGH |

### Tauri Plugins (Rust side)

| Plugin | Version | Purpose | Confidence |
|--------|---------|---------|------------|
| tauri-plugin-global-shortcut | 2.x | Global hotkeys | HIGH |
| tauri-plugin-notification | 2.x | System notifications (recording start/stop, transcription complete) | HIGH |
| tauri-plugin-store | 2.x | Persistent settings storage | HIGH |
| tauri-plugin-updater | 2.x | Auto-update mechanism for production | HIGH |
| tauri-plugin-autostart | 2.x | Optional launch-at-login | MEDIUM |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| cargo-tauri | Tauri CLI for dev/build | `cargo install tauri-cli` or `pnpm add -D @tauri-apps/cli` |
| ESLint + Prettier | Frontend linting/formatting | Standard React/TypeScript configuration |
| rust-analyzer | Rust IDE support | VS Code extension for Rust development |
| cargo-watch | Auto-rebuild on Rust changes | `cargo install cargo-watch` for faster dev loop |

## Installation

```bash
# Prerequisites
# - Rust 1.77+ (rustup.rs)
# - Node.js 20+ LTS
# - pnpm 10.x

# Create Tauri project
pnpm create tauri-app opennotes --template react-ts

# Frontend dependencies
pnpm install zustand @tauri-apps/plugin-store @tauri-apps/plugin-global-shortcut

# Frontend dev dependencies
pnpm install -D tailwindcss @tailwindcss/vite @tauri-apps/cli

# Rust dependencies (in src-tauri/Cargo.toml)
# [dependencies]
# tauri = { version = "2.10", features = ["tray-icon"] }
# tauri-plugin-global-shortcut = "2"
# tauri-plugin-notification = "2"
# tauri-plugin-store = "2"
# tauri-plugin-updater = "2"
# cpal = "0.17"
# rubato = "1.0"
# ringbuf = "0.4"
# sherpa-rs = { version = "0.6", features = ["tts"] }
# rusqlite = { version = "0.38", features = ["bundled", "fts5"] }
# ollama-rs = { version = "0.3", features = ["stream"] }
# reqwest = { version = "0.13", features = ["json"] }
# serde = { version = "1", features = ["derive"] }
# serde_json = "1"
# tokio = { version = "1", features = ["full"] }
# tauri-specta = { version = "2", features = ["typescript"] }
# specta = "2"
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| cpal 0.17 (loopback) | screencapturekit-rs crate | If targeting macOS < 14.6 where CoreAudio loopback is unavailable. ScreenCaptureKit works on macOS 12.3+ but has higher complexity and permission requirements. |
| cpal 0.17 (loopback) | ruhear crate | Never for this project. ruhear wraps cpal+screencapturekit but adds abstraction without benefit. Use cpal directly for control over audio format/rate. |
| sherpa-rs (community bindings) | Direct sherpa-onnx C FFI | If sherpa-rs lags behind sherpa-onnx releases or missing features. Writing raw FFI is more work but gives full control. |
| Parakeet TDT (offline) | Zipformer/Paraformer (streaming) | If true word-by-word streaming is required. These models have higher WER but support real streaming. Parakeet's accuracy advantage (6% vs ~10% WER) outweighs streaming for meeting notes. |
| rusqlite (direct) | tauri-plugin-sql (sqlx-based) | Never for this project. The plugin adds JS-to-Rust overhead and uses sqlx (async ORM). rusqlite is simpler, synchronous, and gives direct Rust access -- better for a backend that manages its own DB. |
| ollama-rs | reqwest (raw HTTP) | If ollama-rs becomes unmaintained. Ollama's REST API is simple enough to call directly with reqwest. But ollama-rs handles streaming SSE, model management, and typing. |
| Zustand | Jotai | If the app grows to need fine-grained atom-level reactivity. Zustand's single-store pattern is simpler for this scope. |
| Vite 6.x | Vite 7.x | Not yet. Vite 7 exists but Tauri docs are validated against Vite 5/6. Wait for official Tauri Vite 7 guidance. |
| Tailwind CSS 4 | Plain CSS / CSS Modules | Only if the team strongly prefers non-utility CSS. Tailwind 4's Rust engine is fast enough for desktop dev. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Electron | 150+ MB binary, excessive memory for a utility app, no native Rust audio access | Tauri 2.x |
| Whisper (OpenAI) | Higher WER (8.81% vs 6.05%), slower inference, larger model, less optimized for sherpa-onnx streaming patterns | Parakeet TDT v2/v3 |
| whisper.cpp / whisper-rs | Whisper-specific, less accurate than Parakeet, and sherpa-onnx provides a unified runtime for multiple model architectures | sherpa-onnx via sherpa-rs |
| WebRTC / browser audio APIs | Cannot capture system/desktop audio from webview. Must use native OS APIs. | cpal + OS-specific backends |
| tauri-plugin-sql | Adds unnecessary JS bridge layer. Uses sqlx (async, heavier). This app's DB access is entirely backend-side. | rusqlite (direct Rust) |
| Redux / Redux Toolkit | Massive boilerplate for a desktop app with simple state needs. 10x the code of Zustand for the same result. | Zustand |
| Recoil | Deprecated / unmaintained by Meta. | Zustand or Jotai |
| node-record-lpcm16 / node audio libs | JS audio capture libraries cannot access system audio. All audio must go through native Rust. | cpal (Rust) |
| electron-store | Electron-only. | @tauri-apps/plugin-store |

## Stack Patterns by Variant

**If targeting macOS only (initial development):**
- cpal 0.17 CoreAudio backend handles both mic input and system audio loopback (macOS 14.6+)
- For macOS 12.3-14.5: fall back to screencapturekit-rs crate for system audio
- Core ML acceleration for Parakeet via sherpa-onnx (Apple Silicon optimization)

**If targeting Windows:**
- cpal WASAPI backend with loopback flag for system audio capture
- ONNX INT8 inference on CPU, or CUDA via sherpa-rs CUDA feature flag for NVIDIA GPUs
- WASAPI shared mode only (exclusive mode does not support loopback)

**If targeting Linux:**
- cpal ALSA backend for mic, PulseAudio/PipeWire monitor source for system audio
- System audio capture on Linux requires user to select a "Monitor" source device
- ONNX INT8 CPU inference (most common), CUDA optional

**If Ollama is not installed (LLM fallback):**
- Show setup guide to install Ollama + recommended model (e.g., Llama 3.2 8B or Mistral 7B)
- Offer cloud API key input (Claude, GPT, OpenAI-compatible) as alternative
- Graceful degradation: raw transcript output if no LLM configured

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Tauri 2.10.x | Rust 1.77+, Node 18+ | Requires Rust 1.77.2 minimum for plugins |
| cpal 0.17.x | macOS 14.6+ (loopback), Windows 10 1703+ (event loopback), Linux (ALSA/PulseAudio/PipeWire) | macOS loopback requires 14.6+; older macOS needs screencapturekit fallback |
| sherpa-rs 0.6.x | sherpa-onnx ~1.12.x | Binds to specific sherpa-onnx version; check Cargo.toml for exact pinning |
| Parakeet TDT v2 INT8 | sherpa-onnx 1.10+ | Model files: encoder.onnx (~622 MB), decoder.onnx, joiner.onnx, tokens.txt |
| Parakeet TDT v3 INT8 | sherpa-onnx 1.12+ | Newer model, needs recent sherpa-onnx for multilingual support |
| rusqlite 0.38.x | SQLite 3.45+ (bundled) | Use `bundled` feature to compile SQLite into binary |
| Tailwind CSS 4.x | Vite 6.x via @tailwindcss/vite plugin | CSS-first config, no tailwind.config.js needed |
| React 19.2.x | Vite 6.x, TypeScript 5.x | Stable, production-ready |
| ollama-rs 0.3.x | Ollama 0.3+ API | Check Ollama API version compatibility |
| tauri-specta 2.x | specta 2.x, Tauri 2.x | Must use matching major versions |

## Critical Implementation Notes

### Audio Pipeline Architecture
```
Mic Input (cpal) ─────────┐
                           ├─> Mixer (16-bit PCM, 16kHz mono) ──> Ring Buffer ──> VAD ──> Parakeet ASR
System Audio (cpal) ──────┘                                        (ringbuf)     (Silero)  (offline)
       │
       └─ rubato resampling if device rate != 16kHz
```

The audio pipeline runs on dedicated Rust threads. The frontend receives transcription results via Tauri IPC events (not polling).

### Model Delivery Pattern
- App binary ships at ~15-25 MB (no models included)
- First-run flow: hardware detection --> recommend model variant --> download ~640 MB model
- Models stored at `~/.opennotes/models/`
- Silero VAD model (~2 MB) can ship bundled or download with ASR model

### Sherpa-rs Integration Caveat
sherpa-rs v0.6 is community-maintained (not official sherpa-onnx). If it falls behind:
1. Check for updated forks (chobits-sherpa-rs, lxxyx-sherpa-rs)
2. Write thin FFI bindings to sherpa-onnx C API directly
3. sherpa-onnx's own Rust API is expanding (VAD added in v1.12.27) but not yet on crates.io as an official crate

## Sources

- [Tauri 2.10.2 Release](https://github.com/tauri-apps/tauri/releases) -- verified latest stable version (HIGH confidence)
- [Tauri Official Docs - Vite](https://v2.tauri.app/start/frontend/vite/) -- frontend setup reference (HIGH confidence)
- [cpal CHANGELOG v0.17.0](https://github.com/RustAudio/cpal/blob/v0.17.0/CHANGELOG.md) -- confirmed CoreAudio loopback support on macOS 14.6+ (HIGH confidence)
- [cpal PR #894 Discussion](https://github.com/RustAudio/cpal/pull/894) -- confirmed ScreenCaptureKit approach superseded by CoreAudio ProcessTap in cpal 0.17 (HIGH confidence)
- [sherpa-onnx GitHub](https://github.com/k2-fsa/sherpa-onnx) -- v1.12.27 latest, Rust API expanding (HIGH confidence)
- [sherpa-onnx Issue #2918](https://github.com/k2-fsa/sherpa-onnx/issues/2918) -- CRITICAL: Parakeet TDT is offline-only, not streaming (HIGH confidence)
- [sherpa-rs GitHub](https://github.com/thewh1teagle/sherpa-rs) -- v0.6.8, community Rust bindings (MEDIUM confidence)
- [Parakeet TDT v2 HuggingFace](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2) -- model details and ONNX conversion (HIGH confidence)
- [Parakeet TDT v3 HuggingFace](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) -- multilingual model details (HIGH confidence)
- [NeMo Transducer Models - sherpa-onnx docs](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html) -- model sizes and VAD integration (HIGH confidence)
- [Silero VAD GitHub](https://github.com/snakers4/silero-vad) -- VAD model details, MIT license (HIGH confidence)
- [ollama-rs crates.io](https://crates.io/crates/ollama-rs) -- v0.3.4, latest Rust Ollama client (MEDIUM confidence)
- [rusqlite GitHub](https://github.com/rusqlite/rusqlite) -- v0.38.0, FTS5 support confirmed (HIGH confidence)
- [Tailwind CSS v4.0 Blog](https://tailwindcss.com/blog/tailwindcss-v4) -- Rust engine, CSS-first config (HIGH confidence)
- [React 19.2 Blog](https://react.dev/blog/2025/10/01/react-19-2) -- latest stable React (HIGH confidence)
- [Vite Releases](https://vite.dev/releases) -- v6.4 LTS confirmed (HIGH confidence)
- [ringbuf lib.rs](https://lib.rs/crates/ringbuf) -- v0.4.9 latest (HIGH confidence)
- [rubato lib.rs](https://lib.rs/crates/rubato) -- v1.0.1 latest, stable API (HIGH confidence)
- [tauri-specta GitHub](https://github.com/specta-rs/tauri-specta) -- v2 for Tauri 2 type-safe IPC (MEDIUM confidence)
- [screencapturekit crate](https://lib.rs/crates/screencapturekit) -- macOS fallback option (MEDIUM confidence)
- [ruhear GitHub](https://github.com/aizcutei/ruhear) -- evaluated and rejected in favor of direct cpal (MEDIUM confidence)

---
*Stack research for: openNotes -- local-first desktop meeting transcription and summarization*
*Researched: 2026-02-26*
