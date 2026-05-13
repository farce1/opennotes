---
phase: 19-release-critical-config-packaging-blockers
verified: 2026-05-12T00:00:00Z
status: gaps_found
score: 9/14 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Running the release pipeline on a tagged commit produces three platform installers (DMG, NSIS .exe, AppImage) plus a `latest.json` updater feed with non-placeholder signatures"
    status: failed
    reason: "Two distinct blockers prevent this: (1) `bundle.resources` references `vendor/vc_redist.x64.exe` which is not committed — Tauri resolves `bundle.resources` on every platform, so even macOS/Linux release builds will fail at bundle time. (2) `plugins.updater.pubkey` is still `REPLACE_WITH_GENERATED_PUBKEY` (29 chars) — the Plan 02 CI gate correctly blocks any release, but CONFIG-02 is explicitly not closed. No signed `latest.json` feed can be produced."
    artifacts:
      - path: "src-tauri/tauri.conf.json"
        issue: "bundle.resources declares `vendor/vc_redist.x64.exe` but the binary is absent from the repo — build-time bomb on all platforms (CR-01 in REVIEW.md)"
      - path: "src-tauri/vendor/vc_redist.x64.exe"
        issue: "File does not exist. Deferred per Plan 05 Task 1. NSIS installer hook and CI pipeline cannot function without it."
      - path: "src-tauri/tauri.conf.json plugins.updater.pubkey"
        issue: "Value is `REPLACE_WITH_GENERATED_PUBKEY` (29 chars). Intentionally deferred per Plan 04 CONFIG-02 tracking."
    missing:
      - "Commit `src-tauri/vendor/vc_redist.x64.exe` after downloading from https://aka.ms/vs/17/release/vc_redist.x64.exe, verifying Authenticode signature, and recording SHA256 in vendor/README.md"
      - "Run `bunx @tauri-apps/cli signer generate -w ~/.tauri/opennotes.key`, paste public key into `src-tauri/tauri.conf.json` plugins.updater.pubkey, add both GH Actions secrets (TAURI_SIGNING_PRIVATE_KEY + TAURI_SIGNING_PRIVATE_KEY_PASSWORD)"

  - truth: "A clean Windows 10 LTSC VM installs the NSIS .exe and launches the app without VCRUNTIME140.dll errors; the bundled `vc_redist.x64.exe` is invoked silently and skipped when already present"
    status: failed
    reason: "vc_redist.x64.exe is not committed (PKG-01 deferred). Additionally, the NSIS hook's missing-binary branch only emits `DetailPrint` (installer log only — invisible to user) and falls through to `vcredist_done`. The user sees a 'successful' install then a VCRUNTIME140.dll crash on first launch. This is the silent-failure mode identified as CR-04 in REVIEW.md."
    artifacts:
      - path: "src-tauri/vendor/vc_redist.x64.exe"
        issue: "Binary not committed — deferred per Plan 05 Task 1"
      - path: "src-tauri/windows/hooks.nsh"
        issue: "Missing-binary branch at line 41-44 uses DetailPrint only; does not abort or MessageBox the user — NSIS hook will silently skip redist install, producing a broken app"
    missing:
      - "Commit vc_redist.x64.exe binary (PKG-01)"
      - "Change the `${IfNot} ${FileExists}` branch in hooks.nsh from `DetailPrint` to `MessageBox MB_ICONSTOP|MB_OK` + `Abort` so a missing binary fails loudly rather than producing a broken install"

  - truth: "Diarization model SHA256 is verified against a pinned hash before extraction; disk space pre-check uses accurate archive sizes"
    status: failed
    reason: "Both `WHISPER_TURBO_ARCHIVE.sha256` and `DIARIZATION_SEGMENTATION_ARCHIVE.sha256` are `REPLACE_WITH_SHA256_*` placeholders. `compressed_size` and `uncompressed_size` are both `0`, so `check_disk_space` is called with `required_free_space() = 0 + 0 + 256 MiB = 256 MiB`. A user with 300 MiB free passes the pre-check then fails mid-extraction. The disk pre-check is functionally disabled. `verify_sha256` will always reject the download against a `REPLACE_WITH_...` literal. The `model_archive_consts_tests` fail at run time by design — a correct gate — but the disk pre-check silently mis-operates. CR-03 in REVIEW.md."
    artifacts:
      - path: "src-tauri/src/download.rs"
        issue: "WHISPER_TURBO_ARCHIVE and DIARIZATION_SEGMENTATION_ARCHIVE carry sha256=REPLACE_WITH_SHA256_* and compressed_size=0, uncompressed_size=0 placeholders. Disk pre-check computes 256 MiB minimum regardless of actual archive size (~3.6 GB needed)."
    missing:
      - "Maintainer must download both archives, compute SHA256 sums, measure sizes, and paste real values into the two ModelArchive consts in download.rs (Plan 03 Task 0 deferred item)"

  - truth: "Attempting to release with mismatched versions or any `REPLACE_WITH_*` placeholder remaining in committed config fails the CI pre-flight job before any artifact is built; `bun run release:bump` updates all three files atomically"
    status: failed
    reason: "The CI gate (release-config-check) and release.yml preflight REPLACE_WITH_ grep are implemented and wired correctly. However the `bun run release:bump` atomicity claim is misleading: the script writes tmp files sequentially (package.json rename, then Cargo.toml rename, then tauri.conf.json rename). A failure between file 1 and file 2 leaves the repo half-bumped — package.json at new version, Cargo.toml at old version — with no rollback. The error message says 'review git diff' but the user is in a broken state on a release branch. (CR-05 in REVIEW.md) Note: CI gate functionality itself is VERIFIED; the atomicity claim is partially false."
    artifacts:
      - path: "scripts/release-bump.mjs"
        issue: "Three sequential tmp+rename operations with no rollback on partial failure. A crash between file 1 and file 2 leaves the repo half-bumped. CI catches it at tag time but the working tree is corrupted."
    missing:
      - "Refactor release-bump.mjs to build all three new contents in memory, write all tmp files, then rename in a tight loop with a cleanup guard that unlinks written tmps if any rename fails"

