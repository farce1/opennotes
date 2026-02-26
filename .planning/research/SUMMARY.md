# Project Research Summary

**Project:** openNotes
**Domain:** Local-first desktop meeting transcription and summarization app
**Researched:** 2026-02-26
**Confidence:** MEDIUM-HIGH

## Executive Summary

openNotes is a local-first desktop application that captures meeting audio (both microphone and system/remote participant audio), transcribes it using an on-device NVIDIA Parakeet TDT model via sherpa-onnx, and generates structured meeting notes (summary, key points, decisions, action items) using a local LLM via Ollama. The recommended approach is a Tauri 2 desktop app with a Rust backend handling the entire audio-to-text pipeline and a React/TypeScript frontend for display. This architecture keeps the binary small (~15-25 MB), runs entirely offline, and differentiates openNotes from every major competitor (Otter, Fireflies, Granola, Krisp) which rely on cloud processing. The closest comparable project is Meetily (also Tauri + Parakeet, open source), which is rough around the edges at v0.2.1 -- openNotes can win on polish and completeness.

The most critical architectural decision is the ASR integration pattern. Parakeet TDT is an offline model, not a streaming model. True word-by-word streaming is impossible. The correct approach is VAD-segmented offline inference: Silero VAD detects speech segments, completed segments are transcribed by Parakeet in sub-second bursts, and results appear after each phrase with 1-3 second latency. This is how SuperWhisper and similar local transcription tools work. Getting this wrong forces a full ASR pipeline rewrite, so it must be correct from day one.

The primary risks are: (1) platform-specific system audio capture is the hardest feature -- each OS uses a different API with different quirks (WASAPI silence gaps on Windows, ScreenCaptureKit entitlements on macOS, PipeWire/PulseAudio fragmentation on Linux); (2) macOS code signing and notarization must be solved early because it breaks silently in distribution builds; (3) Ollama's default context window silently truncates long transcripts, producing summaries that miss the first half of meetings; and (4) cpal audio callbacks are real-time threads where any blocking operation (mutex, allocation, logging) causes silent audio drops. All four risks have known mitigations documented in the pitfalls research.

## Key Findings

### Recommended Stack

The stack centers on Tauri 2.10.x (Rust backend + WebView frontend) for a ~15 MB binary versus Electron's ~150 MB. Audio capture uses cpal 0.17.x with platform-specific backends, ringbuf for lock-free inter-thread audio transfer, and rubato for high-quality resampling to 16kHz. ASR runs through sherpa-rs (community Rust bindings to sherpa-onnx) with Parakeet TDT v2 (6.05% WER, English, CC-BY-4.0) and Silero VAD. Summarization uses Ollama via ollama-rs with cloud API fallback via reqwest. Storage is rusqlite with bundled SQLite and FTS5. Frontend is React 19 + TypeScript 5 + Vite 6 + Tailwind CSS 4 + Zustand.

**Core technologies:**
- **Tauri 2.10.x**: Desktop framework -- ~10 MB binary, native Rust backend, strong security sandbox
- **cpal 0.17.x**: Audio capture -- CoreAudio loopback (macOS 14.6+), WASAPI loopback (Windows), PulseAudio/PipeWire (Linux)
- **sherpa-onnx via sherpa-rs**: ASR runtime -- runs Parakeet TDT and Silero VAD offline with INT8/CoreML/CUDA backends
- **Parakeet TDT v2 (INT8)**: ASR model -- 6.05% WER, ~640 MB download, offline transducer (not streaming)
- **Ollama + ollama-rs**: Local LLM summarization -- zero-config for users, OpenAI-compatible API
- **rusqlite + FTS5**: Storage -- single-file SQLite DB, full-text search across all transcripts
- **React 19 + Zustand + Tailwind 4**: Frontend -- mature ecosystem, minimal boilerplate, fast builds

**Version dependencies to watch:**
- cpal 0.17 CoreAudio loopback requires macOS 14.6+ (older macOS needs screencapturekit-rs fallback)
- sherpa-rs 0.6.x is community-maintained; may need thin FFI bindings if it lags behind sherpa-onnx releases
- Vite 6.x (not 7.x) for validated Tauri compatibility

### Expected Features

**Must have (table stakes):**
- One-click recording start/stop with global keyboard shortcut and system tray
- System audio + microphone capture (the hardest table-stakes feature)
- Real-time transcript display (VAD-segmented, 1-3 second latency per phrase)
- Post-meeting structured summary (overview, key points, decisions, action items)
- First-run model download flow (~640 MB with hardware detection)
- Notes library with full-text search (SQLite FTS5)
- Export to Markdown and clipboard
- Settings UI (audio devices, LLM config, model management)
- Graceful LLM fallback (raw transcript if no LLM configured)

