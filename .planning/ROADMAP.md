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
- [x] Phase 04: Recording Orchestration (completed 2026-02-27)
  - **Goal:** Unify recording + transcription into a coordinated session manager with crash recovery, per-segment DB checkpointing, 4-hour limit with countdown, and production-ready error handling.
  - **Requirements:** [ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05, ORCH-06, ORCH-07, ORCH-08, ORCH-09, ORCH-10, ORCH-11, ORCH-12, ORCH-13, ORCH-14, ORCH-15, ORCH-16, ORCH-17, ORCH-18]
  - **Plans:** 3 plans
    - [x] 04-01-PLAN.md — Rust SessionCoordinator backend (sqlx pool, migration, session commands, segment checkpointing) (completed 2026-02-27)
    - [x] 04-02-PLAN.md — Frontend refactor (useSession hook, ring buffer, MeetingCompleteView from DB, widget session commands) (completed 2026-02-27)
    - [x] 04-03-PLAN.md — Crash recovery UX, Library view, 4-hour auto-stop with countdown timer (completed 2026-02-27)
- [x] Phase 05: Notes/Summary Pipeline (completed 2026-02-27)
  - **Goal:** Transform completed transcripts into structured meeting notes using a local Ollama LLM. Includes Ollama auto-setup during onboarding, streaming summary generation with four-section format (Overview, Key Points, Decisions, Action Items), tab layout with markdown rendering, inline editing, re-generation, and export (Markdown, clipboard, PDF). Transcripts never leave the machine.
  - **Requirements:** [SUMM-01, SUMM-02, SUMM-03, SUMM-04, SUMM-05, SUMM-06, SUMM-07, SUMM-08, SUMM-09, SUMM-10, SUMM-11, SUMM-12]
  - **Plans:** 3 plans
    - [x] 05-01-PLAN.md — Rust LLM backend (Ollama detection, model pull, streaming summary generation, DB persistence, chunking) (completed 2026-02-27)
    - [x] 05-02-PLAN.md — Ollama onboarding UI (setup wizard expansion, useOllamaSetup hook, model pull progress) (completed 2026-02-27)
    - [x] 05-03-PLAN.md — Frontend summary pipeline (useSummary hook, tab layout, SummaryPanel, markdown rendering, editing, export) (completed 2026-02-27)
- [ ] Phase 06: Library + Data Workflows
  - **Goal:** Evolve the meeting library from a basic chronological list into a productive workspace with full-text search (FTS5 snippets), inline filter chips, date-section grouping, sort controls, card/compact view toggle, enriched meeting cards, multi-select with bulk operations, inline title rename, soft-delete with trash/restore, per-meeting export (MD/TXT/JSON/PDF), bulk ZIP export, and full library backup/restore in Settings.
  - **Plans:** 3 plans
    - [ ] 06-01-PLAN.md — Backend foundation (SQLite FTS5 migration, soft-delete schema, Rust commands, dependency install, Tauri plugin setup)
    - [ ] 06-02-PLAN.md — Library UI evolution (useLibrary hook, search/filter/sort, enriched cards, date grouping, view modes)
    - [ ] 06-03-PLAN.md — Selection, export, backup (multi-select, bulk actions, inline rename, export module, backup/restore settings)
- [ ] Phase 07: Settings Surface Expansion
- [ ] Phase 08: Cross-Platform Hardening

## Progress

| Phase | Status | Plans | Completed |
|-------|--------|-------|-----------|
| 01 | Complete | 3/3 | 2026-02-26 |
| 02 | Complete | 2/2 | 2026-02-27 |
| 03 | Complete | 3/3 | 2026-02-27 |
| 04 | Complete | 3/3 | 2026-02-27 |
| 05 | Complete | 3/3 | 2026-02-27 |
| 06 | 2/3 | In Progress|  |
| 07 | Pending | 0/0 | - |
| 08 | Pending | 0/0 | - |
