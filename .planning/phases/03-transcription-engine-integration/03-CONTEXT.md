# Phase 3: Transcription Engine Integration - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

End-to-end audio-to-text pipeline: Silero VAD segments speech from the Phase 2 audio capture pipeline, Parakeet TDT transcribes completed segments offline, and results stream to the React frontend via Tauri Channel. Includes first-run model download flow (~640 MB). Does NOT include speaker diarization, summarization, or notes library features.

</domain>

<decisions>
## Implementation Decisions

### Live transcript display
- Transcript renders in the main app window only — the floating widget stays minimal (timer + controls)
- New segments appear with a fade-in animation at the bottom of the transcript view
- Each segment shows an elapsed timestamp (e.g., "02:34") — no duration or other metadata
- Transcript view is read-only, locked to bottom — always shows the latest segment, no user scrolling during recording

### Model download experience
- Blocking first-run setup wizard — user cannot record until the ASR model is downloaded
- Minimal copy — "Downloading transcription model..." with progress bar and estimated time, no technical details
- Brief hardware detection mention — one line like "Optimized for your Mac" confirming the right variant is selected
- On download failure: show error message with a "Retry" button. No automatic resume on relaunch

### Transcription status & feedback
- Floating widget shows a subtle "Transcribing" text label when ASR is active alongside the recording timer
- Recording is blocked if the transcription model isn't loaded — don't allow recording to start without a ready model, show clear message directing to setup
- No latency info visible to users — text just appears naturally
- No silence indicator — during long silences the transcript area stays still, recording timer is sufficient feedback

### Recording-to-transcript lifecycle
- Transcription always starts automatically when recording starts — no separate toggle, one-click does everything
- On recording stop: transcript auto-saves and the main window transitions to a "meeting complete" view
- On recording pause: flush any remaining audio in the buffer through transcription, then pause. Ensures no speech lost at pause boundary
- Meeting complete view shows full raw transcript — scrollable segments with timestamps, auto-generated title from date/time, "Copy" and "Export" buttons

### Claude's Discretion
- Fade-in animation timing and easing
- Transcript segment visual styling (font, spacing, timestamp formatting)
- Setup wizard layout and step flow
- Progress bar style and estimated time calculation
- Error message copy and retry UX details
- "Meeting complete" view layout details
- Export format options (Markdown, plain text, etc.)

</decisions>

<specifics>
## Specific Ideas

- Widget stays minimal — the transcript is a main window concern, not a floating widget concern
- "One-click does everything" philosophy — recording and transcription are inseparable
- Setup wizard should feel lightweight, not enterprise — minimal copy, brief hardware mention, get the user recording fast

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-transcription-engine-integration*
*Context gathered: 2026-02-27*
