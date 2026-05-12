---
phase: 19-release-critical-config-packaging-blockers
plan: "05"
subsystem: windows-packaging
tags:
  - windows
  - nsis
  - installer
  - vcrt
  - packaging
  - release-blocker

dependency_graph:
  requires:
    - 19-04 (tauri.conf.json bundle.targets + updater.pubkey baseline)
  provides:
    - src-tauri/vendor/README.md (vendor pin documentation with deferred SHA256)
    - src-tauri/windows/hooks.nsh (NSIS_HOOK_POSTINSTALL macro)
    - bundle.resources + bundle.windows.nsis.installerHooks wired in tauri.conf.json
    - .gitattributes binary marking for .exe files
  affects:
    - 19-06 (ollama-consent-dialog — no dependency, parallel safe)
    - Phase 22 VALIDATE-03 (Win10 LTSC VM — real validation gate)

tech_stack:
  added: []
  patterns:
    - NSIS_HOOK_POSTINSTALL macro with registry-gated conditional install
    - Vendor README with pinned SHA256 + update procedure as supply-chain audit trail
    - .gitattributes binary marking to prevent CRLF corruption on Windows checkouts

key_files:
  created:
    - .gitattributes
    - src-tauri/vendor/README.md
    - src-tauri/windows/hooks.nsh
  modified:
    - src-tauri/tauri.conf.json

decisions:
  - "Task 1 DEFERRED: vc_redist.x64.exe binary not committed — maintainer must download from https://aka.ms/vs/17/release/vc_redist.x64.exe, verify SHA256, and commit before any Windows NSIS build will install the VC++ Redistributable"
  - "NSIS hook references $INSTDIR\\resources\\vendor\\vc_redist.x64.exe (vendor/ subdirectory preserved per RESEARCH.md Pitfall 1)"
  - "Exit codes 0/1638/3010 treated as success; other codes surface MessageBox with manual-install URL"
  - "Registry detection key: HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64 Installed DWORD"

metrics:
  duration: "2m 56s"
  completed: "2026-05-12T08:01:30Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 1
---

# Phase 19 Plan 05: NSIS VC++ Redistributable Bundling Summary

NSIS installer hooks, .gitattributes binary marking, and vendor README scaffolding are complete; the vc_redist.x64.exe binary is deferred (CRITICAL release blocker — maintainer must commit before Windows NSIS builds will install the VC++ Redistributable).

## What Was Built

This plan delivers the NSIS installer infrastructure to silently install the Microsoft Visual C++ 2015-2022 Redistributable x64 on Windows machines that lack `VCRUNTIME140.dll` / `MSVCP140.dll`. Without this, openNotes would crash on Windows 10 LTSC clean installs (Phase 22 VALIDATE-03 gate).

### Binary Status: DEFERRED

Task 1 (human-action checkpoint) received a `defer` signal. The ~14 MB `vc_redist.x64.exe` binary has NOT been committed.

**PKG-01 is a RELEASE BLOCKER until the binary is committed.** The NSIS hook and tauri.conf.json wiring are in place, but any Windows NSIS installer build attempted before the binary is added will either:
1. Fail at the `tauri-action` bundle step (binary referenced in `bundle.resources` but absent)
2. Or produce a broken installer where the VC++ Redist hook silently skips installation (the `${IfNot} ${FileExists}` guard triggers the warning DetailPrint path)

### Files Delivered

| File | Status | Description |
|------|--------|-------------|
| `.gitattributes` | Created | `src-tauri/vendor/*.exe binary` — prevents CRLF corruption on Windows checkouts (T-19-05-07 mitigation) |
| `src-tauri/vendor/README.md` | Created | Vendor documentation with CRITICAL TODO banner, TBD SHA256 placeholder, download URL, update procedure, registry detection key, and NSIS integration explanation |
| `src-tauri/windows/hooks.nsh` | Created | NSIS_HOOK_POSTINSTALL macro with registry-gated detection, FileExists guard, ExecWait with /install /quiet /norestart, four exit-code branches (0/1638/3010/other) |
| `src-tauri/tauri.conf.json` | Modified | Added `bundle.resources: ["vendor/vc_redist.x64.exe"]` and `bundle.windows.nsis.installerHooks: "./windows/hooks.nsh"` |

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| Task 1 | checkpoint:human-action (defer path) | — | No commit; deferred to maintainer |
| Task 2 | .gitattributes binary marking + vendor/README.md | f71d50c | .gitattributes, src-tauri/vendor/README.md |
| Task 3 | NSIS_HOOK_POSTINSTALL hook script | 569f5d6 | src-tauri/windows/hooks.nsh |
| Task 4 | Wire bundle.resources + bundle.windows.nsis.installerHooks | eb52831 | src-tauri/tauri.conf.json |

## Binary: DEFERRED (Release Blocker)

