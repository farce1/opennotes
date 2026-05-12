---
phase: 19-release-critical-config-packaging-blockers
plan: "06"
subsystem: consent-security
tags:
  - frontend
  - tauri
  - consent
  - security
  - macos
  - onboarding
dependency_graph:
  requires:
    - "19-01 (pure-rust-archive-extraction — Rust backend pattern established)"
  provides:
    - "ONBOARD-04: Ollama auto-install explicit consent gate (two-layer: frontend modal + backend guard)"
    - "get_ollama_download_metadata Tauri command for HEAD-resolved download size"
    - "OllamaConsentModal React component (reusable consent dialog)"
  affects:
    - "src-tauri/src/llm/setup.rs — auto_setup_ollama now requires user_consented=true"
    - "src/contexts/OllamaSetupContext.tsx — autoSetup flow gated on macOS consent"
    - "src/views/SetupView.tsx — renders consent modal from context state"
tech_stack:
  added:
    - "@testing-library/react@16.3.2 (devDep — RTL for context hook tests)"
    - "@testing-library/dom@10.4.1 (devDep)"
    - "jsdom@29.1.1 (devDep — vitest DOM environment for .tsx tests)"
  patterns:
    - "Rust pure-function extraction (check_consent) for unit-testable consent guard"
    - "Promise<boolean> suspension pattern for modal-controlled async flow"
    - "React portal for top-level modal layering (createPortal to document.body)"
    - "Vitest projects config for per-file-glob environment selection"
key_files:
  created:
    - src/components/OllamaConsentModal.tsx
    - src/contexts/OllamaSetupContext.test.tsx
  modified:
    - src-tauri/src/llm/setup.rs
    - src-tauri/src/commands.rs
    - src-tauri/src/lib.rs
    - src/contexts/OllamaSetupContext.tsx
    - src/views/SetupView.tsx
    - vite.config.ts
    - package.json
decisions:
  - "check_consent extracted as pub(crate) pure function so it can be unit-tested without a real Tauri Channel (requires running App context)"
  - "user_consented: Option<bool> in commands.rs wrapper (unwrap_or(false)) so a missing field returns structured consent_required error instead of Tauri parse error"
  - "Promise<boolean> resolver ref pattern for suspending autoSetup until modal resolves (avoids state machine complexity)"
  - "@testing-library/react was NOT in devDeps — added as part of this plan (plan note: document whether it was pre-existing or added)"
  - "vitest projects config (not environmentMatchGlobs — removed in vitest 4.0) for jsdom/node split"
  - "formatBytes duplicated in OllamaConsentModal rather than shared — plan note says refactor to src/lib/format.ts in Phase 21 ONBOARD-01 polish"
metrics:
  duration: "~35 minutes"
  completed: "2026-05-12"
  tasks_completed: 4
  files_changed: 9
---

# Phase 19 Plan 06: Ollama Consent Dialog Summary

Explicit-consent dialog before auto-installing Ollama on macOS: two-layer defense (frontend modal + Rust backend guard) with HEAD-resolved metadata display, decline→manual-install path, and RTL-based consent flow tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Backend: user_consented guard + get_ollama_download_metadata | 8e1d422 | setup.rs, commands.rs, lib.rs |
| 2 | Create OllamaConsentModal.tsx | 970a149 | src/components/OllamaConsentModal.tsx |
| 3 | Refactor OllamaSetupContext + SetupView | 2efe058 | OllamaSetupContext.tsx, SetupView.tsx |
| 4 | Add ONBOARD-04 consent flow tests | a014a8d | OllamaSetupContext.test.tsx, vite.config.ts, package.json |

## What Was Built

### Backend (Rust)

`src-tauri/src/llm/setup.rs`:
- `check_consent(user_consented: bool) -> Result<(), OllamaSetupEvent>` — pure helper returning `Err(OllamaSetupEvent::Error { stage: "consent_required", ... })` when not consented
- `auto_setup_ollama` gains `user_consented: bool` as 4th parameter; calls `check_consent` as first action (defense-in-depth D-25)
- `OllamaDownloadMetadata { source_domain, download_url, size_bytes }` struct
- `resolve_download_metadata()` — macOS returns full URL + HEAD-resolved size (5s timeout); non-macOS returns empty url + None size; never returns Err
- `head_size_with_timeout` private helper (macOS-only)
- `consent_guard_tests` module: 3 unit tests covering false/true/combined behavioral paths

`src-tauri/src/commands.rs`:
- `auto_setup_ollama` gains `user_consented: Option<bool>` (unwrap_or(false) — fail closed)
- New `get_ollama_download_metadata` command (always returns Ok)

`src-tauri/src/lib.rs`:
- `commands::get_ollama_download_metadata` registered in `generate_handler!`

### Frontend (TypeScript / React)

`src/components/OllamaConsentModal.tsx` (150 lines, new):
- Portal-rendered modal (createPortal to document.body)
- ARIA: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- Three labeled fields: source domain, download URL (code-styled, break-all), byte size (formatBytes or "Unknown")
- Two buttons: "Use manual install instead" (onDecline), "Download & Install Ollama" (onConfirm, autoFocus)
- Escape key + backdrop click → onDecline (safe default)
- i18n via `useTranslation('setup')` with `ai_consentModal_*` keys + English defaultValues

