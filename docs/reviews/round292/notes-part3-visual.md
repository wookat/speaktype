# SpeakType Round 292 — Part 3 notes (visual/product walk-through)

Build: desktop\release\win-unpacked\SpeakType.exe (d18aa8f), app.asar patched (fake model source) until END; then restored.
Recording: C:\Users\Administrator\screencasts\r292-part3\r292-part3-edited.mp4
All PNGs: C:\Users\Administrator\tts\evidence\d-*.png

## D1 — 820px / min width / dark theme
- SetWindowPos outer 836x700 → CDP `window.innerWidth+'x'+window.innerHeight` = "820x692".
- SetWindowPos outer 700 → still outer 836x700, CDP "820x692" → renderer min width = 820 (BrowserWindow minWidth 820, frame adds 16px).
- Theme select (Settings → General → Theme): options exactly `Follow system / Light / Dark`. Dark chosen → dark UI.
- Settings tabs that exist: General / Speech / AI polish / About. Hotkeys live inside General; remote/phone mic inside Speech. No separate Hotkeys / Remote tabs.
- Walk-through screenshots per locale: d-<lang>-home/history/dictionary/personas/transcribe/settings-general(-hotkeys)/settings-speech(-remote)/settings-aipolish/settings-about.png.
- Findings at 820px (see D4/D5 too):
  - ja Transcribe title subtitle "…字幕をエクスポート" wraps with orphan `ト` (d-ja-transcribe-title-subtitle-orphan-zoom.png) — P3.
  - No English leaks / mixed scripts / light-only colours found in the 5 locales at 820px dark. Untranslated: none observed.

## D2 — Row warning
- Requested Korean/English IME warning for RightAlt: does NOT exist in source (grep IME|Hangul|한/영 → none). Setting Hold=RightAlt shows no warning. → 未测 (feature absent); reported.
- Actual generic warnings tested (Row.tsx `mt-1.5 text-xs text-amber-600`, own full row under the control row):
  - Rewrite == Hold → `Same as the hold-to-talk key — rewrite is disabled. Pick a different key.` (+ amber select border)
  - Toggle == Hold / Rewrite → toggle conflict warning.
- CDP measurements (index.html, warning div): en 506x16, zh-CN 506x16, zh-TW 506x16, ja rewrite 506x16 / toggle 506x32 (2 lines, clean wrap), ko 506x16; scrollWidth == clientWidth in all → no clipping.
- Light theme parity: d-en-light-hotkey-warning-row.png (amber on cream, readable).
- Hotkeys restored to Hold=RightCtrl, Rewrite=F8, Toggle=Alt+Q.

## D3 — Personas
- Default cards + custom persona "QA292" created (name + prompt, Save disabled until both filled), 2 app rules added (input + persona select + Delete in one row, single-line in 5 locales), rule for `notepad` → QA292, Edit → "QA292 edited", Delete → `Delete? Click again` → confirmed.
- Store after delete (speaktype.json):
  ```
  appPersonas: {"match":"code.exe","personaId":"command-line"}
  personas: (empty)
  ```
  → QA292 and its `notepad` rule removed; unrelated `code.exe` rule kept (later removed via UI).
- Note: the 4 s auto-reset of "Delete? Click again" expired once during screenshots and the next click landed on Edit — behaviour as designed, but the window is tight.

## D4 — Transcribe cancel
- Fixture: tts\fixed\long800.wav (zh.wav PCM ×80 = 735.6 s, 23,539,244 B) — long128.wav (128.7 s) transcribes in 5.4 s, too fast to cancel reliably.
- First attempt with long128.wav: the click aimed at `Cancel` landed on `SRT` because transcription finished in between and the export row moved into the Cancel button's position → SRT save dialog opened (d-en-transcribe-cancel-click-hit-srt-dialog.png). UX hazard P3.
- main.log (exact):
  ```
  [2026-09-04 16:08:19.483] [info]  file transcribe started (128.7s, model=tiny-q5_1)
  [2026-09-04 16:08:24.897] [info]  file transcribe done (14 segments)
  [2026-09-04 16:09:37.765] [info]  file transcribe started (735.6s, model=tiny-q5_1)
  [2026-09-04 16:09:59.873] [info]  file transcribe cancelled at 81% (66 segments)
  [2026-09-04 16:10:36.047] [info]  file transcribe started (735.6s, model=tiny-q5_1)
  [2026-09-04 16:10:41.956] [info]  file transcribe cancelled at 21% (17 segments)
  [2026-09-04 16:10:58.314] [info]  file transcribe started (735.6s, model=tiny-q5_1)
  [2026-09-04 16:11:06.340] [info]  file transcribe cancelled at 28% (23 segments)
  [2026-09-04 16:11:21.408] [info]  file transcribe started (735.6s, model=tiny-q5_1)
  [2026-09-04 16:11:31.376] [info]  file transcribe cancelled at 35% (28 segments)
  ```
