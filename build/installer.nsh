; JARVIS NSIS Custom Installer Script
; Optional Ollama download after install (silent — no console flash)

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER

Var OllamaCheckbox
Var OllamaChecked

!macro customInit
  StrCpy $OllamaChecked ${BST_UNCHECKED}
!macroend

Function OllamaPage
  !insertmacro MUI_HEADER_TEXT "Ollama Setup" "JARVIS can use Ollama for free, local AI"

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 40u "JARVIS supports Ollama for local AI chat (no API key needed).$\n$\nOllama runs AI models entirely on your PC. If you don't have it installed, we can download the installer for you.$\n$\nYou can always set this up later in JARVIS Settings → AI."
  Pop $0

  ${NSD_CreateCheckbox} 0 50u 100% 12u "Download and install Ollama after setup"
  Pop $OllamaCheckbox
  ${NSD_SetState} $OllamaCheckbox ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function OllamaPageLeave
  ${NSD_GetState} $OllamaCheckbox $OllamaChecked
FunctionEnd

!macro customPageAfterChangeDir
  Page custom OllamaPage OllamaPageLeave
!macroend

Function JarvisDownloadOllama
  StrCpy $R8 "$TEMP\OllamaSetup.exe"
  Delete "$R8"
  StrCpy $R6 1

  ; NSISdl runs inside the installer UI — no PowerShell/curl console window
  DetailPrint "Downloading Ollama installer..."
  NSISdl::download "https://ollama.com/download/OllamaSetup.exe" "$R8"
  Pop $R7
  StrCmp $R7 "success" dl_ok dl_try_ps

  dl_try_ps:
    DetailPrint "Retrying download..."
    FileOpen $R9 "$TEMP\jarvis-dl-ollama.ps1" w
    FileWrite $R9 '$$ProgressPreference = "SilentlyContinue"$\r$\n'
    FileWrite $R9 "Invoke-WebRequest -UseBasicParsing -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile '$R8'$\r$\n"
    FileClose $R9
    ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -WindowStyle Hidden -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$TEMP\jarvis-dl-ollama.ps1"' $R6
    Delete "$TEMP\jarvis-dl-ollama.ps1"
    Goto dl_check

  dl_ok:
    StrCpy $R6 0

  dl_check:
    ${If} $R6 != 0
      Goto dl_fail
    ${EndIf}
    IfFileExists "$R8" dl_done dl_fail

  dl_fail:
    StrCpy $R6 1
    Return

  dl_done:
    StrCpy $R6 0
FunctionEnd

Function .onInstSuccess
  ${If} $OllamaChecked == ${BST_CHECKED}
    Call JarvisDownloadOllama
    ${If} $R6 == 0
      IfFileExists "$R8" ollama_launch ollama_missing
      ollama_missing:
        MessageBox MB_OK|MB_ICONINFORMATION "Could not download Ollama (file missing). Install manually from https://ollama.com/download"
        Goto ollama_done
      ollama_launch:
        DetailPrint "Launching Ollama installer..."
        ExecShell "open" "$TEMP\OllamaSetup.exe"
      ollama_done:
    ${Else}
      MessageBox MB_OK|MB_ICONINFORMATION "Could not download Ollama (network error). Install manually from https://ollama.com/download"
    ${EndIf}
  ${EndIf}
FunctionEnd

!endif
