> **CRITICAL TODO:** This README is INCOMPLETE. The vendored binary at
> `src-tauri/vendor/vc_redist.x64.exe` has not been committed yet. The
> NSIS installer will NOT install the VC++ Redistributable until the
> maintainer completes Plan 05 Task 1 (download + verify + commit binary).
> See `.planning/phases/19-release-critical-config-packaging-blockers/19-05-SUMMARY.md`
> for the follow-up task.

# Vendored binaries

> Offline-reproducible build dependencies committed to the repo per Phase 19 PKG-03 / D-11.
> Update procedure at the bottom of this file.

## `vc_redist.x64.exe`

Microsoft Visual C++ 2015-2022 Redistributable (x64). Bundled in the NSIS
installer so Windows 10 LTSC users (and any Windows machine without a prior
Visual Studio install) do not hit `VCRUNTIME140.dll` / `MSVCP140.dll`
missing-DLL errors when launching openNotes.

| Field | Value |
|-------|-------|
| Pinned version | `TBD-MAINTAINER-FILL-AFTER-DOWNLOAD` |
| SHA256 (lowercase hex) | `TBD-MAINTAINER-FILL-AFTER-DOWNLOAD` |
| Download URL | `https://aka.ms/vs/17/release/vc_redist.x64.exe` (Microsoft canonical alias) |
| Date pinned | `TBD-MAINTAINER-FILL-AFTER-DOWNLOAD` |
| Microsoft release notes | https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist |
| Authenticode signature | Microsoft Corporation (verify via Windows Properties → Digital Signatures) |

### Why x64 only

openNotes ships x64-only Windows binaries (the release matrix has no `i686`
or `aarch64-windows` target as of v1.3). Adding `vc_redist.x86.exe` would
only matter when we add an x86 build target.

### How the installer uses this

`src-tauri/windows/hooks.nsh` is referenced from `src-tauri/tauri.conf.json`
`bundle.windows.nsis.installerHooks` and:

1. Reads `HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64\Installed`
2. If `Installed == 1` → skips reinstall (PKG-02 / D-14)
3. Otherwise → `ExecWait` on `$INSTDIR\resources\vendor\vc_redist.x64.exe /install /quiet /norestart`

`bundle.resources: ["vendor/vc_redist.x64.exe"]` places the binary inside the
installer payload at `$INSTDIR\resources\vendor\vc_redist.x64.exe` (the
`vendor/` subdirectory is preserved — see RESEARCH.md Pitfall 1).

## Update procedure

1. Download the latest x64 redistributable from
   `https://aka.ms/vs/17/release/vc_redist.x64.exe`.

2. Verify the file's Authenticode signature is Microsoft Corporation:
   - Windows: right-click → Properties → Digital Signatures
   - macOS/Linux: `osslsigncode verify <file>` (if `osslsigncode` is installed)

3. Compute SHA256 and record it here:
   ```bash
   sha256sum src-tauri/vendor/vc_redist.x64.exe
   # or on macOS:
   # shasum -a 256 src-tauri/vendor/vc_redist.x64.exe
   ```

4. Identify the version from the Microsoft release notes:
   https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist

5. Update this README's "Pinned version" + "SHA256" + "Date pinned" rows.

6. Replace `src-tauri/vendor/vc_redist.x64.exe` with the new binary, commit
   both files in the same commit, push, and run Phase 22's Win10 LTSC VM
   check to verify the new redist still satisfies the missing-DLL gap.

## What is NOT vendored

- `vc_redist.x86.exe` — not needed for current x64-only build matrix.
- `vc_redist.arm64.exe` — not needed; no Windows ARM build target.
- macOS / Linux runtime — these platforms link against libc/libstdc++ from
  the system; no redistributable to vendor.
