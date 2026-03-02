---
phase: 10-dependency-risk-closure
plan: 01
subsystem: infra
tags: [cargo, github-actions, dependency-management, sherpa-rs]
requires: []
provides:
  - Exact pin for sherpa-rs to prevent silent dependency drift
  - Cross-platform CI cache restore for sherpa-rs binary downloads
  - Documented v1.2 sherpa migration options with revisit triggers
affects: [transcription-runtime, release-ci, v1.2-planning]
tech-stack:
  added: []
  patterns: [Exact-version dependency pinning for binary-bound crates, explicit CI binary cache with non-fatal miss warning]
key-files:
  created:
    - .planning/research/sherpa-upgrade-path.md
  modified:
    - src-tauri/Cargo.toml
    - .github/workflows/release.yml
key-decisions:
  - "Pinned sherpa-rs using =0.6.8 to remove version float risk while keeping download-binaries feature."
  - "Used standalone actions/cache@v4 for sherpa binaries plus warning-on-miss, while keeping swatinem/rust-cache unchanged."
patterns-established:
  - "Dependency-risk closures should include pinning, CI reproducibility hardening, and upgrade escape-hatch documentation together."
  - "Cache misses for optional binary acceleration should warn but never block releases."
requirements-completed: [DEPS-01, DEPS-02, DEPS-03]
duration: 1 min
completed: 2026-03-02
---

# Phase 10 Plan 01 Summary

**sherpa-rs is now exact-pinned, release CI restores sherpa binary caches per platform, and a v1.2 migration brief is documented for future upgrades.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-02T13:21:50Z
- **Completed:** 2026-03-02T13:22:36Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Changed `sherpa-rs` from a floating caret-compatible dependency to an exact `=0.6.8` pin with inline upgrade-doc reference.
- Added dedicated `actions/cache@v4` restore for sherpa-rs binary directories across Linux/macOS/Windows and warning output on cache misses.
- Authored a decision brief with two migration options (chobits fork vs direct FFI), a comparison table, recommendation, and revisit triggers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin sherpa-rs to exact version and add upgrade doc comment** - `a9cbd79` (chore)
2. **Task 2: Add sherpa-rs-sys binary cache to CI workflow** - `c480ec2` (chore)
3. **Task 3: Write sherpa-rs upgrade path decision brief** - `e5b5a2e` (docs)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `src-tauri/Cargo.toml` - Pinned `sherpa-rs` to `=0.6.8` and linked to upgrade-path documentation.
- `.github/workflows/release.yml` - Added sherpa binary cache step and non-blocking cache-miss warning step.
- `.planning/research/sherpa-upgrade-path.md` - Added v1.2 migration decision brief with options, risks, and triggers.

## Decisions Made
- Kept `swatinem/rust-cache@v2` intact and added a separate `actions/cache@v4` step to expose explicit cache-hit output for warning logic.
- Documented direct FFI as a controlled fallback while recommending chobits fork first for lower migration effort.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `.planning/` is ignored in git, so planning artifacts required force-staging (`git add -f`) for plan-controlled docs commits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Dependency-risk closure requirements for Phase 10 are implemented and verifiable from source and CI config.
- Ready for phase-level verification and then transition to Phase 11 planning/execution.

---
*Phase: 10-dependency-risk-closure*
*Completed: 2026-03-02*
