# Round 303: end-to-end EMPTY-result check in the packaged app (Parakeet en, fake mic).
# For each WAV: launch app with fake mic = WAV, focus Notepad, hold RightCtrl 9.5s x3, capture main.log delta + Notepad text.
param([string[]]$Wavs, [int]$Presses = 3)
$ErrorActionPreference = "Stop"
$T = "C:\Users\Administrator\r302\tools"
$E = "C:\Users\Administrator\r302\evidence"
$log = "$env:APPDATA\SpeakType\logs\main.log"
$out = @()
foreach ($wav in $Wavs) {
  $name = [IO.Path]::GetFileNameWithoutExtension($wav)
  Get-Process SpeakType -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 2
  $before = (Get-Content $log -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
  & "$T\launch.ps1" -Wav $wav | Out-Null
  Start-Sleep 9
  $np = Get-Process notepad -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $np) { $np = Start-Process notepad -PassThru; Start-Sleep 2 }
  Add-Type -AssemblyName Microsoft.VisualBasic
  [Microsoft.VisualBasic.Interaction]::AppActivate($np.Id); Start-Sleep 1
  & "$T\rkey.ps1" tap:end tap:enter "text:[$name]" tap:enter | Out-Null
  for ($i = 1; $i -le $Presses; $i++) {
    & "$T\rkey.ps1" down:rctrl sleep:8300 up:rctrl | Out-Null
    Start-Sleep 6
    & "$T\rkey.ps1" tap:enter | Out-Null
  }
  Start-Sleep 2
  $delta = Get-Content $log | Select-Object -Skip $before
  $delta | Set-Content "$E\r303_e2e_$name.main.log" -Encoding UTF8
  $hist = (Get-Content "$env:APPDATA\SpeakType\history.json" -Raw | ConvertFrom-Json)
  $out += [pscustomobject]@{ wav = $name; finalize = ($delta | Select-String 'dictation finalize').Count; warnErr = ($delta | Select-String '\[(warn|error)\]').Count; historyCount = $hist.Count }
  & "$T\rkey.ps1" tap:enter | Out-Null
}
Get-Process SpeakType -ErrorAction SilentlyContinue | Stop-Process -Force
& "$T\rkey.ps1" down:lctrl tap:a up:lctrl down:lctrl tap:c up:lctrl | Out-Null; Start-Sleep 1
Get-Clipboard | Set-Content "$E\r303_e2e_notepad.txt" -Encoding UTF8
Get-Content "$E\r303_e2e_notepad.txt"
$out | Format-Table -AutoSize | Out-String

