# Phase 17: Diarization Core - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Post-recording speaker diarization: Rust backend identifies speakers in recorded audio, labels every transcript segment with a speaker identity, allows per-session speaker renaming, and displays per-speaker talk-time statistics. Interactive speaker timeline and speaker-attributed summaries are Phase 18.

</domain>

<decisions>
## Implementation Decisions

### Trigger & progress flow
- Settings toggle for auto-diarize (default: off). When off, user triggers manually; when on, diarization runs automatically after transcription completes
- Show diarization results even if only 1 speaker detected, with option to retry
- No pre-analysis warning — just run and show whatever is found

### Speaker labels in transcript
- Sidebar column layout (chat-style) — speaker name in a left column alongside segments
- Group consecutive segments from the same speaker under one label (chat bubble style)
- Each speaker gets a distinct color from a palette
- No speaker column shown before diarization runs — transcript displays full-width as today; column appears after diarization completes and layout shifts to chat-style

### Speaker renaming UX
- Click speaker label opens a popover with: rename text field, speaker color swatch, talk-time percentage, segment count
- Renaming is session-only — no cross-session speaker profiles or recognition
- Instant propagation: type name, press Enter, all segments update immediately (no confirmation dialog)

### Talk-time statistics
- Collapsible panel above the transcript showing all speakers
- Expanded by default after diarization completes
- Each speaker shown as a card: name, color, percentage, progress bar, and actual duration (e.g., "12m 34s")

### Claude's Discretion
- Diarize button placement in the meeting detail UI
- Progress indicator style while diarization runs
- Exact speaker color palette
- Error state handling and retry UI

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-diarization-core*
*Context gathered: 2026-03-04*
