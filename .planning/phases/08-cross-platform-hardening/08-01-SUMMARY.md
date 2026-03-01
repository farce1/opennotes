---
phase: 08-cross-platform-hardening
plan: 01
subsystem: infra
tags: [tauri, pathresolver, sqlite, models, cross-platform]
requires:
  - phase: 07-03
    provides: Configured settings persistence and startup shortcut wiring
provides:
  - Cross-platform backend data paths via Tauri app-local data directory
  - macOS-only permissions plugin gated at dependency and registration levels
  - Frontend DB/model path resolution from app-local data directory
affects: [audio-capture, transcription, backup-restore, setup-flow]
tech-stack:
  added: []
  patterns: [Managed DataDir state, PathResolver-first path construction]
key-files:
  created: []
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src-tauri/src/commands.rs
    - src-tauri/src/session.rs
    - src-tauri/src/transcription/model.rs
    - src-tauri/src/transcription/mod.rs
    - src-tauri/src/download.rs
    - src/lib/constants.ts
    - src/lib/db.ts
    - src/components/settings/TranscriptionSection.tsx
    - src/components/settings/DataSection.tsx
key-decisions:
  - "Introduced managed `DataDir(PathBuf)` state so all command paths resolve from one app-local root."
  - "Kept SQL plugin migration key as `sqlite:data.db` and aligned runtime DB path under app-local data dir."
patterns-established:
  - "All backend filesystem paths must derive from `app.path().app_local_data_dir()`."
  - "Transcription/model path helpers now accept explicit base paths instead of reading HOME."
requirements-completed: [XPLAT-01, XPLAT-02, XPLAT-03]
duration: 34 min
completed: 2026-03-01
---

# Phase 08 Plan 01 Summary

**Backend and frontend storage paths now resolve from Tauri app-local data directories, with macOS-only permissions code gated behind target-specific wiring.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-03-01T15:03:00Z
- **Completed:** 2026-03-01T15:37:44Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Replaced `HOME`/`.opennotes` backend path assumptions with managed `DataDir` state and `app_local_data_dir()` setup.
- Refactored session/transcription/model/download flows so model readiness and file paths are parameterized by the resolved data directory.
- Updated frontend DB/model path handling to use `appLocalDataDir()` and display the resolved storage path in Settings.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Rust backend to PathResolver and gate macOS plugins** - `da486eb` (feat)
2. **Task 2: Migrate frontend to dynamic cross-platform paths** - `96ace71` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `src-tauri/Cargo.toml` - Target-gates `tauri-plugin-macos-permissions` to macOS.
- `src-tauri/src/lib.rs` - Resolves app-local data dir, migrates legacy macOS data, manages `DataDir`, registers startup shortcut from persisted settings.
- `src-tauri/src/commands.rs` - Threads `DataDir` through session, recording, model, and backup/restore commands.
- `src-tauri/src/session.rs` - Accepts base data directory for output path and transcription startup.
- `src-tauri/src/transcription/model.rs` - Parameterized model path helpers by explicit base path.
- `src-tauri/src/transcription/mod.rs` - Uses parameterized model paths when starting worker.
- `src-tauri/src/download.rs` - Downloads/checks models in resolved app-local models directory.
- `src/lib/constants.ts` - Adds async helpers for data directory and SQLite path.
- `src/lib/db.ts` - Loads SQL database using resolved dynamic path.
- `src/components/settings/TranscriptionSection.tsx` - Deletes models from resolved app-local models path.
- `src/components/settings/DataSection.tsx` - Displays resolved app-local storage location.

## Decisions Made
- Managed `DataDir` is the canonical filesystem root for backend commands and worker setup.
- Legacy macOS `~/.opennotes` migration runs once with a `.migrated` marker in the new data directory.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Session/transcription path threading required extra file updates**
- **Found during:** Task 1 (backend path migration)
- **Issue:** `session.rs` and `transcription/mod.rs` still depended on old zero-arg model/output helpers after helper signatures changed.
- **Fix:** Threaded `DataDir`/path args through session start and transcription worker startup.
- **Files modified:** `src-tauri/src/session.rs`, `src-tauri/src/transcription/mod.rs`
- **Verification:** `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- **Committed in:** `da486eb` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for compile correctness; no scope creep.

## Issues Encountered
- Runtime plugin registration in `setup` was not available on this Tauri API surface; SQL/global-shortcut/macos-permissions registration remained on builder while path resolution moved to setup.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Cross-platform path and plugin-gating foundation is complete.
- Ready for platform audio backend and Ollama detection hardening in 08-02.

---
*Phase: 08-cross-platform-hardening*
*Completed: 2026-03-01*
