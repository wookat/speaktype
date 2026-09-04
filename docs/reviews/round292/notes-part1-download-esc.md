# Round 292 Part 1 - running notes (download chain + Esc copy)

Build: release\win-unpacked\SpeakType.exe @ d18aa8f, model sources patched (test-only, packaged artifact) -> 127.0.0.1:18080 (fake HF). Fresh %APPDATA%\SpeakType (brand-new user). Recording: C:\Users\Administrator\screencasts\r292-part1\r292-part1-edited.mp4

## Harness finding (not a product bug)
- First launch: resources\app override was NOT loaded — Electron picked resources\app.asar first (CDP: renderer location = file:///.../resources/app.asar/out/renderer/index.html). The tiny model downloaded from the REAL huggingface.co in ~7 s (fakesrc.log received zero requests). main.log: [2026-09-04 14:00:39.864] [info]  local model tiny-q5_1 downloaded.
- Fix: patched app.asar itself (backup: C:\Users\Administrator\tts\app.asar.orig, 36,590,428 bytes; patched 36,590,621 bytes; extracted tree C:\Users\Administrator\tts\asartmp). Verified 3x 127.0.0.1:18080, 0x https://huggingface.co/ inside the packed asar. Restore later: copy app.asar.orig back over rresources\app.asar (and patchsrc.ps1 -Restore for rresources\app).
- Reset %APPDATA%\SpeakType (removed) to redo as brand-new user.

## A1 Resume Range/206
- Fresh user -> Settings > Speech > Local model tiny-q5_1 -> Download model. UI button 'Downloading 31%' + progress bar (a-206-01). Killed process (launch.ps1 -Kill) ~16 s in.
- After kill: models\ggml-tiny-q5_1.bin.part = 23,855,104 bytes; .part.json (180 B) = {"url":"http://127.0.0.1:18080/hf/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin","etag":"818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7","total":32152673}
- fakesrc.log (first attempt):
  2026-09-04T14:04:41.960Z [sfj0d] >> GET /hf/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin range=- mode=ok
  2026-09-04T14:04:41.962Z [sfj0d] << 302 {"location":"/cdn/ggml-tiny-q5_1.bin","x-linked-etag":"\"8187...c3d7\"","accept-ranges":"bytes"}
  2026-09-04T14:04:41.965Z [gb6xj] >> GET /cdn/ggml-tiny-q5_1.bin range=- mode=ok
  2026-09-04T14:04:41.968Z [gb6xj] << 200 {... "content-length":"32152673"}
  2026-09-04T14:04:57.854Z [gb6xj] client closed after 23855104 bytes
- Expected resume % = floor(23855104/32152673*100) = 74.
- Relaunch: Home banner button 'Resume download (74% done)' (a-206-02); Settings>Speech button 'Resume download (74% done)' + 'Delete model' (a-206-03). Copy is correct and matches floor(23855104/32152673*100)=74.
- Clicked Resume. fakesrc.log:
  2026-09-04T14:05:51.728Z [eea8k] >> GET /hf/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin range=bytes=23855104- mode=ok
  2026-09-04T14:05:51.729Z [eea8k] << 302 {"location":"/cdn/ggml-tiny-q5_1.bin","x-linked-etag":"\"8187...c3d7\"","accept-ranges":"bytes"}
  2026-09-04T14:05:51.732Z [xyv52] >> GET /cdn/ggml-tiny-q5_1.bin range=bytes=23855104- mode=ok
  2026-09-04T14:05:51.733Z [xyv52] << 206 {..."content-range":"bytes 23855104-32152672/32152673","content-length":"8297569"}
  2026-09-04T14:05:57.250Z [xyv52] done sent=8297569
- Result: ggml-tiny-q5_1.bin 32,152,673 bytes, sha256 818710568DA3CA15689E31A743197B520007872FF9576237BDA97BD1B469C3D7 (matches). No .part left. UI 'Model ready' + Status 'Ready' (a-206-04).
- main.log: [2026-09-04 14:05:57.456] [info]  local model tiny-q5_1 downloaded
- A1 variant 1 (quit mid-download): 实测通过.
- UX note: 'Delete model' two-step confirm resets after 4 s; the confirm label 'Confirm delete? Re-download needed to use again' (red). Deletion worked with two clicks within ~0.6 s -> button back to 'Download model', Status 'Not configured'.
## A1 variant 2 (network drop mid-download: fakesrc killed, then restarted)
- Deleted model via UI, clicked Download; at 'Downloading 25%' killed fakesrc node process (14:07:49). Within <1 s UI: button 'Resume download (34% done)' (label wrapped to 2 lines because the row is flex with the red error text), 'Delete model', red inline text 'Download failed: network error — check your connection and try again.' (a-206-05).
- .part = 11,010,048 bytes (floor(11010048/32152673*100)=34 ✓), .part.json unchanged (same url/etag/total).
- main.log:
  [2026-09-04 14:07:49.641] [warn]  download source failed: http://127.0.0.1:18080/hf/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin TypeError: terminated
  [2026-09-04 14:07:49.645] [warn]  download source failed: http://127.0.0.1:18080/mirror/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin TypeError: fetch failed
  [2026-09-04 14:07:49.646] [warn]  local model tiny-q5_1 download failed TypeError: fetch failed
  (Observation: after hf stream terminated the app immediately fell to mirror; since .part.json url is the hf URL, a *working* mirror would have restarted from 0 and overwritten the 11 MB .part — wasted bytes, P3 design note; not reproducible here because both sources were down.)
- Restarted fakesrc, clicked Resume. fakesrc.log:
  2026-09-04T14:08:26.610Z [j3h43] >> GET /hf/.../ggml-tiny-q5_1.bin range=bytes=11010048- mode=ok
  2026-09-04T14:08:26.648Z [j3h43] << 302 {...x-linked-etag 8187...}
  2026-09-04T14:08:26.652Z [xp0hi] >> GET /cdn/ggml-tiny-q5_1.bin range=bytes=11010048- mode=ok
  2026-09-04T14:08:26.653Z [xp0hi] << 206 {..."content-range":"bytes 11010048-32152672/32152673","content-length":"21142625"}
  2026-09-04T14:08:40.730Z [xp0hi] done sent=21142625
- Final 32,152,673 B, sha256 8187...C3D7 ✓; main.log [2026-09-04 14:08:40.956] [info]  local model tiny-q5_1 downloaded; UI 'Model ready' (a-206-06). A1 variant 2: 实测通过.
- 'hang' mid-download variant: fakesrc re-reads mode per REQUEST only, an in-flight stream keeps flowing, so 'hang' cannot interrupt a running transfer -> tested hang only on a fresh request in A3 instead.
## A2 .part/.part.json mismatch
### (i) .part truncated to 5,000,000 B (json total 32152673)
- Relaunch: Settings button 'Resume download (15% done)' (a-206-07) = floor(5000000/32152673*100)=15 ✓.
- Click -> fakesrc.log:
  2026-09-04T14:09:47.838Z [24v1t] >> GET /hf/.../ggml-tiny-q5_1.bin range=bytes=5000000- mode=ok
  2026-09-04T14:09:47.843Z [6d3zg] << 206 {..."content-range":"bytes 5000000-32152672/32152673","content-length":"27152673"}
  2026-09-04T14:10:05.945Z [6d3zg] done sent=27152673
- Final 32,152,673 B sha256 8187...C3D7 ✓; main.log [2026-09-04 14:10:06.141] [info]  local model tiny-q5_1 downloaded. 实测通过.
### (ii) .part LARGER than json total (.part 23,855,104 B, json total set to 1000000)
- Relaunch: button 'Resume download (99% done)' (a-206-08) — partialProgress clamps got=min(size,total) -> 100% -> capped 99. MISLEADING (the 23 MB part is worthless vs a 1 MB total; user sees 99% then watches a full re-download from 0). No negative / >99 / stuck 100 observed.
- Click -> app hashed .part (size != total -> discard) and requested WITHOUT Range; fakesrc.log:
  2026-09-04T14:11:10.225Z [m2q9f] >> GET /hf/.../ggml-tiny-q5_1.bin range=- mode=ok
  2026-09-04T14:11:10.230Z [x4gwj] << 200 {..."content-length":"32152673"}
  2026-09-04T14:11:31.646Z [x4gwj] done sent=32152673
- Full re-download finished: 32,152,673 B sha256 8187...C3D7 ✓; main.log [2026-09-04 14:11:31.868] [info]  local model tiny-q5_1 downloaded; UI 'Model ready'. Functionally 实测通过; UX: 99% copy misleading (suggest P3).
## A3 three-source failure (sensevoice-small)
### (1) mode=fail503, tiny deleted via UI, sensevoice-small selected, click 'Download model'
- UI (c-01): button returns to 'Download model' (this IS the retry affordance; no separate 'Retry' button), red inline text: 'Download failed: network error — check your connection and try again.' Status 'Not configured'. Error appeared < 1 s.
- fakesrc.log (all 3 sources, each 503):
  2026-09-04T14:12:56.586Z [ejrkm] >> GET /hf/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx range=- mode=fail503
  2026-09-04T14:12:56.587Z [ejrkm] << 503 {"content-type":"text/plain"}
  2026-09-04T14:12:56.591Z [c2wio] >> GET /mirror/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx range=- mode=fail503
  2026-09-04T14:12:56.592Z [c2wio] << 503 {"content-type":"text/plain"}
  2026-09-04T14:12:56.595Z [o3l6p] >> GET /gh/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17-model.int8.onnx range=- mode=fail503
  2026-09-04T14:12:56.596Z [o3l6p] << 503 {"content-type":"text/plain"}
- main.log:
  [2026-09-04 14:12:56.587] [warn]  download source failed: http://127.0.0.1:18080/hf/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx Error: HTTP 503 (127.0.0.1:18080)
  [2026-09-04 14:12:56.592] [warn]  download source failed: http://127.0.0.1:18080/mirror/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx Error: HTTP 503 (127.0.0.1:18080)
  [2026-09-04 14:12:56.596] [warn]  download source failed: http://127.0.0.1:18080/gh/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17-model.int8.onnx Error: HTTP 503 (127.0.0.1:18080)
  [2026-09-04 14:12:56.597] [warn]  local model sensevoice-small download failed Error: HTTP 503 (127.0.0.1:18080)
- 实测通过 (3 sources tried, unified error copy). UX: copy says 'network error' although the servers answered 503 (server-side outage) — user may fruitlessly check their own connection; suggest P3 ('servers unreachable or busy' wording).
### (2) mode=ok (fakesrc has no SenseVoice files -> 404), click 'Download model' again (retry = same button)
- UI (c-02): identical copy 'Download failed: network error — check your connection and try again.' (404 is mapped by downloadError.ts HTTP \d{3} -> errNetwork).
- fakesrc.log: 14:13:37.736 [mndcb] /hf/... << 404 ; 14:13:37.739 [6vifn] /mirror/... << 404 ; 14:13:37.743 [k4ttb] /gh/... << 404
- main.log:
  [2026-09-04 14:13:37.737] [warn]  download source failed: http://127.0.0.1:18080/hf/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx Error: HTTP 404 (127.0.0.1:18080)
  [2026-09-04 14:13:37.740] [warn]  download source failed: http://127.0.0.1:18080/mirror/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx Error: HTTP 404 (127.0.0.1:18080)
  [2026-09-04 14:13:37.744] [warn]  download source failed: http://127.0.0.1:18080/gh/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17-model.int8.onnx Error: HTTP 404 (127.0.0.1:18080)
  [2026-09-04 14:13:37.744] [warn]  local model sensevoice-small download failed Error: HTTP 404 (127.0.0.1:18080)
- 实测通过 (retry works). UX: a 404 (file gone upstream / bad version) is not a 'check your connection' problem — user can never fix it by retrying; suggest P3 distinct copy.
### (3) fakesrc STOPPED (connection refused)
- fakesrc node process killed (port 18080 closed, TcpTestSucceeded=False). Click 'Download model' -> UI (c-03) again 'Download failed: network error — check your connection and try again.' — localized, no raw 'fetch failed' leaked to the UI. Appeared < 1 s.
- main.log:
  [2026-09-04 14:14:27.487] [warn]  download source failed: http://127.0.0.1:18080/hf/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx TypeError: fetch failed
  [2026-09-04 14:14:27.489] [warn]  download source failed: http://127.0.0.1:18080/mirror/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx TypeError: fetch failed
  [2026-09-04 14:14:27.491] [warn]  download source failed: http://127.0.0.1:18080/gh/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17-model.int8.onnx TypeError: fetch failed
  [2026-09-04 14:14:27.492] [warn]  local model sensevoice-small download failed TypeError: fetch failed
- 实测通过. Retry exposure: the same 'Download model' button re-enables immediately; there is no explicit 'Retry' label — acceptable but a 'Retry' label would be clearer (P3).
### (4) mode=hang on a fresh request (server accepts, never answers)
- fakesrc restarted, mode=hang, click 'Download model'. fakesrc.log: 2026-09-04T14:15:04.505Z [kyki1] >> GET /hf/csukuangfj/.../model.int8.onnx range=- mode=hang / (hanging)
- UI (c-04): button disabled 'Downloading 0%' with an empty progress bar for > 80 s (14:15:04 -> 14:16:30), no Cancel button, no timeout (download.ts has no fetch timeout/AbortSignal), no falling over to mirror/gh. User is stuck until app restart. 实测失败 (UX) — suggest P2: add a stall timeout (e.g. no bytes for 30 s -> abort and try next source) + Cancel button.
- Released by restarting fakesrc (socket closed) -> instantly 'Download failed: network error — check your connection and try again.' and button re-enabled. mode.txt restored to 'ok'.
## A4 Esc toast copy (ja / zh-TW)
- HARNESS ISSUE: supplied zh/en/ja/tw.wav are malformed (fmt chunk size 18, 'data' chunk id corrupted to 64 61 F4 1C, 1.5 s silence appended after the data chunk without size update). Chrome fake capture plays them as pure silence: main.log 'dictation finalize: durationMs=10021 maxPeak=0 voicedMs=0' x6 -> hands-free auto-exited (14:18:56-14:19:58). First ja Alt+Q attempt therefore produced no text and the Esc toast was not captured.
- Fix (harness only, tts\fixwav.js): extracted PCM from offset 46, rebuilt canonical 44-byte header, +3 s trailing silence (VAD 2 s needs >2 s gap) -> tts\fixed\{zh,en,ja,tw}.wav (peaks 18721/21696/27005/27608). Relaunched with -Wav fixed\zh.wav.
### ja (日本語) — relaunched with fixed\zh.wav, Notepad focused, Alt+Q 14:26:11, text typed ('Today, we are going to the park.' — recognition language=English so whisper translated; irrelevant here), Esc 14:26:37.
- Toast visible (a-esc-01 full, a-esc-02 3x zoom): title 'ハンズフリーモードを終了しました', body 'Esc が押されたため連続入力を停止しま / した。ハンズフリーキーで再開できま / す' — 3 lines, NO clipping, NO ellipsis, every character legible; but line 3 is a single orphan 'す' (line-clamp-3 exactly filled). Toast disappears after ~3 s.
- CDP toast.html (evidence only): body SPAN class 'line-clamp-3 leading-5 text-slate-300' text exact = 'Esc が押されたため連続入力を停止しました。ハンズフリーキーで再開できます', scrollWidth=255 clientWidth=255, scrollHeight=60 clientHeight=60 (3x20px), overflow=hidden, text-overflow=clip, -webkit-line-clamp=3 -> no overflow. Title SPAN 'shrink-0' sw=cw=229.
- Panel (hands-free indicator) during recording shows only a waveform + X close button, no text -> nothing to truncate (a-esc-00 = ss_11645e12).
- 实测通过 (copy complete & readable). UX P3: orphan single-character 3rd line; a 4th line would be clamped with no ellipsis (text-overflow clip), so longer locales are at risk.
### zh-TW (繁體中文)
- Settings -> 一般 -> 介面語言 繁體中文 (immediate). Notepad focused, Alt+Q 14:28:46 -> text typed (a-esc-04, panel = waveform + X only, no text), Esc 14:29:12.
- Toast (a-esc-03 full, a-esc-05 3x zoom): '免按模式已退出  已按 Esc，連續聽寫已停止；再按免按熱鍵可重新開始' — single line, every glyph visible, no clipping / ellipsis / overflow.
- CDP toast.html: title '免按模式已退出' sw=cw=100; body exact '已按 Esc，連續聽寫已停止；再按免按熱鍵可重新開始' sw=340 cw=340 sh=20 ch=20 (1 line), overflow hidden, text-overflow clip, line-clamp 3. 实测通过.
### en / zh-CN (optional)
- en (a-esc-06): 'Hands-free mode ended  Esc pressed, so continuous dictation stopped. / Press the hands-free hotkey to start again.' — 2 lines, no clipping. (CDP innerText during an earlier attempt: 'Hands-free mode ended\nEsc pressed, so continuous dictation stopped. Press the hands-free hotkey to start again.') 实测通过.
- zh-CN (a-esc-07): '免按模式已退出 已按 Esc，连续听写已停止；再按免按热键可重新开始' — 1 line, no clipping. 实测通过.
- Timing note: if Esc lands while an utterance is being transcribed, the panel first shows 'Transcribing...' and the Esc toast appears only after the paste (~1-2 s later) — toast not lost, just delayed.
## Cleanup (14:34)
- launch.ps1 -Kill -> SpeakType processes: 0. mode.txt = ok. fakesrc 18080 listening (restarted twice during A3; log continues in fakesrc.log). mockllm 18090 listening.
- %APPDATA%\SpeakType\models\ggml-tiny-q5_1.bin = 32,152,673 B, sha256 818710568DA3CA15689E31A743197B520007872FF9576237BDA97BD1B469C3D7 (intact). Empty models\sensevoice-small\ dir left behind by the failed attempts (no files). UI language restored to English; localModel setting = tiny-q5_1.
- Harness artifacts added (not product source): tts\fixwav.js, tts\fixed\*.wav (working fake-mic fixtures), tts\crop.ps1, tts\app.asar.orig (backup of the original asar before the test-only source-prefix patch). NOTE: rresources\app.asar is still PATCHED to 127.0.0.1:18080 — restore from app.asar.orig when part 2 is done.
