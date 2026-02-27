# Roadmap

## Phase Plan

- [x] Phase 01: App Shell & Storage Foundation (completed 2026-02-26)
- [x] Phase 02: Audio Capture Foundation (completed 2026-02-27)
  - **Goal:** Capture system audio and microphone input on macOS, encode to Opus/OGG, display floating recording widget with live feedback
  - **Plans:** 2 plans
    - [x] 02-01-PLAN.md — Audio capture backend (cpal, libopusenc, Tauri commands) (completed 2026-02-27)
    - [x] 02-02-PLAN.md — Floating widget UI and recording UX integration (completed 2026-02-27)
- [x] Phase 03: Transcription Engine Integration (completed 2026-02-27)
  - **Goal:** End-to-end audio-to-text pipeline: Silero VAD segments speech, Parakeet TDT transcribes offline, results stream to React frontend via Tauri Channel. Includes first-run model download flow (~640 MB).
  - **Requirements:** [TRANS-01, TRANS-02, TRANS-03, TRANS-04, TRANS-05, TRANS-06, TRANS-07, TRANS-08, TRANS-09, TRANS-10, TRANS-11, TRANS-12]
  - **Plans:** 3 plans
    - [x] 03-01-PLAN.md — Rust transcription backend (sherpa-rs VAD+ASR, resampler, worker thread, Tauri Channel) (completed 2026-02-27)
    - [x] 03-02-PLAN.md — Model download system (streaming HTTP, progress events, atomic placement) (completed 2026-02-27)
    - [x] 03-03-PLAN.md — Frontend (setup wizard, live transcript, widget label, meeting complete view) (completed 2026-02-27)
- [ ] Phase 04: Recording Orchestration
  - **Goal:** Unify recording + transcription into a coordinated session manager with crash recovery, per-segment DB checkpointing, 4-hour limit with countdown, and production-ready error handling.
  - **Requirements:** [ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05, ORCH-06, ORCH-07, ORCH-08, ORCH-09, ORCH-10, ORCH-11, ORCH-12, ORCH-13, ORCH-14, ORCH-15, ORCH-16, ORCH-17, ORCH-18]
  - **Plans:** 3 plans
    - [ ] 04-01-PLAN.md — Rust SessionCoordinator backend (sqlx pool, migration, session commands, segment checkpointing)
    - [ ] 04-02-PLAN.md — Frontend refactor (useSession hook, ring buffer, MeetingCompleteView from DB, widget session commands)
    - [ ] 04-03-PLAN.md — Crash recovery UX, Library view, 4-hour auto-stop with countdown timer
- [ ] Phase 05: Notes/Summary Pipeline
- [ ] Phase 06: Library + Data Workflows
- [ ] Phase 07: Settings Surface Expansion
- [ ] Phase 08: Cross-Platform Hardening

## Progress

| Phase | Status | Plans | Completed |
|-------|--------|-------|-----------|
| 01 | Complete | 3/3 | 2026-02-26 |
| 02 | Complete | 2/2 | 2026-02-27 |
| 03 | Complete | 3/3 | 2026-02-27 |
| 04 | In Progress | 0/3 | - |
| 05 | Pending | 0/0 | - |
| 06 | Pending | 0/0 | - |
| 07 | Pending | 0/0 | - |
| 08 | Pending | 0/0 | - |