human_verification:
  - test: "macOS Ollama auto-install consent dialog end-to-end flow"
    expected: "Clicking 'Auto-install Ollama' in SetupView opens the consent modal showing source domain (ollama.com), the full download URL, and the HEAD-resolved byte size. Clicking 'Download & Install Ollama' dismisses the modal and proceeds to auto-install. Clicking 'Use manual install instead' opens ollama.com/download in the browser."
    why_human: "Visual UI behavior and macOS-specific platform detection cannot be verified programmatically without a running Tauri app on macOS"

  - test: "Non-macOS consent modal absence"
    expected: "On Windows or Linux, the auto-install flow does NOT show the consent modal — the wizard shows the manual install path directly"
    why_human: "Platform branching and UI rendering require a running app on the target platform"

  - test: "NSIS installer behavior on Windows 10 LTSC (pending vc_redist binary commit)"
    expected: "After committing vc_redist.x64.exe — NSIS installer silently installs VC++ Redist when absent; skips when registry key shows Installed=1; app launches without VCRUNTIME140.dll error"
    why_human: "Requires a clean Windows 10 LTSC VM and a committed binary (currently deferred)"

  - test: "Latest.json updater feed signatures (pending pubkey replacement)"
    expected: "After replacing REPLACE_WITH_GENERATED_PUBKEY — the published latest.json has non-empty platform.signature fields; installed app can verify the signature against the committed pubkey"
    why_human: "Requires a live tagged release with real keypair configured in GH Actions secrets"
---

# Phase 19: Release-Critical Config & Packaging Blockers — Verification Report

