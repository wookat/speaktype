!macro customUnInstall
  ; The launch-at-login entry is an HKCU Run value written at runtime by the
  ; auto-launch library; the default uninstall script does not know about it.
  ; Delete it here so uninstalling never leaves a dead autostart pointing at
  ; a removed exe. (ASCII comments only: makensis mangles non-ASCII in .nsh.)
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "SpeakType"
!macroend
