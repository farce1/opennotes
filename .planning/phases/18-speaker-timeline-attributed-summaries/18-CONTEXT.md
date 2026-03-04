# Phase 18: Speaker Timeline & Attributed Summaries - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can visualize who spoke when on an interactive horizontal timeline in the completed meeting view, click timeline segments to jump to transcript positions, and get summaries that name speakers directly. Depends on Phase 16 (Summary Templates) and Phase 17 (Diarization Core).

</domain>

<decisions>
## Implementation Decisions

### Timeline visual design
- Auto-assigned distinct colors from a predefined palette per speaker — consistent across timeline and transcript
- Single horizontal bar with colored segments spanning the recording duration (stacked bar chart style) — compact and scannable
- Positioned above the transcript in a sticky/fixed position — always visible as user scrolls
- Inline legend alongside the timeline showing colored dots with speaker names — no extra click needed

### Timeline interaction
- Clicking a segment smooth-scrolls the transcript to the corresponding timestamp and briefly highlights the target line
- Hovering over a segment shows a tooltip with speaker name + time range (e.g., "Alice — 2:15–3:42")
- No zoom/pan — full recording always visible in the timeline bar regardless of length
- Thin vertical position indicator on the timeline tracks the user's current scroll position in the transcript

### Speaker attribution in summaries
- Bold name prefix format: **Alice**: proposed moving the deadline — scannable, markdown-native
- Unnamed speakers use numbered labels: "Speaker 1", "Speaker 2" — user can rename in diarization UI from Phase 17
- Attribute speakers where meaningful: action items, decisions, key points get speaker names; general overview sections stay narrative
- For map-reduce chunking (long meetings): include full speaker roster in each chunk's LLM prompt so attribution stays consistent across chunks

### Edge states
- No diarization data: hide timeline entirely — meeting view looks the same as before Phase 18
- Single-speaker recordings: hide timeline — a single-color bar adds no information
- Very short segments (< 2 seconds): enforce minimum visual pixel width so they remain visible and clickable
- When speakers are unnamed: include a subtle hint in the summary header (e.g., "Tip: Name your speakers in the transcript view for better summaries")

### Claude's Discretion
- Exact color palette selection and contrast ratios
- Timeline bar height, padding, and responsive sizing
- Smooth scroll duration and highlight animation
- Tooltip styling and positioning
- Minimum segment pixel width threshold
- How position indicator syncs with transcript scroll events

</decisions>

<specifics>
## Specific Ideas

- Timeline should feel like a waveform overview you'd see in audio editors — a compact visual summary of the whole recording
- Speaker colors should be distinct enough to tell apart at a glance, even with 4-5 speakers
- The click-to-scroll should feel like clicking a timestamp link — immediate and precise
- Summary attribution should read naturally, not like a chat log

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-speaker-timeline-attributed-summaries*
*Context gathered: 2026-03-04*
