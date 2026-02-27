# Phase 6: Library + Data Workflows - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Evolve the meeting library from a basic chronological list into a productive workspace for finding, managing, and exporting past recordings. Includes search, filtering, bulk operations, trash/restore, enriched cards, view modes, multi-format export, and full library backup/restore. Does NOT add new recording capabilities, new summary features, or cross-platform changes.

</domain>

<decisions>
## Implementation Decisions

### Search & filtering
- Full-text search across meeting titles AND transcript content (SQLite FTS)
- Search results show snippet previews with matching terms highlighted
- Inline filter chips/pills below the search bar — always visible, quick to toggle
- Four filter dimensions: date range (today/week/month/custom), status (completed/recovered/failed/in-progress), duration (short <15m, medium 15-60m, long >1h), audio source (mic/system/both)

### Meeting management
- Soft delete with trash — deleted meetings move to a "Trash" area, auto-purge after 30 days, manual restore available
- Checkbox-based multi-select with a bulk action bar
- Bulk actions: bulk delete (to trash), bulk export, select all / deselect all
- Inline title rename from the library view — double-click or pencil icon, no need to open the meeting

### Library presentation
- Meetings grouped under date-section headers: "Today", "Yesterday", "This Week", "February 2026", etc.
- Sort options: by date (newest/oldest), duration (longest/shortest), title (A-Z/Z-A) — default: newest first
- Enriched meeting cards: title, date, duration, status badge (current) PLUS summary preview (first 1-2 lines), segment/word count indicator, audio source badge (mic/system/both icon)
- Two view modes with toggle: card view (richer, current style) and compact list view (denser, single-row per meeting)

### Data export & backup
- Four export formats for individual meetings: Markdown (.md), Plain text (.txt), JSON (.json), PDF
- Bulk export packages selected meetings as a ZIP archive of individual files in the chosen format
- Full library backup & restore: export entire DB + audio files as a backup archive, restore from backup file
- Backup/restore controls live in Settings page under "Data Management" — not in the library toolbar

### Claude's Discretion
- SQLite FTS implementation details (FTS5 vs manual LIKE queries)
- Exact filter chip styling and interaction patterns
- Trash view placement (separate tab, filter, or sub-route)
- Date-section header collapsibility
- Compact list column layout
- Backup archive format (zip, tar, custom)
- Progress indicators for backup/restore operations
- Keyboard shortcuts for bulk selection

</decisions>

<specifics>
## Specific Ideas

- Current LibraryView already has card-based layout with status badges — extend rather than rewrite
- Summary preview requires joining meetings table with summary data — consider performance for large libraries
- Bulk export ZIP should use the same per-meeting export logic as individual export (consistency)
- Backup/restore is a power-user feature — keep UI minimal, place in Settings

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-library-data-workflows*
*Context gathered: 2026-02-28*
