# Requirements

## Foundation

- [x] FOUN-01
- [x] FOUN-02
- [x] FOUN-03
- [x] FOUN-04
- [x] FOUN-05
- [x] FOUN-06
- [x] FOUN-07

## Audio Capture

- [x] CAPT-01: Microphone + system audio capture via cpal (loopback on macOS 14.6+)
- [x] CAPT-02: Opus/OGG encoding at 48kHz stereo ~1MB/min
- [x] CAPT-03: Floating always-on-top recording widget (draggable, position memory, timer, waveform, controls)
- [x] CAPT-04: One-click recording from tray icon or global shortcut
- [x] CAPT-05: JIT macOS permissions with pre-explanation and denied guidance
- [x] CAPT-06: Recording lifecycle (pause/resume/stop, 2-hour soft warning)

## Transcription Engine

- [x] TRANS-01: Silero VAD segments speech from mic audio (16 kHz, 512-sample windows)
- [x] TRANS-02: Parakeet TDT transcribes completed speech segments offline on dedicated worker thread
- [x] TRANS-03: Transcript segments stream to React frontend via Tauri Channel (text, elapsed_ms, index)
- [x] TRANS-04: First-run model download (~640 MB Parakeet + ~2 MB Silero VAD) with streaming progress
- [x] TRANS-05: Atomic model file placement with .tmp cleanup on failure, retry support
- [x] TRANS-06: 48 kHz to 16 kHz resampling via rubato (1536 in -> 512 out, 3:1 ratio)
- [x] TRANS-07: Blocking setup wizard — user cannot record until model is downloaded
- [x] TRANS-08: Live transcript in main window with fade-in animation, elapsed timestamps, locked-to-bottom
- [x] TRANS-09: Pause flushes VAD buffer — no speech lost at pause boundary
- [x] TRANS-10: Widget shows "Transcribing" label when ASR is active
- [x] TRANS-11: Meeting complete view with full scrollable transcript, auto-generated title, copy/export
- [x] TRANS-12: Recording blocked without ready model — clear message directs to setup

## Recording Orchestration

- [x] ORCH-01: Single unified start_session() command atomically starts audio + transcription as one unit
- [x] ORCH-02: SessionCoordinator as Tauri managed state owns both subsystem lifecycles
- [x] ORCH-03: Backend sqlx SqlitePool for Rust-side DB writes (segment checkpoints, meeting rows)
- [x] ORCH-04: DB migration adds audio_path, audio_sources columns and updates status constraint to include 'recovered'/'paused'
- [x] ORCH-05: Meeting DB record created immediately on session start with status='recording'
- [x] ORCH-06: Per-segment checkpoint writes to SQLite from transcription forwarder thread
- [x] ORCH-07: Unified stop_session() with graceful 3s timeout and "Saving..." UI state
- [x] ORCH-08: Unified pause_session()/resume_session() propagate across all subsystems atomically
- [x] ORCH-09: Frontend hooks refactored to call session commands instead of separate recording/transcription commands
- [x] ORCH-10: Widget stop button calls stop_session (not bare stop_recording)
- [x] ORCH-11: MeetingCompleteView becomes display-only (loads transcript from DB, no bulk insert)
- [x] ORCH-12: Transcript ring buffer in React state (last ~50 segments), scroll-back loads from DB
- [x] ORCH-13: If transcription crashes mid-recording, audio continues with warning badge on widget
- [x] ORCH-14: Crash recovery on app relaunch — detect incomplete sessions, set status='recovered'
- [x] ORCH-15: Re-transcribe button on recovered meetings (not automatic)
- [x] ORCH-16: Hard 4-hour limit with auto-stop and countdown timer in widget during last 5 minutes
- [x] ORCH-17: Track audio sources (mic, system, both) as metadata on meeting record
- [x] ORCH-18: Cross-window session state sync via Rust-authoritative app.emit() events

## Notes/Summary Pipeline

- [ ] SUMM-01: Ollama detection (installed vs. running vs. model pulled) with platform-appropriate install guidance
- [ ] SUMM-02: Ollama model pull with streaming progress via Tauri Channel (phi4-mini default, ~2.5GB)
- [ ] SUMM-03: Streaming summary generation via Ollama /api/generate with line-buffered JSON parsing
- [ ] SUMM-04: Structured summary format: Overview (5-8 sentences), Key Points, Decisions Made, Action Items
- [ ] SUMM-05: Auto-generate summary when recording stops — no extra button needed
- [ ] SUMM-06: Tab layout in meeting view: Summary (default) and Transcript tabs
- [ ] SUMM-07: Streaming markdown rendering with react-markdown + remark-gfm (headings, bullets, checkboxes)
- [ ] SUMM-08: Inline editing of generated summary with debounced auto-save to DB
- [ ] SUMM-09: Re-generate summary with confirmation dialog ("will replace your edits")
- [ ] SUMM-10: Export summary as Markdown file (.md), clipboard copy (formatted), and PDF (@react-pdf/renderer)
- [ ] SUMM-11: LLM-generated meeting title extracted from summary output; user-editable
- [ ] SUMM-12: Long transcript chunking for transcripts exceeding ~24K tokens (iterative map-reduce)