- UI at 35%: header `Result  Cancelled at 35% — partial result` (amber pill), `long800.wav · 28 segments`, `Copy all / TXT / SRT` enabled (sensible: partial export allowed).
- Badge per locale (all after Settings→language→back to Transcribe; filename `long800.wav` preserved every time):
  - en: `Cancelled at 35% — partial result` (1 line)
  - zh-CN: `已取消（35%），以下为部分结果` (1 line)
  - zh-TW: `已取消（35%），以下為部分結果` (1 line)
  - ja: `35% でキャンセルしました（部分的な結果）` → WRAPS to 2 lines at 820px; `全文をコピー` button breaks into 2 lines (`全文を / コピー`). At 1100px both single-line → width-related. P2/P3.
  - ko: `35%에서 취소됨 — 일부 결과` (1 line)
- Light theme parity: d-en-light-transcribe-cancelled-badge.png OK.
- Progress % is non-linear (10 s wait → 35%, but a click ~1 s after a 35% screenshot registered at 81%): the percent seems to jump in coarse steps.

## D5 — Exploration
- Home: `First time? 4 quick steps` → Show steps expands 4 steps (d-en-home-first-time-steps-expanded.png). Clear.
- History empty state: `No history yet / Hold the hotkey and speak — every entry will be recorded here`; zh-CN `暫时没有历史记录 / 按住热键开始语音，这里会记录你的每一次输入`.
- History `Clear all` confirm at 820px: `Clear all history? Clear` + `Cancel` wraps onto a second line, search box shrinks (d-en-history-clear-all-confirm-wraps*.png). P3.
- Cancelled file transcriptions are NOT saved to History (only the completed long128.wav run appears as `File · long128.wav · 2 min`). Design question.
- Dictionary empty state: `No hotwords yet / Add names and jargon unique to you — recognition will respect them`; zh-CN `还没有任何热词 / 我们会记住你独特的名称和词汇，支持手动添加`. Export/Clear disabled when empty.
- Tray menu updates live with UI language:
  - en `Open SpeakType / Speech recognition settings / Quit`
  - zh-CN `打开 SpeakType / 语音识别设置 / 退出`
  - zh-TW `開啟 SpeakType / 語音識別設定 / 退出`
  - ja `SpeakType を開く / 音声認識の設定 / 終了`
  - ko `SpeakType 열기 / 음성 인식 설정 열기 / 종료`
- Tray ghost icons: ~10 stale SpeakType tray icons in the overflow after repeated `-Kill` (taskkill) launches (d-tray-ghost-icons-after-kill.png). Harness artefact (hard kill), not reproducible via tray Quit.
- About: `SpeakType 0.17.0 (d18aa8f)`, `Releases`, `Open log folder`; no update banner / update check exists.
- Keyboard focus in dark: white focus ring visible on buttons and links (d-en-dark-focus-ring-*.png).
- Persistence after tray Quit → relaunch: theme dark, uiLanguage en, hotkeys RightCtrl/F8/Alt+Q, localModel tiny-q5_1 all kept.
  ```
  mainWindowBounds before quit: {"x":68,"y":20,"width":820,"height":692,"maximized":false}
  after relaunch (CDP): 60,20 836x688 inner 820x680   ← height lost 12 px once
  mainWindowBounds after 2nd quit: {"x":68,"y":20,"width":820,"height":680,"maximized":false}
  after 2nd relaunch: 60,20 836x688 inner 820x680     ← stable afterwards
  ```
  P3: one-time 12 px height shrink on first restart after a manual (SetWindowPos) resize.
- Download cancel: no Cancel control exists during `Downloading N%` (Part 1 c-04; Speech tab shows only disabled button + bar). 实测 (absent).
- Toast vs hands-free panel overlap: not re-tested in Part 3 (Part 2 core-04 shows exit toast after panel closed) → 未测 for simultaneous overlap.

## END — restore
```
procs=0
before: 36590621 3C54C664F6E9AFFED5336CFC13168E512924C19A1FD90D100DFCA75DFD5F07FD   (patched)
orig : 36590428 DBCEA1C3EEA4DDC1BD05CD6342D237A72B6ADCEEFAC1A5D16A3AF066EE96B9F8
after: 36590428 DBCEA1C3EEA4DDC1BD05CD6342D237A72B6ADCEEFAC1A5D16A3AF066EE96B9F8
patchsrc.ps1 -Restore → restored: resources\app removed -> True
resources\app exists: False
git status --porcelain →  M .agents/skills/testing-speaktype-desktop/SKILL.md   (only)
HEAD d18aa8f
listeners: 127.0.0.1:18080 (fakesrc pid 4236), 127.0.0.1:18090 (mockllm pid 4004); mode.txt=ok
tiny model: 32152673 B sha256 818710568DA3CA15689E31A743197B520007872FF9576237BDA97BD1B469C3D7
hosts: only pre-existing docker/k8s/git-manager entries, mtime 13:40 (before first launch 14:04) — never touched
firewall: Domain/Private/Public Enabled=False — never touched
junctions/reparse points under desktop\release: none
```
