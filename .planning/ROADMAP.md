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
| 04 | Pending | 0/0 | - |
| 05 | Pending | 0/0 | - |
| 06 | Pending | 0/0 | - |
| 07 | Pending | 0/0 | - |
| 08 | Pending | 0/0 | - |