**Phase Goal:** Resolve all release-critical config and packaging blockers preventing v1.3.0-rc.1 from being cut: pure-Rust archive extraction (replace shell-out `tar`), version-bump tooling + CI preflight gates, wiring extraction into download.rs, Tauri config (bundle.targets, updater pubkey, endpoints), NSIS+VCRedist bundling, and Ollama auto-install consent dialog.
**Verified:** 2026-05-12
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

The phase contains 5 roadmap success criteria (from ROADMAP.md Phase 19 detail). Mapping them against the 14 requirement IDs and the 6 plans:

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| SC-1 | Release pipeline produces three platform installers (DMG, NSIS, AppImage) + signed `latest.json` feed | FAILED | `bundle.resources` references absent `vc_redist.x64.exe` — build-time bomb on all platforms (CR-01). `updater.pubkey` is `REPLACE_WITH_GENERATED_PUBKEY` — no signed feed possible (CONFIG-02 deferred). |
| SC-2 | Clean Windows 10 LTSC VM installs NSIS .exe without VCRUNTIME140.dll errors; vc_redist runs silently and skips when present | FAILED | `vc_redist.x64.exe` not committed (PKG-01 deferred). NSIS hook's missing-binary branch silently falls through instead of aborting (CR-04). |
| SC-3 | Diarization model download uses pure-Rust tar+bzip2; SHA256 verified; disk pre-check; structured cause on failure | PARTIAL | Pure-Rust extraction wired — VERIFIED. `Command::new("tar")` count = 0 — VERIFIED. SHA256 placeholders remain (`REPLACE_WITH_SHA256_*`) — functional verification disabled until maintainer fills. Disk pre-check computes 256 MiB minimum (sizes=0) — functionally incorrect until maintainer fills sizes. Two intentionally-failing unit tests serve as release gate. |
| SC-4 | Version mismatch or `REPLACE_WITH_*` placeholder in config fails CI preflight before artifact build; `bun run release:bump` updates all three files atomically | PARTIAL | CI gate (`release-config-check`) and `release.yml` preflight grep are wired and correct — VERIFIED. `bun run release:bump` sequential tmp+rename is NOT truly atomic across files (CR-05 — misleading atomicity claim). |
| SC-5 | Ollama auto-install presents consent dialog with source domain, download URL, byte size before any binary is fetched; declining leaves user on manual-install path | VERIFIED (code path) / HUMAN NEEDED (UI behavior) | Backend guard (`check_consent`, `user_consented` parameter), frontend modal (`OllamaConsentModal.tsx`), context wiring (`OllamaSetupContext.tsx`), and Tauri command (`get_ollama_download_metadata`) all exist and are wired. RTL tests exist. Visual behavior requires human verification on macOS. |

