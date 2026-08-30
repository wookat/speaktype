!macro customUnInstall
  ; The launch-at-login entry is an HKCU Run value written at runtime by the
  ; auto-launch library; the default uninstall script does not know about it.
  ; Delete it here so uninstalling never leaves a dead autostart pointing at
  ; a removed exe. Skip during upgrades so autostart survives a silent update
  ; even if the app is not launched before the next reboot.
  ; (ASCII comments only: makensis mangles non-ASCII in .nsh.)
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "SpeakType"
  ${endIf}
!macroend
