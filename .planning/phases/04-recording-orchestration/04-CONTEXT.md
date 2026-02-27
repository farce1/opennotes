# Phase 04: Recording Orchestration - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Unify the recording + transcription lifecycle into a coordinated session manager with state persistence, crash recovery, and resilient handling of edge cases (long recordings, subsystem failures). Currently `start_recording()` and `start_transcription()` are separate frontend calls, state only persists at meeting completion, and app crashes lose all in-progress data. This phase makes the recording pipeline robust and production-ready.

</domain>

<decisions>
## Implementation Decisions

### Session Lifecycle
- Single unified `start_session()` command that atomically starts audio capture + transcription as one unit — frontend no longer manages subsystem timing
- If transcription crashes mid-recording, audio capture continues — user is notified via a warning badge on the recording widget (non-intrusive, no toast)
- Stop is graceful with ~3 second timeout — UI shows brief "Saving..." state; if finalization exceeds timeout, force-stop and save what we have
- Pause/resume propagate across all subsystems as a single coordinated action

### Crash Resilience
- Auto-recover silently on app relaunch — detect incomplete sessions, salvage audio file + checkpointed segments, create meeting record with status='recovered', show in library
- Re-transcription from saved audio file available on demand — show a "Re-transcribe" button on recovered meetings (not automatic)
- Checkpoint frequency: Claude's discretion on how aggressively to persist transcript segments during recording
- Session state persistence mechanism (sidecar file vs DB-only): Claude's discretion on most robust approach

### Long Recording Handling
- Hard limit at 4 hours — auto-stop with countdown timer visible in the widget during the last 5 minutes
- Soft warning at 2 hours (already exists) remains
- Stream transcript segments to SQLite during recording, keep only last ~50 segments in React state for display — scroll-back loads from DB on demand
- Audio file splitting strategy: Claude's discretion based on Opus/OGG characteristics

### Recording Metadata
- Create meeting database record immediately on session start with status='recording' — enables crash recovery and library visibility
- Keep date-based auto-titling ("Meeting — {date/time}") — smart titling from transcript content deferred to Phase 5 (Notes/Summary Pipeline)
- Status transitions: recording → paused → completed, plus 'recovered' for crash recovery
- Track which audio sources were active (mic, system audio, or both) as metadata on the meeting record

### Claude's Discretion
- Checkpoint frequency for transcript segments during recording (every segment vs batched)
- Session state persistence mechanism (sidecar JSON file vs database-only)
- Audio file splitting for long recordings (single file vs hourly chunks)
- Exact "Saving..." UI implementation during graceful stop
- Error recovery internals and retry strategies
- Widget warning badge design for degraded transcription state

</decisions>

<specifics>
## Specific Ideas

- The countdown timer in the widget for the last 5 minutes before auto-stop should feel like a gentle nudge, not an alarm
- Recovered meetings should be indistinguishable from normal ones in the library (except for a subtle indicator if transcript is partial)
- The unified session should feel instant to the user — no perceptible delay from coordinating subsystems

</specifics>

<deferred>
## Deferred Ideas

- Smart auto-titling from transcript content — Phase 5 (Notes/Summary Pipeline) where LLM processing is available
- Background/daemon recording when app is closed — future consideration
- Batch re-transcription of multiple recordings — future consideration

</deferred>

---

*Phase: 04-recording-orchestration*
*Context gathered: 2026-02-27*