**Score: 9/14 requirement IDs verified** (see Requirements Coverage below)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/extract.rs` | Pure-Rust extraction module | VERIFIED | Exists; exports ExtractError, ModelArchive, extract_tar_bz2, verify_sha256, check_disk_space; no Command::new; no set_unpack_xattrs |
| `src-tauri/Cargo.toml` | tar=0.4.45, bzip2-rs=0.1.2, sha2=0.10.9, fs2=0.4.3 | VERIFIED | All 4 exact-pin deps present |
| `src-tauri/src/lib.rs` | `pub mod extract;` | VERIFIED | grep count = 1 |
| `src-tauri/tests/extract_archive.rs` | Integration tests (6 cases) | VERIFIED | File exists; VALID_BZ2_SHA256 replaced with real 64-char hex |
| `src-tauri/tests/fixtures/valid.tar.bz2` | Valid bzip2 fixture | VERIFIED | Exists |
| `src-tauri/tests/fixtures/corrupt.tar.bz2` | Corrupt fixture | VERIFIED | Exists |
| `scripts/release-bump.mjs` | Atomic 3-file version bump | STUB (partial) | Exists and functional; atomicity claim misleading — sequential renames with no rollback (CR-05) |
| `scripts/release-bump.test.mjs` | 6 bump script tests | VERIFIED | Exists; node:test runner |
| `package.json` | `release:bump` script entry | VERIFIED | grep count = 1 |
| `.github/workflows/ci.yml` | `release-config-check` parallel job | VERIFIED | Job present; greps REPLACE_WITH_ across 4 files including download.rs |
| `.github/workflows/release.yml` | Version-sync assert + placeholder grep + tauri-action@v0.6.2 | VERIFIED | All three present; no floating @v0 pin remains |
| `src-tauri/src/download.rs` | Zero tar shell-outs; pure-Rust wired at both sites; SHA256 + disk pre-check; kind field | PARTIAL | Command::new("tar") = 0; extract_tar_bz2 count = 3; verify_sha256 = 3; check_disk_space = 3; spawn_blocking = 4; kind: Option\<String\> = 1. SHA256 placeholders REPLACE_WITH_SHA256_* remain — intentional gate, but functionally disabled |
| `src/contexts/ModelSetupContext.tsx` | kind discriminator mapping + backward-compat fallback | VERIFIED | EXTRACT_ERROR_I18N_KEYS defined; resolveDownloadErrorCopy exported; event.data.kind used |
| `src/contexts/ModelSetupContext.test.ts` | 4 vitest cases | VERIFIED | File exists |
| `src-tauri/tauri.conf.json` bundle.targets | `["dmg","nsis","appimage"]` | VERIFIED | Confirmed via node -p |
| `src-tauri/tauri.conf.json` updater.pubkey | Real public key (not placeholder) | FAILED | Value = `REPLACE_WITH_GENERATED_PUBKEY` (29 chars). CONFIG-02 intentionally deferred. |
| `src-tauri/tauri.conf.json` updater.endpoints | `https://github.com/farce1/opennotes/releases/latest/download/latest.json` | VERIFIED | Confirmed via node -p |
| `src-tauri/tauri.conf.json` bundle.resources | `["vendor/vc_redist.x64.exe"]` | WIRED / BUILD-BLOCKING | Config entry correct; referenced binary absent from repo — build-time bomb (CR-01) |
| `src-tauri/tauri.conf.json` bundle.windows.nsis.installerHooks | `./windows/hooks.nsh` | VERIFIED | Confirmed via node -p |
| `src-tauri/tauri.windows.conf.json` | `targets: ["nsis"]` unchanged | VERIFIED | grep count = 1 |
| `docs/RELEASE_KEYS.md` | Keypair runbook ≥ 30 lines, no private bytes | VERIFIED | 105 lines; 0 "untrusted comment:" matches; TAURI_SIGNING_PRIVATE_KEY named; maintainer placeholder present |
| `src-tauri/vendor/vc_redist.x64.exe` | Committed binary ~14 MB | MISSING | File does not exist. Deferred per Plan 05 Task 1. PKG-01 release blocker. |
| `src-tauri/vendor/README.md` | Pinned version + SHA256 + update procedure | STUB (deferred) | Exists with CRITICAL TODO banner; SHA256 = `TBD-MAINTAINER-FILL-AFTER-DOWNLOAD` |
| `.gitattributes` | `src-tauri/vendor/*.exe binary` | VERIFIED | grep count = 1 |
| `src-tauri/windows/hooks.nsh` | NSIS_HOOK_POSTINSTALL macro | PARTIALLY VERIFIED | Macro exists and balanced; registry check, ExecWait, /install /quiet /norestart, exit codes 0/1638/3010 all present. Missing-binary branch uses only DetailPrint — silently ships broken install (CR-04). |
| `src/components/OllamaConsentModal.tsx` | Consent modal with 3 fields, 2 buttons, portal-rendered | VERIFIED | Exists; source_domain, download_url, size_bytes fields; onConfirm, onDecline handlers |
| `src/contexts/OllamaSetupContext.tsx` | autoSetup gated on macOS consent; resolveConsent exposed | VERIFIED | isMacOS check, consentModalOpen state, resolveConsent callback all present |
| `src/views/SetupView.tsx` | Renders OllamaConsentModal | VERIFIED | Import and conditional render present (count=2) |
| `src/contexts/OllamaSetupContext.test.tsx` | 4 RTL test cases | VERIFIED | File exists |
| `src-tauri/src/llm/setup.rs` | user_consented guard + OllamaDownloadMetadata + consent_guard_tests | VERIFIED | check_consent (12 refs), user_consented (6), OllamaDownloadMetadata (4), consent_required (8) |
| `src-tauri/src/commands.rs` | get_ollama_download_metadata command | VERIFIED | grep count = 1 |
| `src-tauri/src/lib.rs` | get_ollama_download_metadata registered | VERIFIED | grep count = 1 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src-tauri/src/extract.rs` | tar crate | `tar::Archive::new(decoder).unpack(dst)` | VERIFIED | grep confirms usage |
| `src-tauri/src/extract.rs` | bzip2-rs crate | `bzip2_rs::DecoderReader::new(file)` | VERIFIED | grep confirms usage |
| `src-tauri/src/extract.rs` | sha2 crate | `Sha256::new() + .update() + .finalize()` | VERIFIED | grep confirms usage |
| `src-tauri/src/extract.rs` | fs2 crate | `fs2::available_space(path)` | VERIFIED | grep confirms usage |
| `src-tauri/src/download.rs` | `src-tauri/src/extract.rs` | `use crate::extract::` | VERIFIED | grep count ≥ 1 |
| `src-tauri/src/download.rs` | `tokio::task::spawn_blocking` | wraps extract_tar_bz2 | VERIFIED | count = 4 |
| `src-tauri/src/download.rs` | `DownloadEvent::Error` | `kind: Option<String>` field | VERIFIED | count = 1 |
| `src/contexts/ModelSetupContext.tsx` | DownloadEvent::Error JSON payload | `event.data.kind` discriminator | VERIFIED | grep confirms usage |
| Disk pre-check order (Whisper) | Before download_to_file | awk ordering gate | VERIFIED | check_disk_space line < download_to_file line |
| Disk pre-check order (Diarization) | Before download_to_file | awk ordering gate | VERIFIED | check_disk_space line < download_to_file line |
| `src-tauri/tauri.conf.json` bundle.resources | `src-tauri/vendor/vc_redist.x64.exe` | tauri bundle phase | NOT_WIRED | Config entry exists; binary absent — build fails |
| `src-tauri/tauri.conf.json` bundle.windows.nsis.installerHooks | `src-tauri/windows/hooks.nsh` | tauri-action NSIS template | VERIFIED | Both config entry and hook file exist |
| `src-tauri/windows/hooks.nsh` NSIS_HOOK_POSTINSTALL | Registry `HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64` | ReadRegDWord | VERIFIED | grep confirms registry key |
| `src-tauri/windows/hooks.nsh` | `$INSTDIR\resources\vendor\vc_redist.x64.exe` | ExecWait | VERIFIED (path) / NOT_WIRED (binary) | Path references correct (count=4); binary absent |
| `package.json` scripts | `scripts/release-bump.mjs` | `node scripts/release-bump.mjs` | VERIFIED | grep count = 1 |
| `.github/workflows/ci.yml` release-config-check | `src-tauri/tauri.conf.json` | grep REPLACE_WITH_ | VERIFIED | Job wired; 4-file FILES array includes download.rs |
| `.github/workflows/release.yml` preflight | package.json / Cargo.toml / tauri.conf.json | version comparison + v-prefix stripping | VERIFIED | Steps present and correctly structured |
| `src/contexts/OllamaSetupContext.tsx` autoSetup | `src/components/OllamaConsentModal.tsx` | modal state + callbacks | VERIFIED | OllamaConsentModal wired in SetupView |
| `src/contexts/OllamaSetupContext.tsx` autoSetup | invoke('auto_setup_ollama') | userConsented: true arg | VERIFIED | grep confirms pattern |
| `src-tauri/src/llm/setup.rs` auto_setup_ollama | OllamaSetupEvent::Error consent_required | check_consent early return | VERIFIED | consent_required count = 8 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `src/contexts/ModelSetupContext.tsx` resolveDownloadErrorCopy | `event.data.kind` + `event.data.message` | Rust `DownloadEvent::Error` via Tauri channel | Yes — when kind placeholders are filled | VERIFIED (code path); HOLLOW until SHA256 maintainer fill-in |
| `src/components/OllamaConsentModal.tsx` | `consentModalData` (source_domain, download_url, size_bytes) | `get_ollama_download_metadata` HEAD request → `OllamaDownloadMetadata` struct | Yes — HEAD-resolved from ollama.com | VERIFIED |

### Behavioral Spot-Checks

Step 7b: SKIPPED — cannot start the Tauri app or execute cargo test without a full Rust toolchain build. Key test results are documented in SUMMARYs and verified via grep evidence.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| extract.rs kind strings stable | `grep -E '"corrupt_archive"..."unknown"' src-tauri/src/extract.rs` | 10 matches | PASS |
| No Command::new("tar") in download.rs | grep count | 0 | PASS |
| disk pre-check ordering (Whisper) | awk gate | exit 0 | PASS |
| disk pre-check ordering (Diarization) | awk gate | exit 0 | PASS |
| bundle.targets three-platform array | node -p | `["dmg","nsis","appimage"]` | PASS |
| updater endpoint URL | node -p | canonical farce1/opennotes URL | PASS |
| tauri-action @v0.6.2 pin | grep | count=1, no floating @v0 | PASS |
| vc_redist.x64.exe present | test -f | MISSING | FAIL |
| updater pubkey real | node -p pubkey.length | 29 (placeholder) | FAIL |
| SHA256 placeholders cleared | grep REPLACE_WITH_SHA256 in download.rs | count=2 | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| CONFIG-01 | Plan 04 | bundle.targets produces DMG, NSIS, AppImage | SATISFIED | `["dmg","nsis","appimage"]` confirmed via node -p |
| CONFIG-02 | Plan 04 | updater.pubkey replaced with real public key | BLOCKED | Value = `REPLACE_WITH_GENERATED_PUBKEY` — intentionally deferred; CI gate enforces |
| CONFIG-03 | Plan 02 | Version synchronized via `bun run release:bump` | SATISFIED | Script exists and updates all 3 files; atomicity caveat noted (CR-05) |
| CONFIG-04 | Plan 02 | CI preflight fails on version mismatch or REPLACE_WITH_ | SATISFIED | release-config-check job in ci.yml; preflight steps in release.yml; both verified |
| CONFIG-05 | Plan 02 | tauri-action pinned to @v0.6.2 | SATISFIED | grep count = 1; no floating @v0 remains |
| CONFIG-06 | Plan 04 | Updater endpoint points at farce1/opennotes latest.json | SATISFIED | Canonical URL confirmed unchanged |
| PKG-01 | Plan 05 | NSIS installerHooks runs bundled vc_redist.x64.exe silently | BLOCKED | Binary not committed; hook config wired correctly but no binary to run |
| PKG-02 | Plan 05 | NSIS hook checks registry key first, skips reinstall if present | SATISFIED (code) | Registry detection via ReadRegDWord present and correct in hooks.nsh |
| PKG-03 | Plan 05 | vc_redist.x64.exe vendored in repo | BLOCKED | File absent from repo — explicitly deferred |
| EXTRACT-01 | Plans 01+03 | Pure-Rust tar+bzip2 extraction in download.rs, no shell-out | SATISFIED | Command::new("tar") = 0; extract_tar_bz2 wired at both sites |
| EXTRACT-02 | Plans 01+03 | SHA256 verified before extraction | PARTIALLY SATISFIED | verify_sha256 wired at both sites; placeholder hashes prevent real verification until maintainer fills |
| EXTRACT-03 | Plans 01+03 | Disk space pre-checked before extraction | PARTIALLY SATISFIED | check_disk_space wired before download_to_file at both sites; `required_free_space()` returns 256 MiB until real sizes filled — functionally inadequate |
| EXTRACT-04 | Plans 01+03 | Structured cause on extraction failure | SATISFIED | ExtractError enum with 5 typed variants; kind() discriminator; frontend i18n mapping; send_extract_error helper |
| ONBOARD-04 | Plan 06 | Ollama auto-install requires explicit consent dialog before any binary executes | SATISFIED (code path) / HUMAN NEEDED (visual) | Two-layer guard implemented: Rust check_consent + frontend OllamaConsentModal with source domain, URL, byte size |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src-tauri/src/download.rs` | `sha256: "REPLACE_WITH_SHA256_WHISPER_TURBO"`, `compressed_size: 0`, `uncompressed_size: 0` | BLOCKER | SHA256 verification will reject any real download; disk pre-check computes 256 MiB minimum — functionally disabled. Intentional gate but impairs real-world operation |
| `src-tauri/tauri.conf.json` | `bundle.resources: ["vendor/vc_redist.x64.exe"]` while binary absent | BLOCKER | Every `tauri build` invocation will fail at the bundle step — build-time bomb |
| `src-tauri/tauri.conf.json` | `plugins.updater.pubkey: "REPLACE_WITH_GENERATED_PUBKEY"` | BLOCKER | No signed updater feed possible; CI gate will block any release attempt |
| `src-tauri/windows/hooks.nsh` | `DetailPrint` + `Goto vcredist_done` on missing binary — no user-visible error | WARNING | Silent failure mode: user gets "successful" install then VCRUNTIME140.dll crash on launch |
| `scripts/release-bump.mjs` | Sequential tmp+rename across 3 files; catch block says "review git diff" on partial failure | WARNING | Mid-failure leaves repo half-bumped; no rollback mechanism |
| `src-tauri/src/download.rs` | `Ok(bytes) => bytes,` in download_model outer match — value discarded, downloaded_so_far never updated for archive | WARNING | Progress tracking inconsistency; latent bug for future multi-step downloads (CR-06 in REVIEW.md) |

