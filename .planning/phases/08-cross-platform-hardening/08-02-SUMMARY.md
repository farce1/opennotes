---
phase: 08-cross-platform-hardening
plan: 02
subsystem: audio
tags: [cpal, wasapi, pipewire, pulseaudio, ollama, detection]
requires:
  - phase: 08-01
    provides: Cross-platform path and plugin groundwork for runtime parity
provides:
  - Windows WASAPI loopback capture path
  - Linux monitor-source loopback capture path
  - Cross-platform Ollama binary detection on macOS/Windows/Linux
affects: [recording-runtime, setup-readiness, summary-pipeline]
tech-stack:
  added: []
  patterns: [Per-OS loopback implementations with cfg gates, install detection by platform]
key-files:
  created: []
  modified:
    - src-tauri/src/audio/capture.rs
    - src-tauri/src/llm/detect.rs
key-decisions:
  - "Windows loopback uses cpal WASAPI host with build_input_stream on default output device."
  - "Linux loopback chooses monitor input devices by name match and falls back to mic-only when absent."
patterns-established:
  - "Loopback backends return Option<BuiltStream>; None keeps existing mic-only fallback behavior."
  - "Ollama install checks combine known install paths with PATH command probes per platform."
requirements-completed: [XPLAT-04, XPLAT-05, XPLAT-06]
duration: 16 min
completed: 2026-03-01
---

# Phase 08 Plan 02 Summary

**System-audio capture is now implemented for Windows and Linux, and Ollama installed checks now work across all desktop target platforms.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-01T15:38:00Z
- **Completed:** 2026-03-01T15:54:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `#[cfg(target_os = "windows")]` loopback stream construction using WASAPI and default output device capture.
- Added `#[cfg(target_os = "linux")]` loopback stream construction that discovers monitor sources (PipeWire/PulseAudio compatibility path).
- Replaced non-macOS Ollama installed stub with Windows and Linux binary/path detection logic.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement Windows and Linux loopback audio capture** - `20678cb` (feat)
2. **Task 2: Extend Ollama binary detection to Windows and Linux** - `c1d9b03` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `src-tauri/src/audio/capture.rs` - Adds Windows/Linux `build_loopback_stream` implementations and improves loopback config fallback logic.
- `src-tauri/src/llm/detect.rs` - Adds `check_ollama_binary_exists()` with macOS/Windows/Linux-specific logic.

## Decisions Made
- Linux capture relies on monitor-source discovery via input devices (`monitor` substring) rather than a dedicated loopback API.
- Windows and Linux detection both include command-based fallback checks (`where`, `which`) for PATH-installed binaries.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None (Rust build/check passed after implementation).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Runtime audio and model detection behavior is ready for platform packaging and release pipeline work (08-03).

---
*Phase: 08-cross-platform-hardening*
*Completed: 2026-03-01*
