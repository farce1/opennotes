---
phase: 08-cross-platform-hardening
plan: 04
subsystem: ui
tags: [permissions, shortcuts, platform-detection, recording-ux]
requires:
  - phase: 08-01
    provides: Cross-platform path/plugin baseline and command wiring
  - phase: 08-02
    provides: Runtime Windows/Linux capture and detection behavior
provides:
  - Platform-aware permission flow in recording hook
  - Dynamic shortcut display formatting by OS
  - Recording UI messaging adapted for macOS vs Windows/Linux
affects: [record-view, settings, onboarding-guidance]
tech-stack:
  added: [@tauri-apps/plugin-os]
  patterns: [Runtime platform branching with dynamic macOS module import]
key-files:
  created:
    - src/lib/platform.ts
  modified:
    - src/hooks/useRecording.ts
    - src/components/settings/GeneralSection.tsx
    - src/views/RecordView.tsx
key-decisions:
  - "Keep macOS permission APIs as dynamic imports so non-macOS bundles avoid hard dependency at module load."
  - "Centralize platform shortcut formatting in a shared utility to avoid duplicated key-label logic."
patterns-established:
  - "User-facing shortcut strings always use platform-aware formatting (`Cmd` vs `Ctrl`)."
  - "System settings deep-link action is exposed only on macOS UI surfaces."
requirements-completed: [XPLAT-11, XPLAT-12, XPLAT-13]
duration: 15 min
completed: 2026-03-01
---

# Phase 08 Plan 04 Summary

**Recording permission handling and shortcut UI are now OS-aware, removing macOS-only assumptions from Windows/Linux runtime paths while preserving native macOS flows.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-01T16:21:00Z
- **Completed:** 2026-03-01T16:36:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Reworked `useRecording` permission handling so macOS uses dynamic permission-plugin imports while Windows/Linux use backend permission status checks.
- Added shared platform utility helpers and switched settings shortcut display formatting to OS-adaptive rendering.
- Updated recording view shortcut hints and system-audio UI affordances so macOS-specific setup affordances are not shown on non-macOS platforms.

## Task Commits

Each task was committed atomically:

1. **Task 1: Platform-aware permission flow in useRecording** - `088243b` (feat)
2. **Task 2: Cross-platform keyboard shortcut display and UX** - `42baca8` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `src/hooks/useRecording.ts` - Adds runtime OS detection, dynamic macOS permission import, and OS-specific hints/settings behavior.
- `src/lib/platform.ts` - Shared platform helpers for current OS and shortcut display formatting.
- `src/components/settings/GeneralSection.tsx` - Uses shared shortcut display formatter.
- `src/views/RecordView.tsx` - Uses platform-aware shortcut hint and macOS-scoped system settings action.

## Decisions Made
- OS detection is synchronous via `@tauri-apps/plugin-os` to keep permission checks straightforward and deterministic.
- Shortcut display defaults to symbolic modifiers on macOS in settings, and textual modifiers elsewhere.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None (TypeScript and Rust checks passed after updates).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All planned Phase 08 implementation work is complete.
- Ready for phase verification and completion routing.

---
*Phase: 08-cross-platform-hardening*
*Completed: 2026-03-01*
