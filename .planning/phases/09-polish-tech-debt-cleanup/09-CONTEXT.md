# Phase 09: Polish & Tech Debt Cleanup - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Close 4 specific integration gaps from the v1.0 milestone audit: fix FTS sync on session completion, resolve shortcut double-registration, wire or remove dead settings knobs (preferredMicDevice, transcriptionLanguage), and add in-app update check UI. No new features — only fixing what's broken or disconnected.

</domain>

<decisions>
## Implementation Decisions

### Dead Settings Knobs — preferredMicDevice
- Wire `preferredMicDevice` into the audio capture backend so recordings use the selected mic
- When preferred device is unavailable at recording time: show a brief toast warning ("Preferred mic unavailable, using default") and fall back to system default mic
- Setting changes take effect on next recording start, not mid-recording

### Dead Settings Knobs — transcriptionLanguage
- Keep the existing UI dropdown (English-only with "more languages in future updates" helper text)
- Wire the stored language code through to the Parakeet ASR worker
- Setting changes take effect on next recording start, not mid-recording

### FTS Sync on Session Completion
- Call `fts_upsert` synchronously as part of session stop — index title + transcript text immediately
- Re-upsert the FTS row when summary generation completes, adding summary text to the searchable index
- On app startup, detect meetings missing from the FTS table and backfill them (one-time self-healing migration)

### Shortcut Double-Registration Fix
- Fix the shortcut change flow: unregister old global shortcut before registering the new one
- Changes take effect immediately (no restart required)
- On registration failure: revert to previous shortcut and show a toast ("Could not register shortcut. Reverted to [previous].")
- Recording shortcut is always required — no option to disable it entirely

### Update Check UI
- Add "Check for updates" button in Settings > About section
- Button shows spinner while checking, then inline result: "You're up to date (v1.0.0)" or "Update available: v1.1.0 — Install & restart"
- Add a small badge/dot on the Settings gear icon when an update is available, guiding users to About
- Auto-check for updates on app launch; if update found, show the settings badge silently (no interruption)

### Claude's Discretion
- Shortcut conflict validation approach (what Tauri's API supports for detecting conflicts)
- FTS backfill implementation details (batch size, timing within startup sequence)
- Update badge visual design (dot style, color, animation)
- Toast notification styling and duration

</decisions>

<specifics>
## Specific Ideas

- Mic fallback should be graceful — never block recording because a preferred device is missing
- Update badge should be subtle, not attention-grabbing — small dot on the settings icon
- FTS backfill should be self-healing: runs on every startup but is a no-op when everything is indexed

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-polish-tech-debt-cleanup*
*Context gathered: 2026-03-01*
