---
phase: 17-diarization-core
plan: 01
subsystem: diarization
tags: [tauri, rust, sqlx, sherpa-rs, ogg, opus]
requires:
  - phase: 14-post-recording-performance
    provides: Async post-processing completion path and stable meeting lifecycle state
affects: [meeting-complete-view, transcript-rendering, model-download, phase-17-plan-02]
provides:
  - Rust diarization runtime with dedicated worker thread and progress events
  - OGG/Opus decode plus 48k->16k resampling and sherpa-rs diarization inference pipeline
  - Speaker schema/migration, transcript speaker_id linkage, and new Tauri diarization commands
tech-stack:
  added: [ogg, opus]
  patterns:
    - CPU-heavy diarization runs on std::thread::Builder (never tokio::spawn_blocking)
    - Diarization writes are transaction-scoped and replace stale speaker data atomically
key-files:
  created:
    - src-tauri/src/diarization/mod.rs
    - src-tauri/src/diarization/decode.rs
    - src-tauri/src/diarization/worker.rs
    - src-tauri/src/diarization/model.rs
    - src-tauri/migrations/006_phase17_diarization.sql
  modified:
    - src-tauri/src/commands.rs
    - src-tauri/src/download.rs
    - src-tauri/src/lib.rs
    - src-tauri/src/db.rs
    - src-tauri/Cargo.toml
key-decisions:
  - "Used a dedicated named OS thread for diarization orchestration to satisfy DIAR-10 and isolate from Tokio blocking pool contention."
  - "Used overlap-first transcript alignment with midpoint fallback to robustly map diarization turns onto fixed-length transcript rows."
  - "Extended existing model-download plumbing in download.rs instead of creating a second ad-hoc downloader path."
patterns-established:
  - "Diarization status lifecycle is persisted on meetings as running/complete/failed and mirrored to frontend via event stream + data query."
  - "Diarization model assets live under models/diarization with explicit readiness checks before inference."
requirements-completed: [DIAR-01, DIAR-02, DIAR-03, DIAR-04, DIAR-06, DIAR-10, DIAR-11]
duration: 17 min
completed: 2026-03-04
---

# Phase 17 Plan 01 Summary

**Shipped the full diarization backend stack: decode/resample/infer pipeline, DB persistence model, and Tauri command surface for frontend integration.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-03-04T21:08:00Z
- **Completed:** 2026-03-04T21:24:44Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added migration `006_phase17_diarization.sql` with `speaker_turns`, `speakers`, nullable `transcripts.speaker_id`, and `meetings.diarization_status`.
- Added diarization model helpers and download URLs, plus `ogg`/`opus` dependencies for native OGG/Opus decode.
- Implemented decode module with Opus pre-skip handling and worker module covering status updates, decode, resample, sherpa diarization, alignment, and transactional DB writes.
- Added `DiarizationEvent`, `DiarizationState`, and dedicated-thread launcher in `diarization/mod.rs`.
- Exposed five Tauri commands: `start_diarization`, `rename_speaker`, `check_diarization_model_ready`, `download_diarization_model`, and `get_diarization_data`.
- Wired diarization state/commands into `lib.rs` and extended transcript paging with `speaker_id`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Cargo deps, DB migration, and diarization model helpers** - `4217e7e` (feat)
2. **Task 2: OGG/Opus decode module and diarization worker** - `af22a8b` (feat)
3. **Task 3: Diarization module entry point, Tauri commands, and lib.rs registration** - `68e02e6` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `src-tauri/Cargo.toml` - Adds `ogg` and `opus` dependencies used by decode path.
- `src-tauri/migrations/006_phase17_diarization.sql` - Creates speaker tables/indexes and new meeting/transcript diarization columns.
- `src-tauri/src/db.rs` - Registers migration 6 and updates schema-version detection.
- `src-tauri/src/diarization/model.rs` - Defines diarization model paths/readiness helpers and download URL constants.
- `src-tauri/src/diarization/decode.rs` - Decodes `.ogg`/Opus audio with pre-skip trimming.
- `src-tauri/src/diarization/worker.rs` - Implements sync worker pipeline and transactional diarization persistence.
- `src-tauri/src/diarization/mod.rs` - Defines events/state and spawns dedicated diarization thread.
- `src-tauri/src/commands.rs` - Adds diarization commands/types and includes `speaker_id` in transcript query.
- `src-tauri/src/download.rs` - Adds diarization model download function using shared resumable helpers.
- `src-tauri/src/lib.rs` - Manages diarization state and registers new command handlers.

## Decisions Made

- Reused the existing model download event protocol (`DownloadEvent`) for diarization so frontend handling remains consistent.
- Chose an async SQL runtime local to the worker thread to keep the diarization orchestration synchronous and explicit.
- Treated transcript `end_time_ms` as derived (`start + 1000`) during alignment to avoid relying on placeholder values.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend contract for Phase 17 Plan 02 is complete: frontend can now start diarization, stream progress, rename speakers, and read speaker/turn datasets.
- Transcript paging now includes `speaker_id`, enabling grouped speaker transcript rendering without additional backend changes.

## Self-Check: PASSED

---
*Phase: 17-diarization-core*
*Completed: 2026-03-04*
