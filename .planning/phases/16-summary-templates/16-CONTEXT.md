# Phase 16: Summary Templates - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can select a meeting type before generating notes, create their own prompt templates, and regenerate with a different template anytime. Covers template picker UI, built-in templates (5), custom template CRUD, regeneration flow, and map-reduce chunking compatibility. Speaker diarization integration is a separate phase (Phase 18).

</domain>

<decisions>
## Implementation Decisions

### Template Picker Design
- Dropdown selector positioned directly above the generate button
- Each option shows template name + short description (e.g. "Action Items Focus — Prioritized action items with owners and deadlines")
- Dropdown grouped with section headers: "Built-in" and "My Templates" with a divider between them

### Custom Template Editor
- Simple textarea approach: name field + prompt textarea + save button
- Editor accessed via modal/dialog triggered by a "+ Create Template" option in the dropdown
- No preview/test before saving — user saves first, then generates to test
- "Manage Templates" link in dropdown footer opens a list view with edit/delete controls for all templates

### Regeneration Flow
- New summary replaces the old one in-place (one summary visible at a time)
- No confirmation needed when regenerating — low-stakes, user can always regenerate again
- Button label changes: "Generate Summary" initially, then "Regenerate" once a summary exists
- Small label above the summary output showing "Generated with: [Template Name]" — dropdown resets to allow quick re-selection

### Built-in Template Output
- Each of the 5 templates produces distinctly different output structures (different headings, sections, emphasis)
- Detail level varies by template to match audience expectations (Executive Summary is brief and scannable; Technical Discussion is detailed and thorough)
- Built-in template prompts are view-only — users can see the prompt for transparency but cannot edit directly; they can duplicate as a custom template for modifications
- "Reset to default" option available on built-in templates (per TMPL-06)

### Default Selection
- Remember last used template — dropdown defaults to whatever template the user last generated with
- First-time default: Standard Meeting Notes (most general-purpose)

### Claude's Discretion
- Loading state/skeleton during summary generation
- Exact spacing, typography, and animation for the dropdown
- How the "Manage Templates" list view is laid out
- Confirmation UX for deleting custom templates
- How to handle the template prompt storage format internally

</decisions>

<specifics>
## Specific Ideas

- 5 built-in templates: Standard Meeting Notes, Action Items Focus, Executive Summary, Technical Discussion, Interview/1:1
- Each built-in template should feel like it was designed for a specific audience (executive vs engineer vs manager)
- The "Generated with: [Template Name]" label creates a clear connection between the picker and the output

</specifics>

<deferred>
## Deferred Ideas

- Speaker diarization in template output (TMPL-07) — Phase 18
- Template sharing/export between users — future consideration

</deferred>

---

*Phase: 16-summary-templates*
*Context gathered: 2026-03-04*