| Field | Value |
|-------|-------|
| Status | **DEFERRED — binary not committed** |
| Pinned version | `TBD-MAINTAINER-FILL-AFTER-DOWNLOAD` |
| SHA256 | `TBD-MAINTAINER-FILL-AFTER-DOWNLOAD` |
| Date pinned | TBD |
| Download URL | `https://aka.ms/vs/17/release/vc_redist.x64.exe` |

### Maintainer action required before NSIS build

```bash
cd /path/to/opennotes
mkdir -p src-tauri/vendor

# 1. Download
curl -L -o src-tauri/vendor/vc_redist.x64.exe "https://aka.ms/vs/17/release/vc_redist.x64.exe"

# 2. Compute SHA256
sha256sum src-tauri/vendor/vc_redist.x64.exe
# macOS: shasum -a 256 src-tauri/vendor/vc_redist.x64.exe

# 3. Verify Authenticode signature
# Windows: right-click → Properties → Digital Signatures → Microsoft Corporation
# macOS/Linux: osslsigncode verify src-tauri/vendor/vc_redist.x64.exe

# 4. Update src-tauri/vendor/README.md with actual version + SHA256 + date

# 5. Commit both files
git add src-tauri/vendor/vc_redist.x64.exe src-tauri/vendor/README.md
git commit -m "chore: add vendored vc_redist.x64.exe vX.XX.XXXXX (SHA256: <hex>)"
```

## Verification Gates

### Automated (passing)

- `.gitattributes` contains `src-tauri/vendor/*.exe binary` (count=1)
- `src-tauri/vendor/README.md` exists, 78 lines (>= 25), CRITICAL TODO banner present, TBD placeholder for SHA256/version
- `src-tauri/windows/hooks.nsh` exists, 63 lines (>= 25), macro/macroend balanced (1 each), ReadRegDWord, ExecWait, /install /quiet /norestart, 1638/3010/aka.ms exit-code branches all present, $INSTDIR\\resources\\vendor path referenced >= 2 times
- `src-tauri/tauri.conf.json` validates as JSON; `bundle.resources == ["vendor/vc_redist.x64.exe"]`; `bundle.windows.nsis.installerHooks == "./windows/hooks.nsh"`; Plan 04 fields preserved (targets, createUpdaterArtifacts, icon, macOS)
- `bun run build` exits 0 (frontend build unaffected)

### Pending (Phase 22)

- **VALIDATE-03**: Win10 LTSC clean-VM validation — after binary is committed, the NSIS installer must install the VC++ Redistributable silently and openNotes must launch without missing-DLL errors

## Deviations from Plan

### Pre-supplied Deferred Path

**Task 1 (checkpoint:human-action) — Binary download deferred by orchestrator pre-supplied response**

- **Found during:** Task 1 (start of execution)
- **Response:** Pre-supplied `defer` signal from orchestrator
- **Action:** Took the documented deferred path: CRITICAL TODO banner added to vendor/README.md, SHA256/version fields set to TBD placeholders, all subsequent tasks (2-4) proceeded normally with hooks and wiring referencing the expected vendor path
- **Impact:** PKG-01 is a release blocker; Windows NSIS builds will reference a missing binary until maintainer commits it
- **Files modified:** src-tauri/vendor/README.md (CRITICAL TODO banner, TBD placeholders)

No other deviations. Plan executed as written for tasks 2-4.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `TBD-MAINTAINER-FILL-AFTER-DOWNLOAD` (SHA256, version, date) | src-tauri/vendor/README.md | Binary deferred per Task 1 `defer` response; maintainer must fill after downloading and verifying vc_redist.x64.exe |
| `vc_redist.x64.exe` absent from repo | src-tauri/vendor/ | Binary deferred — NSIS hook references the expected path but the file is not committed |

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced beyond what the plan's threat model covers. All T-19-05-xx mitigations implemented as designed:

- T-19-05-01 (Tampering — committed binary replaced): SHA256 in vendor/README.md anchors immutability (TBD until binary committed)
- T-19-05-02 (ExecWait arbitrary path): Hardcoded `$INSTDIR\resources\vendor\vc_redist.x64.exe` path with FileExists guard
- T-19-05-03 (Spoofing — skip on registry error): `${Errors}` flag triggers fallback `StrCpy $0 0` — install proceeds
- T-19-05-07 (CRLF corruption): `.gitattributes` binary marking in place

## Self-Check: PASSED

### Files present

- FOUND: .gitattributes
- FOUND: src-tauri/vendor/README.md
- FOUND: src-tauri/windows/hooks.nsh
- FOUND: src-tauri/tauri.conf.json
- CONFIRMED ABSENT: src-tauri/vendor/vc_redist.x64.exe (deferred — expected)

### Commits present

- FOUND: f71d50c (chore(19-05): .gitattributes + vendor/README.md)
- FOUND: 569f5d6 (feat(19-05): NSIS_HOOK_POSTINSTALL hook)
- FOUND: eb52831 (feat(19-05): tauri.conf.json bundle wiring)
