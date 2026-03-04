---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Speaker Intelligence & Templates
status: roadmap_ready
last_updated: "2026-03-04T18:46:02Z"
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 6
  completed_plans: 6
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** One-click meeting recording that produces structured, actionable meeting notes — entirely local, entirely free.
**Current focus:** Phase 17 — Diarization Core

## Current Position

Phase: 17 of 18 (Diarization Core)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-03-04 — Phase 16 executed and verified (2/2 plans)

Progress: [██████░░░░] 60%

## Performance Metrics

**Velocity:**
- Total plans completed: 6 (v1.2)
- Average duration: 8 min
- Total execution time: 45 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 14 | 2 | 20 min | 10 min |
| 15 | 2 | 21 min | 11 min |
| 16 | 2 | 4 min | 2 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 14 stop flow now transitions to `processing` and returns immediately; DB finalization and FTS moved to async post-processing.
- Post-processing failures persist as `meetings.post_processing_status` and are surfaced on startup for retry UX.
- Phase 15 migrated ASR to Whisper Large V3 Turbo only; Parakeet and Whisper Tiny runtime paths were removed.
- Phase 15 persists `meetings.detected_language` and `meetings.asr_engine` on first detected Whisper segment.
- Phase 15 model download now supports resumable HTTP Range requests for Whisper Turbo archive downloads.
- Phase 15 frontend removed transcription language selection and now displays detected meeting language metadata.
- [Phase 16]: Kept default summary prompt behavior byte-identical when no template is selected — Extracted the existing base prompt into DEFAULT_STANDARD_PROMPT and only switched when template_prompt is provided.
- [Phase 16]: Template prompts are now threaded end-to-end from frontend selection to Rust generation — Added template_prompt argument on generate_summary and run_summary, including chunked synthesis path.
- [Phase 16]: Summary generation now resolves selected templates at call-time and forwards prompt text to backend — MeetingCompleteView uses getTemplateById for regenerate, auto-generate, and model-switch retry paths.

### Pending Todos

- BENCHMARK.md live phi4-mini scores are PENDING — Ollama was unavailable during Phase 13 execution; fixtures/evaluator ready for rerun.

### Blockers/Concerns

- Phase 17 research flag (MEDIUM): OGG/Opus decode pipeline for libopusenc-produced files has no published integration example. Spike required at start of Phase 17 before committing full architecture. Fallback: ffmpeg subprocess.
- Phase 17 research flag: Windows VCRUNTIME DLL bundling with NSIS installer requires clean-VM test — required release gate before shipping diarization on Windows.
- Phase 17 research flag: Confirm which embedding model sherpa-rs 0.6.8 diarize.rs example uses (nemo_en_titanet_small vs. 3dspeaker_speech_eres2net) before downloading models.

## Session Continuity

Last session: 2026-03-04
Stopped at: Phase 16 complete — ready to plan Phase 17
Resume file: None