**Should have (competitive differentiators):**
- Fully local processing -- the primary differentiator vs. all major competitors
- Zero cost, no subscription -- MIT licensed, free forever
- No meeting bot / invisible recording -- inherent in system audio capture architecture
- Open source and auditable -- unique among meeting note tools
- Offline-capable -- works without internet

**Defer to v0.2.0+:**
- Speaker diarization (HIGH complexity, requires architecture change from mixed to separate audio channels)
- Audio recording and playback with timestamp linking
- Custom summary templates (Granola-style "Recipes")
- AI chat with transcript ("ask questions about this meeting")
- Calendar awareness (show upcoming meetings, not auto-record)
- Multilingual support (Parakeet v3, 25 languages, higher WER)

**Anti-features (do not build):**
- Cloud sync (conflicts with local-first promise)
- Meeting bot (negates invisible recording differentiator)
- Video recording (massive storage, outside core value)
- Real-time collaborative editing (personal tool, not team workspace)
- CRM integrations (unsustainable maintenance for open-source project)

### Architecture Approach

The architecture is a three-thread pipeline: (1) audio capture thread running cpal callbacks that push samples into a lock-free SPSC ring buffer, (2) ASR inference thread consuming from the ring buffer through VAD then Parakeet offline inference, and (3) Tauri async runtime handling IPC, storage, and LLM communication. Audio data never crosses the IPC boundary -- only text results (TranscriptSegment structs) are sent to the frontend via Tauri Channels. Platform-specific system audio capture is isolated behind a `SystemAudioCapture` trait with conditional compilation per OS. LLM summarization uses a `LlmProvider` trait abstraction for swapping Ollama/cloud without pipeline changes.

**Major components:**
1. **Audio Pipeline** (cpal + ringbuf + rubato) -- capture mic + system audio, resample to 16kHz mono, mix, feed to ASR via lock-free ring buffer
2. **ASR Engine** (sherpa-onnx + Silero VAD) -- VAD-segmented offline inference producing TranscriptSegments
3. **LLM Service** (ollama-rs / reqwest) -- trait-based provider for structured meeting note generation
4. **Storage Layer** (rusqlite + FTS5) -- persist meetings, transcripts, notes; full-text search
5. **Model Manager** -- hardware detection, model download with progress, resume support
6. **Frontend** (React + Zustand) -- recording controls, live transcript, notes library, settings
7. **System Tray + Global Hotkey** -- background presence, recording indicator

### Critical Pitfalls

1. **Parakeet TDT is offline, not streaming** -- Use VAD+segment pattern (Silero VAD detects speech end, then Parakeet transcribes the completed segment). Attempting true streaming causes latency that grows with meeting duration and eventual OOM. This must be correct from Phase 1.

2. **WASAPI loopback silence gaps (Windows)** -- WASAPI stops delivering data when system audio is silent, breaking time sync with microphone. Inject synthetic silence frames when no data arrives within one buffer period. Must handle in Phase 1.

3. **macOS ScreenCaptureKit entitlements** -- Works in dev builds but breaks in signed/notarized distribution. Requires specific entitlements (JIT, audio-input, screen-capture) and correct Info.plist usage descriptions. Set up code signing CI in Phase 1, not at the end.

4. **Ollama context window truncation** -- Default 2048-4096 token context silently drops the beginning of long transcripts. Always set `num_ctx` to 16384+, implement token counting pre-check, and use hierarchical summarization for long meetings.

5. **cpal audio callback blocking** -- Any mutex, allocation, or logging in the real-time audio callback causes silent audio drops. The callback must only copy samples into the lock-free ring buffer. All processing happens on separate threads.

6. **Audio format mismatch across platforms** -- Each platform delivers different sample rates and formats. Use rubato for proper sinc-interpolation resampling and build an explicit format normalization layer. Test WER against Parakeet benchmarks to catch degradation.

## Implications for Roadmap

Based on research, the following phase structure is recommended. The ordering is driven by hard technical dependencies (audio must exist before ASR, ASR before summarization) and risk-front-loading (system audio capture and ASR architecture are the highest-risk items).

### Phase 1: Project Foundation and App Shell
**Rationale:** Every subsequent phase depends on the Tauri scaffold, SQLite storage, and basic UI navigation. Code signing and entitlements must be configured here to avoid the macOS distribution pitfall.
**Delivers:** Running Tauri app with React frontend, SQLite database with migrations, basic navigation shell (recording view, notes library, settings), system tray integration, and macOS code signing pipeline.
**Addresses:** Settings UI scaffold, system tray with recording indicator, storage foundation
**Avoids:** macOS entitlements pitfall (Pitfall 3), SQLite concurrent access issues (use WAL + connection pool from the start)

