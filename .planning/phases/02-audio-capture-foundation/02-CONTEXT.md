# Phase 02: Audio Capture Foundation - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Capture system audio and microphone input on macOS for meeting recording. Deliver the audio capture pipeline, floating recording widget, and permission handling. Transcription, summarization, and recording orchestration are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Recording experience
- Floating mini widget appears when recording starts (always-on-top)
- Widget is draggable — starts top-center, user can reposition, remembers last position
- Widget shows: elapsed duration, live audio level waveform, pause/resume button, stop button
- Recording starts immediately on tray icon click or global shortcut press — no pre-record screen
- Widget disappears when recording stops

### Audio format & quality
- Save recordings as Opus/OGG compressed format (~1MB/min, good speech quality)
- Soft warning notification at 2 hours in case user forgot to stop — no hard limit
- No artificial recording cap

### macOS permissions flow
- Request permissions just-in-time on first recording attempt, not during onboarding
- Show a brief pre-explanation before the OS Screen Recording permission dialog ("We need Screen Recording access to capture meeting audio from apps like Zoom/Meet")
- If permission denied: inline guidance in the widget/app explaining what's needed + button to open System Settings directly
- Check permission status on each app launch; show subtle indicator (mic check, system audio check) in tray menu or settings so user knows they're ready to record

### Claude's Discretion
- Track separation strategy (separate channels vs mixed) — optimize for downstream transcription/diarization
- Storage chunking strategy (single file vs segments) — balance reliability with simplicity
- Waveform visualization implementation details
- Widget sizing, styling, and animation
- Audio sample rate and Opus encoding parameters
- Error state handling during recording (device disconnect, etc.)

</decisions>

<specifics>
## Specific Ideas

- One-click recording is the core UX promise — "one-click meeting recording" is the project tagline
- Widget should feel like the macOS screen recording indicator — small, unobtrusive, professional
- Permission pre-explanation is important because "Screen Recording" sounds unrelated to audio capture — users need to understand why

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-audio-capture-foundation*
*Context gathered: 2026-02-27*
