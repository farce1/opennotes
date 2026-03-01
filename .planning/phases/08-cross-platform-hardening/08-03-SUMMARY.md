---
phase: 08-cross-platform-hardening
plan: 03
subsystem: infra
tags: [tauri, ci, github-actions, nsis, appimage, updater]
requires:
  - phase: 08-01
    provides: Cross-platform path and plugin gating baseline
provides:
  - Platform-specific bundle target overrides for Windows and Linux
  - Release-tag GitHub Actions pipeline for three desktop platforms
  - Updater plugin configuration and runtime registration
affects: [release-process, distribution, update-channel]
tech-stack:
  added: [tauri-plugin-updater, @tauri-apps/plugin-updater]
  patterns: [Per-platform Tauri config override files, tag-triggered release matrix]
key-files:
  created:
    - src-tauri/tauri.windows.conf.json
    - src-tauri/tauri.linux.conf.json
    - src-tauri/capabilities/macos-permissions.json
    - .github/workflows/release.yml
  modified:
    - src-tauri/tauri.conf.json
    - src-tauri/capabilities/default.json
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - package.json
key-decisions:
  - "Use Tauri config overrides (`tauri.windows.conf.json`, `tauri.linux.conf.json`) to avoid cross-platform target conflicts."
  - "Ship updater artifacts via `createUpdaterArtifacts: true` and register updater plugin at runtime."
patterns-established:
  - "Release builds run only on `v*` tags; development builds remain unaffected."
  - "Platform-scoped capabilities isolate macOS-only permission surfaces from Windows/Linux builds."
requirements-completed: [XPLAT-07, XPLAT-08, XPLAT-09, XPLAT-10]
duration: 27 min
completed: 2026-03-01
---

# Phase 08 Plan 03 Summary

**Build/distribution configuration now cleanly targets NSIS on Windows, AppImage on Linux, DMG on macOS, with release-tag CI and updater artifacts wired into the app.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-03-01T15:54:00Z
- **Completed:** 2026-03-01T16:21:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Replaced single `"targets": "all"` bundling with platform-specific configs so each OS builds only its valid installer targets.
- Added macOS-scoped permission capability file and ensured default capability set includes notification permissions.
- Added a GitHub Actions release workflow that builds all desktop platforms from version tags and drafts signed releases.

## Task Commits

Each task was committed atomically:

1. **Task 1: Platform build configuration and capability scoping** - `29096b9` (feat)
2. **Task 2: Create GitHub Actions multi-platform release workflow** - `19c1674` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `src-tauri/tauri.conf.json` - Base macOS target + updater plugin config and updater artifact generation.
- `src-tauri/tauri.windows.conf.json` - Windows NSIS target override.
- `src-tauri/tauri.linux.conf.json` - Linux AppImage target override.
- `src-tauri/capabilities/default.json` - Adds notification default permission.
- `src-tauri/capabilities/macos-permissions.json` - macOS-only permission capability with platform scope.
- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/lib.rs`, `package.json`, `package-lock.json` - Updater runtime dependencies and plugin registration.
- `.github/workflows/release.yml` - Tag-triggered release matrix for macOS/Linux/Windows.

## Decisions Made
- Use release tags (`v*`) as the CI trigger boundary to keep normal development iterations fast.
- Register updater runtime plugin now so generated updater artifacts are actionable from app code.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added updater runtime dependencies and plugin registration**
- **Found during:** Task 1 (platform build configuration)
- **Issue:** Config-only updater setup would generate artifacts but leave updater plugin unavailable at runtime.
- **Fix:** Added `tauri-plugin-updater` and `@tauri-apps/plugin-updater`, then registered updater plugin in `lib.rs`.
- **Files modified:** `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/lib.rs`, `package.json`, `package-lock.json`
- **Verification:** `cargo check --manifest-path src-tauri/Cargo.toml` passes with updater plugin present.
- **Committed in:** `29096b9` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Ensures updater config is operational, not just declarative.

## Issues Encountered
- Tauri config rejected updater bundler values and custom macOS permission IDs initially; corrected to schema-valid targets and permission identifiers.

## User Setup Required

- Generate and set a real updater public key/private key pair (replace placeholder pubkey in `tauri.conf.json` and set signing secrets in GitHub).

## Next Phase Readiness
- Distribution and release pipeline are in place.
- Ready for frontend cross-platform permission and shortcut UX adaptation (08-04).

---
*Phase: 08-cross-platform-hardening*
*Completed: 2026-03-01*
