---
phase: 09-polish-tech-debt-cleanup
plan: 01
subsystem: infra
tags: [fts, sqlite, shortcuts, tauri, settings]
requires:
  - phase: 08-04
    provides: Platform-aware recording and shortcut UX foundations
provides:
  - Session-stop FTS reindexing with summary-aware FTS row content
  - Startup backfill for missing `meetings_fts` rows
  - Rust-authoritative shortcut update flow without JS-side duplicate registration
affects: [library-search, summary-pipeline, settings-shortcuts]
tech-stack:
  added: []
  patterns: [FTS self-healing startup backfill, Rust-only global-shortcut authority]
key-files:
  created: []
  modified:
    - src-tauri/src/commands.rs
    - src-tauri/src/session.rs
    - src-tauri/src/lib.rs
    - src/components/settings/GeneralSection.tsx
key-decisions:
  - "Made `fts_upsert` callable across backend modules and kept failures non-blocking via error logging."
  - "Removed frontend global-shortcut register/unregister logic; shortcut mutation now goes only through `update_recording_shortcut`."
patterns-established:
  - "Session stop now finalizes DB row first, then performs FTS upsert for immediate search availability."
  - "Summary writes trigger FTS re-upsert so summaries are searchable without waiting for title changes."
requirements-completed: []
duration: 1 min
completed: 2026-03-01
---

# Phase 09 Plan 01 Summary

**Meeting search index consistency is now enforced at session stop/startup, and shortcut capture no longer creates duplicate global shortcut handlers.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-01T19:31:43Z
- **Completed:** 2026-03-01T19:32:21Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extended `fts_upsert` to index transcript plus summary content and invoked it after summary generation/manual edits.
- Added session-stop FTS synchronization and startup missing-row backfill for `meetings_fts`.
- Removed JS shortcut register/unregister path from Settings capture flow so Rust remains the only shortcut authority.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add FTS sync on session stop and startup backfill** - `db22c67` (feat)
2. **Task 2: Fix shortcut double-registration in GeneralSection** - `457cdc6` (fix)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `src-tauri/src/commands.rs` - Made `fts_upsert` reusable, indexed summaries in FTS rows, and reindexed after summary writes.
- `src-tauri/src/session.rs` - Added session-stop FTS upsert with defensive delay after finalizing meeting rows.
- `src-tauri/src/lib.rs` - Added startup backfill task for meetings missing FTS rows.
- `src/components/settings/GeneralSection.tsx` - Removed JS shortcut re-registration flow and restored fallback through Rust command path.

## Decisions Made
- Kept all FTS update failures non-fatal and logged to avoid blocking stop/save flows.
- Retained `update_recording_shortcut` as the single mutation path to prevent dual JS/Rust listener registration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tokio` module unavailable in crate for planned async delay**
- **Found during:** Task 1 (session stop FTS sync)
- **Issue:** `tokio::time::sleep` usage failed compile because `tokio` is not a direct dependency in this crate.
- **Fix:** Replaced async sleep with `std::thread::sleep` before the async `fts_upsert` call.
- **Files modified:** `src-tauri/src/session.rs`
- **Verification:** `cargo check` passes.
- **Committed in:** `db22c67` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change; behavior remains the same with a compile-safe delay implementation.

## Issues Encountered
- None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- FTS and shortcut lifecycle gaps are closed and stable.
- Ready for 09-02 settings knob threading (`preferredMicDevice`, `transcriptionLanguage`) through recording start.

---
*Phase: 09-polish-tech-debt-cleanup*
*Completed: 2026-03-01*
