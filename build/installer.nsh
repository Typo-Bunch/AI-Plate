; ─── Custom NSIS Script for AI Plate ──────────────────────────────────────────
; Sets the Windows AppCompatFlags "RUNASADMIN" flag when the application
; is installed for "all users" (per-machine), so the app runs with administrator
; privileges by default.

!macro customInstall
  ${if} $installMode == "all"
    ; Mark the installed executable to run as administrator for all users on this machine
    WriteRegStr HKLM "Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "~ RUNASADMIN"
  ${endif}
!macroend

!macro customUnInstall
  ; Remove the administrator compatibility layer on uninstall if it was set
  DeleteRegValue HKLM "Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

  ; Updates run the old uninstaller too. Never prompt or purge data during them.
  ; Silent removal preserves data; interactive removal requires an explicit Yes.
  ${ifNot} ${isUpdated}
    ${IfNot} ${Silent}
      ; Electron stores data for the current Windows user, even for an all-user install.
      SetShellVarContext current
      ${If} $APPDATA != ""
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also remove your AI Plate data?$\r$\n$\r$\nThis permanently deletes chats, settings and saved API keys, logs, installed extensions, downloaded models, and generated files stored in:$\r$\n$APPDATA\AI Plate$\r$\n$\r$\nChoose No to keep this data for a future reinstall. Files saved elsewhere and shared model caches will be kept." /SD IDNO IDNO aiPlateKeepData
        ClearErrors
        ; Fixed app-owned directory only. Never delete a configured workspace or shared cache.
        RMDir /r "$APPDATA\AI Plate"
        ${If} ${Errors}
          MessageBox MB_OK|MB_ICONEXCLAMATION "Some AI Plate data could not be removed. Close any programs using it, then remove the remaining files from:$\r$\n$APPDATA\AI Plate" /SD IDOK
        ${EndIf}
        aiPlateKeepData:
      ${EndIf}
      ${If} $installMode == "all"
        SetShellVarContext all
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
