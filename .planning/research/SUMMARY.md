# Project Research Summary

**Project:** openNotes v1.2 — Speaker Intelligence & Templates
**Domain:** Local-first desktop meeting recorder (Tauri 2 + React + Rust)
**Researched:** 2026-03-04
**Confidence:** HIGH

## Executive Summary

openNotes v1.2 adds four interconnected capability clusters to a fully-shipped v1.1 Tauri desktop app: a post-recording performance fix, local speaker diarization, summary templates, and an interactive speaker timeline. The product is a local-first meeting recorder where all inference runs on-device — no cloud services, no Python runtime — making it architecturally distinct from competitors (Otter, Fireflies, Granola) that rely on cloud APIs for speaker identification. This release has a clear dependency graph: the performance fix must ship first, templates are independent and can ship before diarization, and the speaker timeline is a pure frontend feature that can only be completed after diarization is working.

The recommended approach is to use the already-pinned `sherpa-rs = "=0.6.8"` crate's built-in `diarize` module (no version bump required), two ONNX model downloads (~35–40 MB total), and `ogg` + `opus` crates for audio decode. Templates should be stored as configuration in `settings.json` (not SQLite) alongside compiled-in built-ins in a new `llm/templates.rs` Rust file. The speaker timeline requires zero new npm dependencies — a custom ~80-line React SVG component is sufficient and preserves the project's hard-won 351 KB bundle size. One new SQLite migration (004) adds `speaker_segments`, `speaker_labels`, `transcripts.speaker_id`, and `summaries.template_id`.