`src/contexts/OllamaSetupContext.tsx`:
- New `ConsentModalData` type
- Added `consentModalOpen`, `consentModalData` state; `consentResolverRef` ref
- `autoSetup` refactored: on macOS, fetches metadata → opens modal → awaits Promise resolver → decline opens manual URL + returns; confirm proceeds with `userConsented: true`
- `consent_required` error stage handled in channel onmessage (defense-in-depth message)
- `resolveConsent(consented: boolean)` callback exposed via context
- Context type interface updated with 3 new fields

`src/views/SetupView.tsx`:
- Imports `OllamaConsentModal`
- Destructures `consentModalOpen`, `consentModalData`, `resolveConsent` from `useOllamaSetup()`
- Renders `<OllamaConsentModal>` conditionally when `consentModalData` is non-null

`src/contexts/OllamaSetupContext.test.tsx` (154 lines, new):
- 4 tests: macOS-opens-modal, confirm-invokes-with-userConsented:true, decline-opens-manual-URL, non-macOS-no-modal
- Mocks: `@tauri-apps/api/core`, `@tauri-apps/plugin-shell`, `../lib/platform`, `react-i18next`, `../lib/settings`
- Uses `@testing-library/react` `renderHook` + `act` + `waitFor`

`vite.config.ts`:
- Added `test.projects` config: `.tsx` → jsdom, `.ts`/`.mjs` → node (vitest 4.0 `projects` replaces removed `environmentMatchGlobs`)

## i18n Keys Introduced

All in `'setup'` namespace, prefix `ai_consentModal_`. **English-only in Phase 19. Polish parity must be added in Phase 21 ONBOARD-05.**

| Key | English Default |
|-----|----------------|
| `ai_consentModal_title` | "Download and install Ollama?" |
| `ai_consentModal_description` | "openNotes will download the official Ollama installer from the address below and run it on your Mac. You can review the details before continuing." |
| `ai_consentModal_sourceDomainLabel` | "Source domain" |
| `ai_consentModal_downloadUrlLabel` | "Download URL" |
| `ai_consentModal_sizeLabel` | "Download size" |
| `ai_consentModal_sizeUnknown` | "Unknown" |
| `ai_consentModal_confirmButton` | "Download & Install Ollama" |
| `ai_consentModal_declineButton` | "Use manual install instead" |
| `ai_consentModal_declineHint` | "Prefer to install yourself? We'll open ollama.com/download in your browser." |
| `ai_consentModal_downloadUrlUnavailable` | "Not available on this platform" |

## Testing Library Status

`@testing-library/react` was **NOT** pre-existing in devDependencies — it was added as part of this plan (`@testing-library/react@16.3.2`, `@testing-library/dom@10.4.1`, `jsdom@29.1.1`).

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written, with one minor deviation:

**1. [Rule 1 - Bug] Fixed clippy needless_return warning**
- **Found during:** Task 1 (cargo clippy)
- **Issue:** `return OllamaDownloadMetadata { ... }` in `resolve_download_metadata` triggered `clippy::needless_return`
- **Fix:** Removed `return` keyword (expression form in final position)
- **Files modified:** src-tauri/src/llm/setup.rs
- **Commit:** 8e1d422 (fixed within the same task commit after second clippy run)

**2. [Rule 3 - Blocking] vitest 4.0 removed environmentMatchGlobs**
- **Found during:** Task 4 (test environment config)
- **Issue:** `environmentMatchGlobs` was removed in vitest 4.0; initial config caused `document is not defined` error
- **Fix:** Replaced with `test.projects` array config (vitest 4.0 recommended approach)
- **Files modified:** vite.config.ts
- **Commit:** a014a8d

## Pre-existing Issues (Out of Scope)

`scripts/release-bump.test.mjs` reports "No test suite found" — pre-existing failure before this plan's changes. All 22 tests in `src/` pass; this failure is in the scripts/ directory and is not related to ONBOARD-04. The `bun run test` exit code is 1 due to this pre-existing failure.

## Deferred Items

- **formatBytes duplication**: `OllamaConsentModal.tsx` duplicates the `formatBytes` function from `SetupView.tsx`. Plan note explicitly deferred refactoring to `src/lib/format.ts` until Phase 21 ONBOARD-01 polish.
- **Polish i18n parity**: All 10 `ai_consentModal_*` keys need Polish translations added under ONBOARD-05 in Phase 21.
- **macOS clean-VM smoke test**: Manual verification on macOS Sonoma VM deferred to Phase 22 VALIDATE-02 as documented in the plan.

## Threat Flags

No new threat surface beyond what the plan's threat model documented. The plan itself closes T-19-06-01 (headline elevation-of-privilege: silent binary execution without consent).

## Self-Check: PASSED

- `src/components/OllamaConsentModal.tsx` exists: FOUND
- `src/contexts/OllamaSetupContext.test.tsx` exists: FOUND
- Commit 8e1d422 exists: FOUND
- Commit 970a149 exists: FOUND
- Commit 2efe058 exists: FOUND
- Commit a014a8d exists: FOUND
- `cargo check` exits 0: PASSED
- `cargo clippy -- -D warnings` exits 0: PASSED
- `cargo test consent_guard_tests` exits 0 (3 tests): PASSED
- `bun run build` exits 0: PASSED
- 4 OllamaSetupContext tests pass: PASSED
