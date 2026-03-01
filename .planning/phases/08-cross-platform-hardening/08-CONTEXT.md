# Phase 08: Cross-Platform Hardening - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend openNotes from macOS-only to full Windows 10+ and Linux support. Covers platform-specific audio capture backends, native library linking (sherpa-onnx binaries per platform), CI/CD multi-platform build pipelines, installer packaging, and OS-adaptive UX (shortcuts, permissions, tray, model storage paths). Does NOT add new features, new recording capabilities, or new summary/transcription functionality — the existing feature set is ported to work correctly on all three platforms.

</domain>

<decisions>
## Implementation Decisions

### Target platforms
- Windows 10+ and Linux, both equal priority — neither is a stretch goal
- Both must be polished and working before phase is considered complete
- macOS remains the primary development platform; Windows and Linux are full-class citizens

### System audio capture
- Windows: WASAPI loopback (captures all desktop audio, not per-app) — acceptable
- Linux: PipeWire primary with PulseAudio compatibility layer for older systems
- Auto-detect best capture method per platform — user just hits record, no manual selection
- Fallback: mic-only mode when system audio isn't available — app still works, user sees a clear message explaining the limitation
- Guided permission flow on first recording attempt — detect missing permissions and show platform-specific step-by-step guide

### Build & distribution
- Windows: NSIS installer (.exe) — Tauri's default bundler
- Linux: AppImage — single portable binary, no installation needed
- CI/CD: build all platforms on release tags only — dev builds stay macOS-only for speed
- Built-in auto-update via Tauri's updater plugin on both Windows (NSIS) and Linux (AppImage)

### Platform UX
- System tray and floating widget: match macOS behavior across platforms — consistent UX, adapted to OS-specific tray APIs
- Keyboard shortcuts: Ctrl replaces Cmd (Cmd+Shift+R becomes Ctrl+Shift+R) — standard convention
- Visual theme: consistent across all platforms — openNotes has its own design language, no need to mimic native OS chrome
- First-run model download: reuse existing setup wizard, detect platform to select correct sherpa-onnx binaries, store models in OS-appropriate directories (AppData on Windows, XDG on Linux)

### Claude's Discretion
- Exact WASAPI loopback implementation details
- PipeWire vs PulseAudio runtime detection logic
- CI/CD provider choice and workflow structure
- Platform-specific file path conventions for app data
- How to handle edge cases (e.g., missing audio devices, PipeWire not installed)

</decisions>

<specifics>
## Specific Ideas

- Audio capture should "just work" — auto-detection, no manual configuration needed
- Permissions should be guided, not just an error message — step-by-step per platform
- App should look identical across platforms (same design language, not native OS widgets)
- Model downloads use the same wizard UX with platform-aware binary selection and storage paths

</specifics>

<deferred>
## Deferred Ideas

- Recording file format selection (Opus/WAV/MP3) — noted from Phase 07 context as a cross-platform consideration, but not in scope for this phase
- Per-app audio capture on Windows 11 — experimental APIs, could revisit in a future enhancement phase
- Flatpak packaging for Linux — sandboxing complicates PipeWire audio access, could be a follow-up
- .deb/.rpm packages for Linux — AppImage covers the universal case; distro-specific packages are future work

</deferred>

---

*Phase: 08-cross-platform-hardening*
*Context gathered: 2026-03-01*