### Phase 2: Audio Capture Pipeline
**Rationale:** Audio capture is the highest-risk component and the foundation everything else depends on. Start with macOS (best Rust bindings via cpal 0.17 CoreAudio loopback), then Windows (WASAPI loopback), then Linux. This phase must get the lock-free ring buffer architecture right.
**Delivers:** Working mic + system audio capture on at least one platform, resampled to 16kHz mono, flowing through ring buffer to a test consumer. Audio format normalization layer.
**Addresses:** System audio + microphone capture (the hardest table-stakes feature)
**Avoids:** cpal callback blocking (Pitfall 5), WASAPI silence gaps (Pitfall 2), audio format mismatch (Pitfall 6)

### Phase 3: ASR Integration and Live Transcription
**Rationale:** Depends on Phase 2 audio pipeline. The VAD+offline-segment pattern must be implemented correctly here. Model download flow gates the entire app -- users cannot do anything without the ASR model.
**Delivers:** End-to-end audio-to-text pipeline. Silero VAD segments speech, Parakeet transcribes completed segments, results stream to frontend via Tauri Channel. First-run model download with hardware detection and progress.
**Addresses:** Real-time transcription, live transcript display, first-run model download, one-click recording
**Avoids:** Parakeet streaming misconception (Pitfall 1), ONNX session lifecycle issues (create once, reuse)

### Phase 4: LLM Summarization and Notes
**Rationale:** Depends on Phase 3 transcript data. The summarization pipeline must handle context window limits from the start. This phase delivers the core user value: structured meeting notes.
**Delivers:** Post-meeting structured summaries (overview, key points, decisions, action items) via Ollama or cloud API. Notes library with FTS5 search. Export to Markdown and clipboard. Graceful fallback to raw transcript.
**Addresses:** Post-meeting summary, action item extraction, notes library with search, export, LLM fallback
**Avoids:** Ollama context truncation (Pitfall 4) -- implement token counting and hierarchical summarization

### Phase 5: Cross-Platform Hardening and Polish
**Rationale:** Core pipeline is complete on the primary platform. Now extend to remaining platforms and polish the UX. This is where Windows WASAPI silence handling and Linux PipeWire/PulseAudio compatibility get battle-tested.
**Delivers:** Working audio capture on all three platforms. Onboarding flow with pre-permission explanations. Auto-update via tauri-plugin-updater. Error handling and edge case coverage. Performance tuning for 2+ hour meetings.
**Addresses:** Cross-platform support, first-run onboarding, global shortcut customization
**Avoids:** Permission prompt confusion (UX pitfall), unbounded memory growth on long meetings

### Phase 6: Post-MVP Features (v0.2.0+)
**Rationale:** These features require validated core pipeline and user feedback to prioritize correctly. Speaker diarization requires an architecture change (mixed stream to separate channels).
**Delivers:** Speaker diarization, audio playback, custom summary templates, AI chat with transcript
**Addresses:** The most-requested features after MVP launch

### Phase Ordering Rationale

