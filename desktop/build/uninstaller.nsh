!macro customUnInstall
  ; 开机自启项是 auto-launch 在运行时写入的 HKCU Run 值，默认卸载脚本不认识它：
  ; 卸载时一并删除，避免开机残留指向已删 exe 的死链
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "SpeakType"
!macroend
