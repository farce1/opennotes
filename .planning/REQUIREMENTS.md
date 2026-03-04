# Requirements: openNotes

**Defined:** 2026-03-04
**Core Value:** One-click meeting recording that produces structured, actionable meeting notes — entirely local, entirely free.

## v1.2 Requirements

Requirements for v1.2 Speaker Intelligence & Templates. Each maps to roadmap phases.

### Post-Recording Performance

- [ ] **STOP-01**: User sees immediate UI response when stopping a recording (no freeze)
- [ ] **STOP-02**: Post-recording processing (audio flush, DB finalization, FTS update) runs asynchronously in background
- [ ] **STOP-03**: User sees a processing indicator while post-recording work completes
- [ ] **STOP-04**: User receives a session-complete event when all post-recording work finishes
- [ ] **STOP-05**: 4-hour auto-stop triggers the same async stop path without UI freeze

### Speaker Diarization

- [ ] **DIAR-01**: App downloads speaker diarization models on first use via existing model wizard pattern
- [ ] **DIAR-02**: After recording stops, user can trigger speaker diarization on the recorded audio
- [ ] **DIAR-03**: User sees diarization progress (e.g., "Analyzing speakers... 60%")
- [ ] **DIAR-04**: Transcript segments display speaker labels (Speaker 1, Speaker 2, etc.)
- [ ] **DIAR-05**: User can rename speaker labels to real names within a session (click-to-edit)
- [ ] **DIAR-06**: Renamed speaker labels propagate to all segments with that speaker in the session
- [ ] **DIAR-07**: User can view an interactive speaker timeline showing who spoke when
- [ ] **DIAR-08**: User can click a timeline segment to jump to that position in the transcript
- [ ] **DIAR-09**: User can see per-speaker talk-time statistics (percentage of total)
- [ ] **DIAR-10**: Diarization runs on a dedicated thread without blocking Ollama or UI
- [ ] **DIAR-11**: Diarization works cross-platform (macOS, Windows, Linux)

### Summary Templates

- [ ] **TMPL-01**: User can select a summary template before generating a summary
- [ ] **TMPL-02**: App ships with built-in templates for common meeting types (research-informed selection, ~5-6 templates)
- [ ] **TMPL-03**: User can re-generate a summary with a different template
- [ ] **TMPL-04**: User can create custom summary templates with a prompt editor
- [ ] **TMPL-05**: User can edit and delete custom templates
- [ ] **TMPL-06**: Built-in templates cannot be deleted but can be customized (reset to default available)
- [ ] **TMPL-07**: When diarization data is available, summary prompt includes speaker names for attributed output
- [ ] **TMPL-08**: Template system works with the existing map-reduce chunking for long meetings (2+ hours)

### ASR Migration

- [ ] **ASR-01**: Transcription uses Whisper Large V3 Turbo as the single ASR model (replacing dual Parakeet TDT)
- [ ] **ASR-02**: Whisper automatically detects the spoken language (English, Polish, and other supported languages)
- [ ] **ASR-03**: User can see which language was detected for a recording
- [ ] **ASR-04**: Model download wizard handles Whisper Large V3 Turbo model download
- [ ] **ASR-05**: Existing recordings remain accessible (backward-compatible DB schema)
- [ ] **ASR-06**: Whisper migration works cross-platform (macOS, Windows, Linux)

## Future Requirements

Deferred to future releases. Tracked but not in current roadmap.

### Real-Time Diarization

- **RTDIAR-01**: Speaker labels appear during live recording
- **RTDIAR-02**: Real-time speaker switching detection

### Speaker Recognition

- **SPREC-01**: Persistent voice profiles across sessions
- **SPREC-02**: Auto-identification of returning speakers

### Advanced Editing

- **EDIT-01**: Inline transcript editor for correcting diarization errors
- **EDIT-02**: Segment-level speaker reassignment

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time diarization during recording | Requires streaming diarization model (not available in Rust); post-processing is standard approach |
| Persistent speaker voice profiles | Biometric identity system with privacy implications; v2+ feature |
| Inline transcript editor | Rich text editing with speaker-span awareness; enormous complexity for v1.2 |
| Auto meeting type detection | Requires pre-processing LLM call (doubles latency); manual template selection is simpler |
| Multiple simultaneous summaries | Doubles Ollama invocations; significant schema change; re-generate covers 90% of use case |
| SRT/VTT subtitle export | Audio-only app; no video file to attach subtitles to |
| Cloud-based ASR fallback | Local-only is core value proposition |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (populated by roadmapper) | | |

**Coverage:**
- v1.2 requirements: 30 total
- Mapped to phases: 0
- Unmapped: 30

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after initial definition*