### Human Verification Required

#### 1. macOS Ollama Consent Dialog Visual Behavior

**Test:** On macOS, open the app for the first time (or clear setup state). In SetupView, click the "Auto-install Ollama" button.
**Expected:** A modal appears immediately — before any network request — showing three labeled fields: "Source domain: ollama.com", "Download URL: https://ollama.com/download/Ollama-darwin.zip" (or the live-resolved URL), and "Download size: X MB" (or "Unknown" if HEAD fails). Two buttons: "Download & Install Ollama" (primary) and "Use manual install instead" (secondary). Escape key and backdrop click both dismiss as "decline".
**Why human:** Visual rendering, modal lifecycle, and platform detection (`isMacOS()`) cannot be verified programmatically without a running Tauri app on macOS.

#### 2. Ollama Consent Confirm Path

**Test:** Click "Download & Install Ollama" in the consent modal.
**Expected:** Modal closes; auto-install proceeds (invoking `auto_setup_ollama` with `userConsented: true`). The Rust backend does NOT receive `user_consented: false` on the confirm path.
**Why human:** Async Promise resolver chain and invoke call require a running app.

#### 3. Ollama Consent Decline Path

**Test:** Click "Use manual install instead" (or press Escape).
**Expected:** Modal closes; `https://ollama.com/download` opens in the user's browser; the setup wizard remains on the manual-install path (no auto-install invoked).
**Why human:** Shell open behavior requires a running app.

