# Phase 07: Settings Surface Expansion - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Expand the Settings view from its current 4-section layout (Appearance, About, Storage, Data Management) into a comprehensive configuration surface covering audio/recording, transcription, summary/LLM, and general preferences. All settings persist via the existing Tauri store plugin. This phase does NOT add new core capabilities — it exposes user-facing controls for subsystems built in Phases 02-06.

</domain>

<decisions>
## Implementation Decisions

### Audio & Recording Preferences
- Device picker dropdown for microphone input selection (users with multiple mics/audio interfaces)
- Key recorder field for recording shortcut customization (click field, press combo, it captures)
- Keep 4-hour recording limit fixed — no user override needed
- Default audio source toggle in settings: let users set whether new recordings capture mic only, system audio only, or both by default

### Transcription Controls
- Language selector dropdown for supported Parakeet languages
- Full model management: show model name, size (~640MB), download status, with delete and re-download controls
- Always use best quality — no accuracy vs speed toggle
- Always auto-start transcription with recording — no toggle needed

### Summary/LLM Configuration
- Model picker listing locally installed Ollama models, user chooses which to use for summaries
- Fixed 4-section summary format (Overview, Key Points, Decisions, Action Items) — no section toggles
- Auto-summary toggle in settings: let users choose auto-generate on completion vs manual trigger, default to auto-generate
- Full Ollama management panel: connection status, configurable server URL, test connection, pull/delete models

### Settings Layout & Navigation
- Sidebar tabs layout (left sidebar with section names, content on right) — like macOS System Settings
- Sections grouped by subsystem: General (theme, shortcuts) | Recording (audio, duration) | Transcription (language, model) | Summary (LLM, format) | Data (backup/restore, storage) | About
- Immediate (live) settings application — changes take effect when toggled/selected, no save button
- Global "Reset all settings" button — one reset for everything, not per-section

### Claude's Discretion
- Exact sidebar visual styling and section icons
- Transition animation between settings sections
- How to handle edge cases (Ollama not running, no models available, shortcut conflicts)
- Mobile/responsive considerations for sidebar layout
- Order of settings within each section

</decisions>

<specifics>
## Specific Ideas

- Sidebar tabs should feel like macOS System Settings — clean section list on left, content panel on right
- The existing theme toggle pattern (immediate apply, button group) should inform how other toggles work
- Key recorder for shortcuts is the standard pattern — click field, it says "Press shortcut...", user presses combo, it captures
- Ollama management should surface connection health prominently since the app depends on it for summaries

</specifics>

<deferred>
## Deferred Ideas

- Speaker diarization settings — requires Phase 08+ capability
- Cloud sync of settings across devices — future milestone
- Custom summary prompt templates — could be its own phase for advanced users
- Recording file format selection (Opus/WAV/MP3) — Phase 08 cross-platform consideration

</deferred>

---

*Phase: 07-settings-surface-expansion*
*Context gathered: 2026-02-28*
