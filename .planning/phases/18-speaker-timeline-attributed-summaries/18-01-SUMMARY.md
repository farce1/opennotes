---
phase: 18-speaker-timeline-attributed-summaries
plan: 01
subsystem: llm-ui
tags: [rust, llm, diarization, react, timeline]
requires:
  - phase: 16-summary-templates
    provides: template_prompt threading across standard and chunked summary paths
  - phase: 17-diarization-core
    provides: meetings.diarization_status plus speakers table data for roster injection
affects: [summary-generation, transcript-navigation, phase-18-plan-02]
provides:
  - Speaker roster prompt block gated by diarization completion and multi-speaker sessions
  - speaker_roster propagation through run_summary, stream generation, and chunked synthesis
  - Standalone SpeakerTimeline UI component with interactive segments, legend, and tooltip
tech-stack:
  added: []
  patterns:
    - Optional prompt augmentation is threaded as Option<&str> and defaults to byte-identical behavior when absent
    - Timeline segment rendering is memoized to avoid re-render churn from hover tooltip state
key-files:
  created:
    - src/components/SpeakerTimeline.tsx
  modified:
    - src-tauri/src/commands.rs
    - src-tauri/src/llm/mod.rs
key-decisions:
  - "Inject speaker roster before language instructions in both base and synthesis prompts so attribution survives map-reduce summarization."
  - "Hide timeline for single-speaker or zero-duration sessions to avoid low-signal UI noise."
patterns-established:
  - "Summary generation now accepts diarization-derived context as optional prompt enrichment."
  - "Timeline UI uses minimum segment width (0.5%) to keep short speaking turns discoverable."
requirements-completed: [TMPL-07, DIAR-07]
duration: 7 min
completed: 2026-03-04
---

# Phase 18 Plan 01 Summary

**Delivered diarization-aware summary prompting with speaker attribution instructions and a reusable interactive speaker timeline component.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-04T22:14:00Z
- **Completed:** 2026-03-04T22:21:05Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `build_speaker_roster_block` in Tauri commands to query diarization status + speakers and return attribution guidance only for completed multi-speaker meetings.
- Threaded `speaker_roster: Option<&str>` through `run_summary`, stream and chunked prompt builders, and synthesis prompt construction.
- Created `SpeakerTimeline` component with clickable color-coded segments, sticky container, inline legend, hover tooltip, and current-position indicator.
- Preserved existing summary prompt behavior when roster data is unavailable via `unwrap_or_default()` prompt insertion.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add speaker roster injection to Rust LLM prompt pipeline** - `26be7fd` (feat)
2. **Task 2: Create SpeakerTimeline component** - `53f4779` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `src-tauri/src/commands.rs` - Adds diarization-aware speaker roster query and passes roster into summary generation.
- `src-tauri/src/llm/mod.rs` - Adds `speaker_roster` parameter threading and prompt/synthesis roster injection.
- `src/components/SpeakerTimeline.tsx` - Adds standalone interactive timeline widget with legend, tooltip, and position marker.

## Decisions Made

- Used `meetings.diarization_status == "complete"` plus `speakers >= 2` as the strict gate before injecting any attribution roster.
- Kept speaker fallback labels in roster and timeline as `Speaker N` to support unnamed diarization clusters consistently.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed roster status type mismatch after compile validation**
- **Found during:** Task 1 (Rust compile verification)
- **Issue:** Initial SQL scalar typing produced `Option<Option<String>>` and blocked `as_deref()` usage.
- **Fix:** Switched to `query_scalar::<_, String>(...)` with `fetch_optional(...)` to produce `Option<String>`.
- **Files modified:** `src-tauri/src/commands.rs`
- **Verification:** `cd src-tauri && cargo build`
- **Committed in:** `26be7fd` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1: 1)
**Impact on plan:** No scope change; fix was required for Rust compilation correctness.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can now integrate `SpeakerTimeline` in `MeetingCompleteView` and wire timeline click-to-scroll behavior.
- Summary generation pipeline is ready to produce speaker-attributed outputs once speaker labels are available.

## Self-Check: PASSED

---
*Phase: 18-speaker-timeline-attributed-summaries*
*Completed: 2026-03-04*
