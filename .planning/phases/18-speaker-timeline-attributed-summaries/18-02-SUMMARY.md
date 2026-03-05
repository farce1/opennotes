---
phase: 18-speaker-timeline-attributed-summaries
plan: 02
subsystem: ui
tags: [react, timeline, transcript, diarization, ux]
requires:
  - phase: 18-01
    provides: SpeakerTimeline component and speaker_roster-enabled summary pipeline
affects: [meeting-complete-view, speaker-transcript, summary-ux, phase-18-verification]
provides:
  - Timeline integration above speaker transcript for diarized multi-speaker meetings
  - Click-to-scroll transcript navigation and scroll-synced timeline position indicator
  - Naming guidance tip for unnamed speakers to improve attributed summaries
tech-stack:
  added: []
  patterns:
    - Scroll targeting relies on data attributes inside transcript rows instead of maintaining ref maps
    - Timeline visibility is guarded by diarization complete + multi-speaker + positive duration
key-files:
  created: []
  modified:
    - src/components/SpeakerTranscript.tsx
    - src/views/MeetingCompleteView.tsx
key-decisions:
  - "Used nearest elapsed-ms DOM target matching for timeline click navigation to avoid strict index coupling between turns and transcript rows."
  - "Used scroll-mt-20 on transcript rows so sticky timeline does not obscure jump targets."
patterns-established:
  - "MeetingCompleteView owns transcript scroll synchronization state and passes it to SpeakerTimeline as currentElapsedMs."
  - "Summary UX now conditionally nudges speaker naming when diarization labels are still generic."
requirements-completed: [DIAR-07, DIAR-08, TMPL-07]
duration: 5 min
completed: 2026-03-05
---

# Phase 18 Plan 02 Summary

**Integrated the speaker timeline into the meeting transcript workflow with jump-to-position navigation, live scroll indicator tracking, and unnamed-speaker summary guidance.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-05T08:30:00Z
- **Completed:** 2026-03-05T08:34:57Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `data-elapsed-ms` anchors and `scroll-mt-20` offsets in `SpeakerTranscript` to make segment rows reliably scroll-targetable from timeline clicks.
- Integrated `SpeakerTimeline` into `MeetingCompleteView` with `showTimeline` guards based on diarization completion, speaker count, and effective duration.
- Implemented `scrollToElapsedMs` nearest-target lookup + smooth scroll + temporary highlight feedback on timeline segment click.
- Added scroll listener synchronization to update `currentElapsedMs` and drive the timeline position indicator while reading transcript content.
- Added summary-tab naming tip when diarization is complete, all speakers are unnamed, and summary text exists.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add scroll-targeting attributes to SpeakerTranscript** - `84dbba6` (feat)
2. **Task 2: Integrate SpeakerTimeline into MeetingCompleteView with scroll sync and naming tip** - `d8720a6` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `src/components/SpeakerTranscript.tsx` - Adds segment-level elapsed timestamp attributes and sticky offset classes for scroll targeting.
- `src/views/MeetingCompleteView.tsx` - Wires timeline rendering, transcript container ref, click-to-scroll callback, scroll position syncing, and summary naming tip.

## Decisions Made

- Used `meeting.duration_seconds` first and speaker-turn max end as fallback to compute timeline duration defensively.
- Kept non-diarized transcript rendering path unchanged and isolated timeline UX behind `hasSpeakerLayout`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 18 functional scope is implemented end-to-end and ready for verification against DIAR-07, DIAR-08, and TMPL-07.
- Remaining work is phase-level verification and completion updates.

## Self-Check: PASSED

---
*Phase: 18-speaker-timeline-attributed-summaries*
*Completed: 2026-03-05*
