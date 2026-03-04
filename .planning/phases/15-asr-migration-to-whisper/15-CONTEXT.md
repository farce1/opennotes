# Phase 15: ASR Migration to Whisper - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the dual Parakeet TDT transcription models with a single Whisper Large V3 Turbo model. Add automatic language detection with the detected language displayed on the meeting view. Update the model download wizard for Whisper. Ensure backward compatibility with existing recordings and cross-platform support (macOS, Windows, Linux).

</domain>

<decisions>
## Implementation Decisions

### Language display
- Detected language shown as a metadata label near the meeting title (in the metadata row with date, duration, etc.)
- Text only — no flag emojis (e.g., just "English", "Polish"). Clean and avoids flag-to-language ambiguity
- Always show detected language regardless of confidence level — transparent, no filtering
- Old recordings (Parakeet-transcribed) hide the language field entirely — no "Unknown" label, just absent

### Model download experience
- Wizard fully replaces Parakeet with Whisper — only Whisper Large V3 Turbo is offered, no choice between engines
- Show model file size (e.g., "~1.6 GB") before download starts, then progress bar during download
- Support resumable downloads — if interrupted, next attempt continues from partial file
- For existing users upgrading: prompt to download Whisper on first recording attempt (not on app launch). Contextual, non-intrusive timing

### Migration path for old models
- Auto-remove Parakeet model files after Whisper is confirmed working (successful transcription). Frees disk space silently
- No rollback — clean break. Whisper fully replaces Parakeet. Parakeet code is removed, not kept as a fallback
- Add `asr_engine` column to DB schema to track which engine produced each transcript ('parakeet' for old, 'whisper' for new)
- Existing recordings' transcripts kept as-is — no re-transcription with Whisper. Only new recordings use Whisper

### Transcription progress feedback
- Keep same progress UI as Parakeet — users don't need to know the engine changed
- No change to completion notifications — Phase 14's session-complete flow already covers this
- Generic error messages on failure ('Transcription failed' + retry) — same as before, no engine-specific detail exposed
- Language detection result shown only after transcription completes, not during live progress

### Claude's Discretion
- Exact Whisper model integration approach (library binding, subprocess, etc.)
- Cross-platform build and linking strategy
- Migration script implementation details
- Auto-cleanup timing and safeguards for Parakeet removal

</decisions>

<specifics>
## Specific Ideas

- Migration should be invisible to users — they just notice language detection appearing and everything else works the same
- The upgrade path (prompt on first recording) should feel natural, like the app just needs a quick update, not a disruptive migration
- Tracking `asr_engine` per recording gives future flexibility for debugging and potential future engine changes

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-asr-migration-to-whisper*
*Context gathered: 2026-03-04*