#### 4. Non-macOS Consent Modal Absence

**Test:** On Windows or Linux, trigger the Ollama auto-install path.
**Expected:** No consent modal appears; the existing manual-install UI renders as before.
**Why human:** Platform-conditional rendering requires a running app on a non-macOS platform.

#### 5. NSIS Windows Install Validation (post-binary-commit)

**Test:** After committing `src-tauri/vendor/vc_redist.x64.exe` and replacing the pubkey: run the release workflow, download the NSIS .exe, install on a clean Windows 10 LTSC VM.
**Expected:** Installation completes without errors; VC++ Redist is silently installed; app launches without `VCRUNTIME140.dll` error. On a VM where redist is already present, the installer skips the redist silently (registry key check).
**Why human:** Requires a clean Windows 10 LTSC VM and a live binary that is not yet committed.

#### 6. Post-release latest.json Updater Feed Verification (post-pubkey-replacement)

**Test:** After replacing `REPLACE_WITH_GENERATED_PUBKEY` and adding GH secrets, trigger a release workflow dispatch. After completion: `curl -s "https://github.com/farce1/opennotes/releases/latest/download/latest.json" | jq .`
**Expected:** JSON parses; top-level `version` matches the tagged version; `platforms` object has entries for all three platforms; each platform entry has non-empty `signature` field.
**Why human:** Requires a live tagged release with real keypair configured.