The dominant risks are threading and coupling: diarization must run on a dedicated `std::thread` (not Tokio's pool) to avoid starving Ollama streaming, the post-recording UI freeze must be eliminated before diarization is wired into the stop sequence, and the template system must be designed to preserve `extract_title()` and `generate_summary_chunked()` behavior or both will silently break on long meetings. Every pitfall has a known prevention strategy documented in the research — this is a buildable release with manageable risk if the implementation order is followed.

## Key Findings

### Recommended Stack

The v1.1 production stack (Tauri 2, React 19, Vite 7, SQLite/sqlx 0.8, cpal, sherpa-rs =0.6.8, Ollama/reqwest, rubato 0.15, libopusenc) requires only two new Rust crates for v1.2. The `sherpa-rs` diarize module is already compiled unconditionally in the pinned version — no feature flag, no version bump. Audio decode from OGG/Opus to f32 PCM requires `ogg = "0.9"` (pure Rust container parser) and `opus = "0.3"` (safe libopus bindings), with the existing `rubato` crate handling 48 kHz → 16 kHz resampling. Zero new npm packages are needed: the speaker timeline uses custom SVG, the template editor uses a native `<textarea>`, and all styling uses existing Tailwind CSS.

**Core technologies:**
- `sherpa-rs = "=0.6.8"` diarize module: speaker segmentation + embedding — already pinned, no upgrade risk; module present unconditionally
- `ogg = "0.9"` + `opus = "0.3"`: OGG/Opus container decode to f32 PCM — the only viable pure-Rust path (Symphonia lacks Opus; ogg-opus is abandoned)
- `rubato 0.15` (existing): 48 kHz → 16 kHz resample for diarization input — reused without change
- `sqlx 0.8` (existing): migration 004 adds speaker and template tables
- Custom React SVG component: speaker timeline visualization — 0 KB bundle cost
- `settings.json` via `plugin-store` (existing): user-created summary templates stored as configuration, not meeting data

See `.planning/research/STACK.md` for complete API shapes, crate comparison tables, and the "what not to add" rationale.

### Expected Features

v1.2 adds four capability clusters on top of the working v1.1 pipeline.

**Must have (table stakes):**
- Speaker labels in transcript ("Speaker 1:", "Speaker 2:") — minimum proof that diarization works; missing this makes the feature meaningless
- Per-session speaker renaming ("Speaker 1" → "Alice") — every competitor (Fireflies, Descript, Otter, Reduct) supports inline rename; diarization is useless without it
- Non-freezing stop recording — v1.1 freeze affects every recording session; must be fixed before diarization worsens it
- Template selection before generating summary — Granola, Otter, and Fireflies all have this; users expect to choose meeting type before generating
- Re-generate summary with different template — closes the feedback loop; low implementation cost on top of existing regenerate flow
- Speaker-attributed summary prompt — inject speaker names into Ollama prompt when diarization data exists

**Should have (competitive):**
- Interactive speaker timeline — color-coded horizontal SVG bar, click-to-jump; no mainstream fully-local desktop meeting app has this
- Custom user-created templates — textarea editor for system prompt; stores in `settings.json`; power user feature
- Speaker talk-time percentage stats — derived from diarization output; low cost, high value for sales/coaching users

**Defer (v2+):**
- Cross-session speaker identification — persistent voice profiles; significant privacy implications; biometric identity system
- Transcript editor with speaker correction — Descript-style rich text editing with speaker-span awareness; enormous complexity
- Real-time diarization during recording — wrong model class for real-time streaming; not an offline Rust option in 2026
- Multiple simultaneous summaries — doubles Ollama invocations, significant DB schema change; re-generate covers 90% of the use case

See `.planning/research/FEATURES.md` for the full feature prioritization matrix, anti-features analysis, and competitor comparison table.

### Architecture Approach

v1.2 extends the existing architecture rather than replacing it. All new work integrates through established patterns: `SessionCoordinator` remains the lifecycle authority, `Channel<T>` handles all high-frequency streams (including diarization progress), `spawn_blocking` / dedicated `std::thread` handles CPU-bound inference, and all schema changes use numbered migration files. A new `src-tauri/src/diarization/` module (mirroring the existing `transcription/` structure with mod.rs, worker.rs, model.rs) encapsulates the sherpa-rs diarize API. A new `src-tauri/src/llm/templates.rs` file holds built-in templates compiled into the binary. The `MeetingCompleteView` gains `SpeakerTimeline` and `SpeakerLabel` components; `SummaryPanel` gains a template picker; state coordination between timeline and transcript uses lifted state with `highlightedMs: number | null` in `MeetingCompleteView`.

**Major components:**
1. `diarization/` Rust module — post-processing worker (std::thread), model management, Tauri command surface (diarize_meeting, get_speaker_segments, get_speaker_labels, rename_speaker, check_diarization_models_ready)
2. `llm/templates.rs` — built-in template registry compiled into binary, prompt substitution via `str::replace("{transcript}", ...)`, `SummaryTemplate` struct with `supports_chunking` flag
3. `SpeakerTimeline.tsx` — custom SVG visualization, zero dependencies, click-to-scroll via lifted `highlightedMs` state in parent
4. Migration 004 — `speaker_segments`, `speaker_labels`, `transcripts.speaker_id` (nullable), `summaries.template_id` (nullable); both ALTER TABLE additions are nullable — safe for existing rows
5. `stop_session` two-phase refactor — fast path returns `meeting_id` after transcription join; detached `tokio::spawn` background task handles 300 ms wait + FTS upsert + `session-complete` event

See `.planning/research/ARCHITECTURE.md` for full before/after architecture diagrams, component inventory, and anti-patterns to avoid.

### Critical Pitfalls

1. **UI freeze on stop** — `block_on` + `thread::sleep(300ms)` inside `spawn_blocking` in `session.rs` lines 256–276 blocks the frontend for up to 7 seconds. Fix: split `stop()` into a fast synchronous phase (return `meeting_id` immediately after transcription join) and a detached `tokio::spawn` background phase for FTS upsert and `session-complete` event emission. Must be resolved before diarization is added to the stop sequence.

2. **Diarization starves Ollama HTTP threads** — running diarization in `spawn_blocking` (Tokio pool) competes with Ollama HTTP streaming threads; summary tokens stall mid-stream. Fix: use `std::thread::spawn` for diarization inference (not `spawn_blocking`); emit `diarization-started` immediately at stop; emit `diarization-complete` when done; never block `session-complete` on diarization.

3. **ASR–diarization timestamp misalignment** — Parakeet ASR and pyannote diarization produce independent timestamps that drift 1–5 seconds at speaker boundaries. Fix: use midpoint-overlap matching (not nearest-start) with a ±500 ms tolerance window; store raw `speaker_turns` in a separate table so alignment can be re-run if the algorithm improves.

4. **Templates break `extract_title()` and chunked summarization** — `generate_summary_chunked()` and `extract_title()` are hardcoded to the current four-section prompt format. Fix: all built-in templates must include the `TITLE:` instruction line; add `supports_chunking: bool` to `SummaryTemplate` struct; validate user templates at save time with an inline warning if `TITLE:` is absent.

5. **SQLite migration fails on upgrade** — adding `speaker_id NOT NULL` on the existing `transcripts` table fails when rows already exist (`SQLITE_ERROR: Cannot add a NOT NULL column with default value NULL`). Fix: add all new columns as `DEFAULT NULL` nullable; test migration against a seeded v1.1 database with 1000+ rows.

## Implications for Roadmap

Based on research, the dependency structure and pitfall severity mandate a strict 5-phase implementation order. Deviating from this order produces compounding failures (diarization worsening the UI freeze, templates silently breaking title extraction, the speaker timeline having no backend to read from).

### Phase 1: Post-Recording Performance Fix

**Rationale:** This is the highest-priority fix and must ship before any other v1.2 work. Diarization is triggered at or after stop time — if the stop path still freezes the UI, adding diarization (10–120 seconds of CPU work on long meetings) makes the freeze catastrophic. This fix also improves the experience for every user on every recording, regardless of whether they ever use diarization or templates.

**Delivers:** Responsive "Stop" button — UI returns in <500ms; `session-complete` event arrives 1–3 seconds later via background task; no transcript data loss from the 300 ms sleep removal.

**Addresses:** Post-recording freeze (table stakes feature for the release); foundation for all post-stop processing.

**Avoids:** Pitfall 1 (block_on freeze is eliminated); ensures Pitfall 2 (diarization blocking stop) cannot occur by design.

**Files modified:** `session.rs`, `commands.rs`, `useSession.ts` — no schema changes, no new dependencies.

**Research flag:** No additional research needed. Root cause identified to specific line numbers in source code; fix pattern is standard Tauri async design with verified prior art in the codebase (`tauri::async_runtime::spawn` already used in `transcription/mod.rs`).

---

### Phase 2: Summary Templates

**Rationale:** Templates are fully independent of diarization and unblock immediate user value while the more complex diarization work proceeds. The template infrastructure also needs to be in place before speaker-attributed summaries can be implemented in Phase 5. If diarization development encounters delays, templates can ship as a partial v1.2 release.

**Delivers:** 5 built-in templates (Standard Meeting Notes, Action Items Focus, Executive Summary, Technical Discussion, Interview/1:1), template picker in `SummaryPanel`, re-generate with selected template, `defaultSummaryTemplate` in `settings.json`, `SummaryTemplate` struct with `supports_chunking` flag, optional custom template editor UI (P2).

**Uses:** `llm/templates.rs` (new Rust file), `settings.json` via existing `plugin-store`, `generate_summary` command extended with `template_id: Option<String>` parameter.

**Avoids:** Pitfall 6 (templates breaking `extract_title` and chunked summarization) by designing `SummaryTemplate` struct with `requires_title_line` and `supports_chunking` fields before any UI is built; Pitfall 9 (prompt injection via transcript content) by wrapping transcript in `<transcript>...</transcript>` structural delimiters and enforcing a character limit on user template prompts.

**Research flag:** No additional research needed. Template architecture is fully specified: built-ins compiled into binary, user templates in `settings.json`, `str::replace("{transcript}", ...)` for substitution — no templating library required.

---

### Phase 3: Diarization Core (Rust)

**Rationale:** The Rust diarization backend must be built and verified in isolation before any frontend work depends on it. The speaker timeline (Phase 4) and speaker-attributed summaries (Phase 5) cannot be built until the diarization Tauri commands exist and produce correct segment data.

**Delivers:** `diarization/` module (mod.rs, worker.rs, model.rs), Migration 004 (speaker_segments, speaker_labels, transcripts.speaker_id, summaries.template_id), model download integration via existing `download.rs` channel pattern, `check_diarization_models_ready` command, progress streaming via `Channel<DiarizationEvent>`, midpoint-overlap speaker-to-transcript alignment, model caching in Rust state (avoid reloading per call).

**Uses:** `sherpa-rs =0.6.8` diarize module (existing, no bump), `ogg = "0.9"` + `opus = "0.3"` (two new Rust crates), `rubato 0.15` (existing), `sqlx 0.8` (existing).

**Avoids:** Pitfall 2 (Tokio pool starvation) by running inference on `std::thread::spawn` not `spawn_blocking`; Pitfall 3 (timestamp misalignment) by implementing midpoint-overlap matching with ±500ms tolerance; Pitfall 4 (wrong speaker count) by defaulting to `num_clusters: None` (auto) capped at max 8; Pitfall 5 (missing models on upgrade) by calling `check_diarization_models_ready` at startup and showing inline download prompt when missing; Pitfall 7 (NOT NULL migration failure) by using nullable column additions only; Pitfall 10 (Windows ONNX DLL failures) by adding VCRUNTIME check and NSIS installer update.

**Research flag:** MEDIUM — the `ogg` + `opus` decode pipeline for libopusenc-produced files has no published integration example. Recommend a one-day decode spike before committing the full architecture: verify `PacketReader` + `Decoder::decode_float` produces correct f32 samples from a recording made by the app. Fallback if the spike fails: use a system `ffmpeg` subprocess (adds a system dependency but eliminates uncertainty).

---

### Phase 4: Speaker Timeline + Attributed Transcript (Frontend)

**Rationale:** Purely additive frontend work that depends on Phase 3 commands being available. No risk of breaking existing functionality. Can be parallelized with Phase 5 if separate engineers are available.

**Delivers:** `SpeakerTimeline.tsx` (custom SVG, zero dependencies, ~80 lines), `SpeakerLabel.tsx` (inline rename with blur/enter handler), `useDiarization.ts` hook, speaker-attributed transcript display in `MeetingCompleteView` (speaker name prepended to each segment), click-to-scroll coordination via lifted `highlightedMs` state, "Analyzing speakers..." progress indicator while diarization is in progress.

**Avoids:** Pitfall 8 (timeline re-rendering during recording) by making the timeline post-recording-only in v1.2 scope, memoizing with `React.memo`, and feeding it a static `speakerTurns` array from diarization results — not the live transcript segment stream.

**Research flag:** No additional research needed. SVG timeline pattern is standard; component spec is fully defined in STACK.md including the exact `SpeakerTimeline` interface and color palette.

---

### Phase 5: Speaker-Attributed Summaries

**Rationale:** This phase ties together Phases 2 and 3 — it requires both the template prompt infrastructure and the speaker diarization data. It is the smallest code change (a parameter addition to an existing code path) but delivers the highest value multiplier: users with diarization data get `@Alice:` action items instead of generic ones.

**Delivers:** `build_summary_prompt` extended with `speaker_map: Option<HashMap<u32, String>>`; `generate_summary` command fetches speaker labels for the meeting and injects `[Name]: text` speaker-prefixed transcript into the prompt when diarization data exists; speaker-attributed summaries work with all built-in templates; `None` fallback preserves existing behavior exactly.

**Avoids:** Pitfall 6 (chunking compatibility) — speaker-prefixed transcript text is ~5–10% longer but stays within chunking thresholds for all realistic meeting lengths; Pitfall 3 (wrong names in summary) mitigated by using display names from the `speaker_labels` table, which reflect any user renaming done before re-generation.

**Research flag:** No additional research needed. The integration point is a parameter addition with a backward-compatible `None` fallback; all surrounding infrastructure (chunking, streaming, FTS) is unchanged.

---

### Phase Ordering Rationale

- **Phase 1 first:** The stop-sequence freeze blocks all subsequent testing of v1.2 features. Any feature that runs after recording stops (diarization, summary generation) will be degraded or broken if the freeze persists. This is a production bug that should have shipped before research began.
- **Phase 2 before Phase 3:** Templates are independent and deliver immediate user value. They also establish the `SummaryTemplate` struct and prompt substitution infrastructure that Phase 5 depends on. If diarization encounters delays, templates can ship as a standalone v1.2 increment.
- **Phase 3 before Phase 4:** Frontend speaker features have zero value without backend data. Building the SVG component before the Tauri commands exist creates integration dead ends.
- **Phase 5 last:** Requires both Phase 2 (template system) and Phase 3 (speaker data). It is the smallest code change with the most satisfying outcome — a reward for completing the prior work.

### Research Flags

Phases likely needing deeper research or spikes during planning:
- **Phase 3 (OGG/Opus decode):** The `ogg = "0.9"` + `opus = "0.3"` combination has no published example confirming it works with libopusenc-produced files specifically. One-day decode spike recommended before committing the full architecture. Fallback path (ffmpeg subprocess) should be documented as a contingency.
- **Phase 3 (Windows ONNX DLLs):** NSIS installer configuration for including Visual C++ redistributables with Tauri bundles has limited documentation. A clean Windows 10 VM test is required before Phase 3 is considered complete; this should be a required release gate.
- **Phase 3 (embedding model selection):** Two plausible embedding models appear in the research — `3dspeaker_speech_eres2net` and `nemo_en_titanet_small`. Validate the exact model against the sherpa-rs 0.6.8 `diarize.rs` example during Phase 3 implementation to confirm which model the API was tested with.

Phases with standard patterns (no additional research needed):
- **Phase 1:** Fix pattern verified in Tauri docs; root cause identified to specific line numbers in source; `tokio::spawn` usage confirmed in existing codebase.
- **Phase 2:** Template architecture fully specified; `str::replace` substitution; `settings.json` storage; no novel patterns.
- **Phase 4:** Custom SVG timeline is a well-established React pattern; component spec fully defined in STACK.md.
- **Phase 5:** Parameter addition with `None` fallback; all surrounding machinery unchanged.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | sherpa-rs diarize module verified via direct source inspection of crates/sherpa-rs/src/diarize.rs; ogg+opus pattern is MEDIUM confidence — sound reasoning but no published integration example for this exact use case |
| Features | HIGH | Current codebase read directly for ground truth; competitor analysis cross-referenced against official Fireflies, Granola, Otter documentation |
| Architecture | HIGH | v1.1 architecture understood from direct source reads of session.rs, commands.rs, llm/mod.rs, db.rs, transcription/mod.rs, all three migrations; fix architecture verified against Tauri async runtime docs |
| Pitfalls | HIGH | Root causes verified in source code (block_on, thread::sleep identified by specific line numbers); prevention strategies cross-referenced with Tauri community discussions, SQLite official docs, OWASP LLM01:2025 |

**Overall confidence:** HIGH

### Gaps to Address

- **OGG/Opus decode integration:** The `ogg = "0.9"` + `opus = "0.3"` combination is the theoretically correct approach but lacks a published integration example for libopusenc-produced files. Spike this at the start of Phase 3. Fallback option: use a system `ffmpeg` subprocess for decode (adds a system dependency but eliminates decode uncertainty).

- **Diarization embedding model choice:** STACK.md identifies the pyannote segmentation-3-0 model unambiguously (1.5 MB int8 quantized). For the embedding stage, two models appear across the research: `nemo_en_titanet_small.onnx` (~8 MB, STACK.md recommendation) and `3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx` (~25–35 MB, ARCHITECTURE.md). Validate which model the sherpa-rs 0.6.8 `diarize.rs` example uses before downloading models for Phase 3.

- **Automatic speaker count on short recordings:** Diarization clustering is unreliable on meetings under 2 minutes (insufficient embeddings). A minimum-duration guard (skip diarization if recording < 60 seconds, show a message instead) should be added as a UX safeguard. Not a gap in the architecture, but a missing acceptance criterion for Phase 3.

- **Windows VCRUNTIME bundling:** Adding the Visual C++ 2019 Redistributable to the Tauri NSIS installer is documented in principle but requires clean-VM testing to confirm. Treat as a required release gate for Phase 3; do not ship diarization on Windows without this verification.

## Sources

### Primary (HIGH confidence)
- openNotes codebase (direct inspection): `session.rs` (lines 256–276), `commands.rs`, `llm/mod.rs`, `transcription/mod.rs`, `transcription/worker.rs`, `db.rs`, migrations 001–003, `src/types/index.ts`, `src/hooks/useSummary.ts`, `src/views/MeetingCompleteView.tsx`
- sherpa-rs v0.6.8: `crates/sherpa-rs/src/diarize.rs` — DiarizeConfig, Segment struct, compute() API confirmed
- sherpa-rs v0.6.8: `examples/diarize.rs` — model usage pattern (segmentation + embedding) confirmed
- [sherpa-onnx speaker diarization docs](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/index.html) — pipeline architecture, model sizes
- [Tauri async commands docs](https://v2.tauri.app/develop/calling-rust/) — spawn_blocking, Channel<T> patterns
- [Tauri discussions #10329](https://github.com/tauri-apps/tauri/discussions/10329) — CPU-bound blocking work in commands
- [Tauri discussions #4191](https://github.com/tauri-apps/tauri/discussions/4191) — block_on freezes Tauri UI confirmed
- [Fireflies speaker label editing docs](https://guide.fireflies.ai/articles/4994477228-how-to-edit-speaker-labels-or-names-in-a-transcript) — UX pattern reference
- [Granola templates docs](https://docs.granola.ai/help-center/taking-notes/customise-notes-with-templates) — template UX reference
- [Otter custom templates docs](https://help.otter.ai/hc/en-us/articles/31402572907415-Custom-Meeting-Type-Templates) — template UX reference
- [SQLite ALTER TABLE NOT NULL constraint](https://laracasts.com/discuss/channels/general-discussion/migrations-sqlite-general-error-1-cannot-add-a-not-null-column-with-default-value-null) — migration safety confirmed
- [OWASP LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) — template security guidance
- [Symphonia issue #8](https://github.com/pdeljanov/Symphonia/issues/8) — Opus codec not implemented, confirming ogg+opus is the correct path

### Secondary (MEDIUM confidence)
- [pyannote-rs GitHub](https://github.com/thewh1teagle/pyannote-rs) — v0.3.0, ONNX Runtime, CPU performance claim ("< 1 min/hr"), CoreML/DirectML support
- [docs.rs/ogg](https://docs.rs/ogg) — pure Rust OGG container parser API surface
- [docs.rs/opus](https://docs.rs/opus) — libopus safe Rust bindings, decode_float availability
- [AssemblyAI diarization guide 2026](https://www.assemblyai.com/blog/what-is-speaker-diarization-and-how-does-it-work) — DER benchmarks, clustering behavior, automatic speaker count
- [WhisperX timestamp alignment (m-bain/whisperX)](https://github.com/m-bain/whisperX) — ASR/diarization alignment algorithm patterns
- [Granola recipes (TechCrunch)](https://techcrunch.com/2025/09/30/ai-note-taking-app-granola-adds-a-repeatable-prompts-feature/) — 29 built-in templates, repeatable prompts feature
- [pyannoteAI community-1 announcement](https://www.pyannote.ai/blog/community-1) — model performance context

---
*Research completed: 2026-03-04*
*Ready for roadmap: yes*