- **Foundation before pipeline:** Tauri scaffold, storage, and code signing must exist before any feature work. Discovered that macOS entitlements are a silent distribution-breaker -- must be solved in Phase 1.
- **Audio before ASR:** ASR has no input without a working audio pipeline. Audio capture is the highest-risk component (platform-specific APIs, real-time threading constraints). Front-loading risk.
- **ASR before summarization:** Summarization needs transcript text. The VAD+segment architecture decision affects everything downstream.
- **Primary platform before cross-platform:** Build and validate the full pipeline on macOS first (best Rust audio bindings). Add Windows and Linux in Phase 5 to avoid spreading effort across three platforms before the core works.
- **MVP before post-MVP features:** Speaker diarization requires a significant architecture change (separate audio channels). Do not attempt it until the mixed-stream MVP is validated.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Audio Capture):** Platform-specific system audio APIs are complex. ScreenCaptureKit on macOS, WASAPI loopback on Windows, and PipeWire on Linux each have unique permission models, format requirements, and edge cases. The cpal 0.17 CoreAudio loopback is relatively new. Phase research should verify exact API usage patterns and permission flows.
- **Phase 3 (ASR Integration):** sherpa-rs is community-maintained (not official). The exact integration pattern (sherpa-rs vs. direct FFI to sherpa-onnx C API) should be validated. Model download from HuggingFace needs HTTP Range header support verification.
- **Phase 6 (Speaker Diarization):** The architecture change from mixed to separate audio channels is significant. pyannote-audio integration in Rust is not well-documented. Needs dedicated research.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Tauri 2 project setup, SQLite/rusqlite, React scaffolding -- all extremely well-documented with official guides.
- **Phase 4 (LLM Summarization):** Ollama HTTP API and prompt engineering are well-documented. The trait-based provider pattern is standard Rust.
- **Phase 5 (Polish):** Tauri plugins (updater, global-shortcut, notification) have official documentation and examples.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Core technologies (Tauri, cpal, rusqlite, React) verified via official sources. sherpa-rs is MEDIUM confidence (community crate, active but not official). Ollama-rs is MEDIUM (community crate). |
| Features | HIGH | Competitive landscape well-documented via official product pages and multiple review sources. MVP feature set is clear and validated against 8+ competitors. |
| Architecture | MEDIUM-HIGH | Pipeline pattern verified against reference implementations (Vibe, SuperWhisper model). Tauri IPC patterns from official docs. Audio threading patterns from Rust audio community consensus. PipeWire integration is lowest confidence (single blog post). |
| Pitfalls | HIGH | All critical pitfalls verified via official documentation, GitHub issues with reproduction steps, or Microsoft/Apple developer docs. Recovery strategies are realistic. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **sherpa-rs stability:** Community-maintained bindings may lag behind sherpa-onnx releases. During Phase 3 planning, evaluate whether to use sherpa-rs or write thin FFI bindings directly. Check for breaking changes between sherpa-rs 0.6.x and sherpa-onnx 1.12.x.
- **macOS < 14.6 fallback:** cpal 0.17 CoreAudio loopback requires macOS 14.6+. For older macOS versions, screencapturekit-rs is the fallback but adds complexity. Decide during Phase 2 whether to support macOS 12.3-14.5 or set 14.6 as minimum.
- **Linux audio fragmentation:** PipeWire vs. PulseAudio testing coverage is sparse. Need to test on multiple distros during Phase 5. Consider whether PipeWire native API is preferable to PulseAudio compatibility layer.
- **Ollama model recommendation:** Which specific Ollama model to recommend for summarization (Llama 3.2 8B, Mistral 7B, Qwen 2.5, Phi-4) needs benchmarking against meeting transcript quality. Not yet researched.
- **rusqlite thread safety:** rusqlite Connection is not Send. Need to confirm the connection pool pattern (r2d2-sqlite or dedicated DB thread) during Phase 1 implementation.
- **Encrypted storage:** PITFALLS.md recommends SQLCipher for encrypted-at-rest storage. This conflicts with rusqlite's `bundled` feature. Evaluate whether encryption-at-rest is MVP scope or post-MVP.

## Sources

### Primary (HIGH confidence)
- [Tauri 2 Official Documentation](https://v2.tauri.app/) -- IPC, state management, project structure, plugins, code signing
- [sherpa-onnx GitHub](https://github.com/k2-fsa/sherpa-onnx) -- ASR runtime, Parakeet model support, VAD integration
- [sherpa-onnx Issue #2918](https://github.com/k2-fsa/sherpa-onnx/issues/2918) -- Parakeet TDT offline-only confirmation
- [cpal GitHub + CHANGELOG](https://github.com/RustAudio/cpal) -- Audio capture, CoreAudio loopback (v0.17), callback constraints
- [Microsoft WASAPI Loopback Documentation](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording) -- Silence gap behavior
- [Parakeet TDT v2/v3 HuggingFace](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2) -- Model specs, WER benchmarks, ONNX format
- [rusqlite GitHub](https://github.com/rusqlite/rusqlite) -- FTS5 support, bundled SQLite
- [Apple ScreenCaptureKit Documentation](https://developer.apple.com/documentation/screencapturekit/) -- System audio capture API
- [Ollama Documentation](https://docs.ollama.com/) -- Context length, API format

### Secondary (MEDIUM confidence)
- [sherpa-rs GitHub](https://github.com/thewh1teagle/sherpa-rs) -- Rust bindings, community-maintained
- [screencapturekit-rs crate](https://github.com/svtlabs/screencapturekit-rs) -- macOS fallback for older OS versions
- [Vibe (reference Tauri transcription app)](https://github.com/thewh1teagle/vibe) -- Architecture reference
- [ollama-rs crates.io](https://crates.io/crates/ollama-rs) -- Rust Ollama client
- [Meetily GitHub](https://github.com/Zackriya-Solutions/meeting-minutes) -- Closest competitor, Tauri + Parakeet
- [tauri-specta GitHub](https://github.com/specta-rs/tauri-specta) -- Type-safe IPC bindings
- Competitor product pages (Otter, Fireflies, Granola, Krisp, Fathom, tl;dv, Jamie)

### Tertiary (LOW confidence)
- [PipeWire audio capture with Rust](https://acalustra.com/playing-with-pipewire-audio-streams-and-rust.html) -- Single blog post, needs validation
- [Building Local LM Desktop Apps with Tauri](https://medium.com/@dillon.desilva/building-local-lm-desktop-applications-with-tauri-f54c628b13d9) -- Single blog post

---
*Research completed: 2026-02-26*
*Ready for roadmap: yes*