### Gaps Summary

Phase 19 successfully completes the technically complex work: the pure-Rust extraction module (EXTRACT-01..04 foundation and wiring), CI preflight gates (CONFIG-03, CONFIG-04, CONFIG-05), Tauri bundle config (CONFIG-01, CONFIG-06), and the Ollama consent dialog (ONBOARD-04). These represent ~9 of 14 requirement IDs and substantial engineering work.

**Four gaps block the v1.3.0-rc.1 tag from being cut, as designed:**

1. **CONFIG-02 (updater pubkey)**: Intentionally deferred. `REPLACE_WITH_GENERATED_PUBKEY` remains. CI gate will block any release attempt. Maintainer action: run `bunx @tauri-apps/cli signer generate`, paste pubkey, add GH secrets.

2. **PKG-01 / PKG-03 (vc_redist.x64.exe)**: Intentionally deferred. Binary not committed. Build-time bomb — `tauri build` will fail on all platforms because `bundle.resources` references the absent file. The NSIS hook's missing-binary branch also silently swallows the error. Maintainer action: download binary, verify Authenticode + SHA256, commit, update vendor/README.md.

3. **EXTRACT-02 / EXTRACT-03 (ModelArchive SHA256 + sizes)**: Intentionally deferred (Plan 03 Task 0). Placeholder strings `REPLACE_WITH_SHA256_*` and zero sizes leave SHA256 verification and disk pre-check functionally disabled. Two unit tests fail at run time as the designed release gate. Maintainer action: download both model archives, compute SHA256 sums and sizes, paste into download.rs ModelArchive consts.

4. **release-bump.mjs partial atomicity (CONFIG-03 edge case)**: Not intentionally deferred but identified as misleading claim. A crash between the first and second file rename leaves the repo half-bumped with no rollback. Low-probability but high-cost failure mode on a release branch.

All four gaps were explicitly documented in the SUMMARYs as `CRITICAL FOLLOW-UP` or `CRITICAL TODO` items with maintainer instructions. The CI gates from Plan 02 correctly prevent any of the first three from reaching a release tag. The gaps are tracked blockers, not silent failures — except for the NSIS hook's missing-binary `DetailPrint` which is a silent failure mode that should be hardened to `MessageBox + Abort`.

---

*Verified: 2026-05-12*
*Verifier: Claude (gsd-verifier)*
