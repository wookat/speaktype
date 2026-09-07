# Round 303 regression fixtures for Parakeet blankPenalty A/B: 12 en sentences x 2 voices, lead 500ms + nolead
$ErrorActionPreference = "Stop"
$tools = "C:\Users\Administrator\r302\tools"
$wav = "C:\Users\Administrator\r302\wav\r303"
New-Item -ItemType Directory -Force $wav | Out-Null
$texts = @(
  "Please send me the updated report by Friday.",
  "Can you remind me to call the dentist at ten tomorrow?",
  "The quarterly numbers look better than we expected.",
  "Let's move the standup to nine thirty starting next week.",
  "I think we should postpone the launch until the bug is fixed.",
  "Add milk, eggs, and two loaves of bread to the shopping list.",
  "Thanks for your help today, I really appreciate it.",
  "Our flight departs from gate twenty two at six fifteen.",
  "Could you share the slides from yesterday's presentation?",
  "She said the package would arrive on Thursday afternoon.",
  "We need to hire two more engineers before the end of the quarter.",
  "Turn left at the second light and the office is on your right."
)
$voices = @(@{ k = "j"; v = "en-US-JennyNeural" }, @{ k = "g"; v = "en-US-GuyNeural" })
$idx = 0
$manifest = @()
foreach ($t in $texts) {
  $idx++
  foreach ($vv in $voices) {
    $n = "s{0:d2}{1}" -f $idx, $vv.k
    $mp3 = Join-Path $wav ($n + ".mp3")
    if (-not (Test-Path $mp3)) { & node (Join-Path $tools "tts.mjs") $vv.v $t $mp3 | Out-Null }
    $raw = Join-Path $wav ($n + "_raw.wav")
    & ffmpeg -y -loglevel error -i $mp3 -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse" -ar 16000 -ac 1 -c:a pcm_s16le $raw
    & ffmpeg -y -loglevel error -i $raw -af "adelay=500:all=1,apad=pad_dur=4" -ar 16000 -ac 1 -c:a pcm_s16le (Join-Path $wav ($n + "_lead.wav"))
    & ffmpeg -y -loglevel error -i $raw -af "apad=pad_dur=4" -ar 16000 -ac 1 -c:a pcm_s16le (Join-Path $wav ($n + "_nolead.wav"))
    $manifest += [pscustomobject]@{ name = $n; voice = $vv.v; text = $t }
  }
}
$manifest | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $wav "manifest.json")
Write-Output ("fixtures: " + (Get-ChildItem $wav\*_lead.wav).Count)
