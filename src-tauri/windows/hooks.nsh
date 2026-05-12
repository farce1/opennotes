; openNotes — NSIS installer hooks
;
; Phase 19 — PKG-01 / PKG-02 / PKG-03 / CONTEXT.md D-14.
;
; This file is referenced from src-tauri/tauri.conf.json
; bundle.windows.nsis.installerHooks. Tauri's NSIS template ${includes} this
; file and invokes the NSIS_HOOK_POSTINSTALL macro hook after the main
; install completes.
;
; Responsibility:
;   Detect whether the Microsoft Visual C++ 2015-2022 Redistributable x64
;   is already installed (canonical registry key). If not, silently install
;   the bundled binary from $INSTDIR\resources\vendor\vc_redist.x64.exe.
;
; Detection key reference:
;   HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64
;   Installed (DWORD) = 1 when present.
;   See https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files
;
; Exit code reference (Microsoft bootstrapper standard):
;   0    = success
;   1638 = newer version already installed (treat as success)
;   3010 = success, reboot required (treat as success; the user can choose to reboot later)
;   other = real failure; user must install manually from aka.ms/vs/17/release/vc_redist.x64.exe

!macro NSIS_HOOK_POSTINSTALL
  ; --- Step 1: registry-based detection (PKG-02 / D-14)
  ClearErrors
  ReadRegDWord $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} ${Errors}
    ; Key does not exist — VC++ Redist not installed
    StrCpy $0 0
  ${EndIf}

  ${If} $0 == 1
    DetailPrint "Visual C++ 2015-2022 Redistributable already installed; skipping bundled install."
    Goto vcredist_done
  ${EndIf}

  ; --- Step 2: verify the bundled binary is present (Pitfall 1 — path includes \vendor\)
  ${IfNot} ${FileExists} "$INSTDIR\resources\vendor\vc_redist.x64.exe"
    DetailPrint "WARNING: bundled vc_redist.x64.exe not found at $INSTDIR\resources\vendor\vc_redist.x64.exe — skipping; app may fail to launch with VCRUNTIME140.dll missing."
    Goto vcredist_done
  ${EndIf}

  ; --- Step 3: silent install (PKG-01 / D-14)
  DetailPrint "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)..."
  ExecWait '"$INSTDIR\resources\vendor\vc_redist.x64.exe" /install /quiet /norestart' $0

  ; --- Step 4: exit-code handling (Pitfall 2)
  ${If} $0 == 0
    DetailPrint "Visual C++ Redistributable installed successfully."
  ${ElseIf} $0 == 1638
    DetailPrint "Visual C++ Redistributable: a newer version is already present (exit code 1638)."
  ${ElseIf} $0 == 3010
    DetailPrint "Visual C++ Redistributable installed; a reboot is recommended (exit code 3010)."
  ${Else}
    MessageBox MB_ICONEXCLAMATION|MB_OK \
      "Visual C++ Redistributable install returned exit code $0.$\r$\n$\r$\nopenNotes may fail to launch with a missing-DLL error.$\r$\nInstall manually from:$\r$\nhttps://aka.ms/vs/17/release/vc_redist.x64.exe"
  ${EndIf}

  vcredist_done:
!macroend
