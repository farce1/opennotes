# Phase 14: Post-Recording Performance - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the stop-recording action non-blocking. When the user clicks Stop (or 4-hour auto-stop fires), the UI unfreezes immediately and all post-recording work (audio flush, DB finalization, FTS index update) completes in the background. User gets notified when done. No transcript data loss compared to the previous blocking path.

</domain>

<decisions>
## Implementation Decisions

### Processing indicator
- Inline in the meeting view, positioned where/near the recording widget was
- Shows named stages as processing progresses: "Flushing audio...", "Updating database...", "Indexing transcript..."
- When user navigates away from the meeting page, a compact global indicator persists (sidebar or top bar) so they still know processing is ongoing
- Not dismissible — stays visible until processing completes or fails

### Completion notification
- Dual notification: in-app toast when the app is focused, OS-level system notification when the app is in the background
- Actionable — includes a "View meeting" link/button; clicking the system notification opens the app to that meeting
- If user is still on the meeting page: inline indicator transitions to a green checkmark + "Processing complete", holds for 2-3 seconds, then fades out
- Minimal content — just confirms completion, no summary stats (meeting page has all details)

### Stop transition
- Recording widget transforms in-place into the processing indicator (smooth morph/shrink, no jarring disappear-reappear)
- Stop button shows immediate pressed/disabled state before the transition begins (standard button feedback)
- User can start a new recording while the previous one is still processing in the background
- Auto-stop (4-hour limit) shows the reason: "Auto-stopped (4h limit) — Finishing up..." so the user knows why it stopped

### Background failure handling
- Failed processing shows as an inline error banner on the meeting page with a "Retry" button; persistent until resolved
- Auto-retry once silently before surfacing the error to the user (handles transient issues)
- Partial success: meeting is accessible with whatever data was saved; shows a warning "Some processing incomplete — Retry"
- Failure state persists in DB across app restarts — next launch shows the error banner with retry option

### Claude's Discretion
- Exact animation/transition timing and easing
- Global indicator placement (sidebar vs top bar) based on existing app layout
- Internal pipeline step ordering and parallelization
- Error banner styling and wording details

</decisions>

<specifics>
## Specific Ideas

- Recording widget should morph into the processing state, not vanish and reappear as a separate element
- Named processing stages give users confidence that work is progressing (not just a generic spinner)
- Auto-stop transparency: user should always know WHY a recording stopped

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-post-recording-performance*
*Context gathered: 2026-03-04*
