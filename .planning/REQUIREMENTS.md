# Requirements: openNotes

**Defined:** 2026-03-04
**Core Value:** One-click meeting recording that produces structured, actionable meeting notes — entirely local, entirely free.

## v1.2 Requirements

Requirements for v1.2 Speaker Intelligence & Templates. Each maps to roadmap phases.

### Post-Recording Performance

- [x] **STOP-01**: User sees immediate UI response when stopping a recording (no freeze)
- [x] **STOP-02**: Post-recording processing (audio flush, DB finalization, FTS update) runs asynchronously in background
- [x] **STOP-03**: User sees a processing indicator while post-recording work completes
- [x] **STOP-04**: User receives a session-complete event when all post-recording work finishes
- [x] **STOP-05**: 4-hour auto-stop triggers the same async stop path without UI freeze

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

- [x] **TMPL-01**: User can select a summary template before generating a summary
- [x] **TMPL-02**: App ships with built-in templates for common meeting types (research-informed selection, ~5-6 templates)
- [x] **TMPL-03**: User can re-generate a summary with a different template
- [x] **TMPL-04**: User can create custom summary templates with a prompt editor
- [x] **TMPL-05**: User can edit and delete custom templates
- [x] **TMPL-06**: Built-in templates cannot be deleted but can be customized (reset to default available)
- [ ] **TMPL-07**: When diarization data is available, summary prompt includes speaker names for attributed output
- [x] **TMPL-08**: Template system works with the existing map-reduce chunking for long meetings (2+ hours)

### ASR Migration

- [x] **ASR-01**: Transcription uses Whisper Large V3 Turbo as the single ASR model (replacing dual Parakeet TDT)
- [x] **ASR-02**: Whisper automatically detects the spoken language (English, Polish, and other supported languages)
- [x] **ASR-03**: User can see which language was detected for a recording
- [x] **ASR-04**: Model download wizard handles Whisper Large V3 Turbo model download
- [x] **ASR-05**: Existing recordings remain accessible (backward-compatible DB schema)
- [x] **ASR-06**: Whisper migration works cross-platform (macOS, Windows, Linux)

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
| STOP-01 | Phase 14 | Complete |
| STOP-02 | Phase 14 | Complete |
| STOP-03 | Phase 14 | Complete |
| STOP-04 | Phase 14 | Complete |
| STOP-05 | Phase 14 | Complete |
| ASR-01 | Phase 15 | Complete |
| ASR-02 | Phase 15 | Complete |
| ASR-03 | Phase 15 | Complete |
| ASR-04 | Phase 15 | Complete |
| ASR-05 | Phase 15 | Complete |
| ASR-06 | Phase 15 | Complete |
| TMPL-01 | Phase 16 | Complete |
| TMPL-02 | Phase 16 | Complete |
| TMPL-03 | Phase 16 | Complete |
| TMPL-04 | Phase 16 | Complete |
| TMPL-05 | Phase 16 | Complete |
| TMPL-06 | Phase 16 | Complete |
| TMPL-08 | Phase 16 | Complete |
| DIAR-01 | Phase 17 | Pending |
| DIAR-02 | Phase 17 | Pending |
| DIAR-03 | Phase 17 | Pending |
| DIAR-04 | Phase 17 | Pending |
| DIAR-05 | Phase 17 | Pending |
| DIAR-06 | Phase 17 | Pending |
| DIAR-09 | Phase 17 | Pending |
| DIAR-10 | Phase 17 | Pending |
| DIAR-11 | Phase 17 | Pending |
| DIAR-07 | Phase 18 | Pending |
| DIAR-08 | Phase 18 | Pending |
| TMPL-07 | Phase 18 | Pending |

**Coverage:**
- v1.2 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after Phase 16 completion*
