# SpeakType r290 — Phase 3 report (packaged v0.17.0 @ f1e651d)

Recording: `C:\Users\Administrator\screencasts\r290-phase3\r290-phase3-edited.mp4`
Evidence root: `C:\Users\Administrator\r290\phase3\` (D1_dark820, D2_transcribe, D3_explore, restore_*.png, main.log.full.txt, prestate.txt, poststate.txt)

Harness notes (NOT product behaviour):
- Window resize done natively via Win32 (`tts\winsize.ps1` SetWindowPos / `winmin.ps1` MoveWindow). Electron's CDP does NOT expose `Browser.getWindowForTarget` (`-32601 wasn't found`), so `Browser.setWindowBounds` was unusable.
- Transcribe file pick done via CDP `DOM.setFileInputFiles` on the hidden `input[type=file]` (`tts\cdpfile.cjs`); everything after that observed natively.
- Long fixture `tts\long_zh_18min.wav` = zh_pad.wav ×65, 16 kHz mono s16, 1080.28 s (deleted at end).
- The tool harness went unresponsive once during the ko D1 walkthrough; the run resumed on the same app instance (no relaunch), evidence is continuous.

## Product defects / observations

| # | Sev | Item | Product vs harness | Evidence |
|---|---|---|---|---|
| 1 | Low-Med (layout) | **Personas page "add rule" button wraps vertically at 820 px** — zh-TW `新增規則` 46×78 px (4 lines, one char per line), ko `규칙 추가` 48×78 px, en `Add rule` 48×46 px (2 lines). Button lacks `shrink-0`/`whitespace-nowrap`; the persona name/description column eats the row width. Generic responsive issue, worst in CJK. Occurs in light too (dark not required). | Product | `D1_dark820\zhTW_personas_addRule_wrap4lines.png`, `zhTW_personas_addRule_zoom.png`, `ko_personas_addRule_wrap4lines.png`, `en_personas_addRule_wrap2lines_compare.png`, `*_personas_addRuleBtn_cdp.txt` |
| 2 | Med (UX) | **Native `<select>` dropdowns in the main window cannot be opened while a dictation is running.** Hands-free (Alt+Q) active with SpeakType foreground → 3 clicks on Settings→語音→認識語言 select: dropdown never opened, `document.activeElement` stayed `BODY`. Sidebar nav clicks DID work during dictation. Likely the always-on-top overlay window's repeated show/update deactivates the main window and Chromium closes the popup. Consequence: the planned "switch language mid-dictation" test could not be executed. | Product (fake mic doesn't affect window focus; medium confidence — not re-verified with a real mic) | `D3_explore\langswitch_02..04_select_click*_not_opened.png`, `langswitch_05_nav_home_works_during_dictation.png`, `langswitch_handsfree_mainlog.txt` |
| 3 | Low | **Transcribe page: after navigating away and back during a run, the sub-line under 「转录中… N%」 shows the generic formats hint (「支持 mp3 / wav / …」) instead of the file name.** `Transcribe.tsx` L241 renders local `fileName` state (empty after remount) rather than `state.fileName`. Result header after completion does show the file name. | Product | `D2_transcribe\run3_02_back_reattached_45pct_30segs.png`, `run3_03_reattached_subline_shows_formats_not_filename_zoom.png` |
| 4 | Info | Dictionary kana/hangul hint (PR #380) is only shown for words added in the current Save action (`setNotedWords(merged.filter(!words.includes(w)…))`). Re-entering the Dictionary page with 2 hangul words already stored shows no hint at all. Consistent with the PR's intent ("count follows current membership live" applies to the chips just saved) — recorded as observation, not a bug. | Product (by design?) | `D3_explore\ko_dictionary_reenter_no_hint_2_hangul_words.png` |
| 5 | Info | Hands-free with the SpeakType window in the foreground: every finalize is `paste skipped: no input target … text kept in history` + toast 「입력할 수 있는 창이 없습니다 / 내용이 기록에 저장되었습니다」. 12 history entries created in ~100 s. Correct behaviour; noted because the user gets a history flood if they forget to exit hands-free. | Product (fine) | `D3_explore\langswitch_01_handsfree_running_toast_no_input_target.png`, `langswitch_handsfree_mainlog.txt` |
| 6 | Harness quirk | `SetWindowPos(h, …, 700, 500, SWP_NOZORDER|SWP_NOACTIVATE)` on the frameless window produced a 836×**65535** window (client 820×65527); `MoveWindow(700,500)` on the same window clamps correctly to 836×568 (client 820×560) and `MoveWindow` also repaired the 65535 state. Users cannot reach this path by dragging; classified as harness/Win32 quirk unless the team knows otherwise. | Unsure (Electron/Win32) | `D3_explore\minsize_win32_700x500.txt`, `minsize_SetWindowPos_65535_quirk.png` |
| 7 | Info | ko hotkey-conflict warning renders in a 90 px-wide column, 5 lines at 12 px (amber `oklch(0.76 0.15 70)` on `rgb(28,31,42)`). Readable, cramped. | Product (cosmetic) | `D3_explore\ko_hotkey_conflict_warning_zoom.png`, `ko_hotkey_conflict_warning_cdp.txt` |

## D1 — Settings 820×720 dark, zh-TW and ko

| Item | Result | Notes / evidence |
|---|---|---|
| Theme → 深色 via General tab select; `theme=dark` in speaktype.json | PASS | body `rgb(20,22,29)`, cards `rgb(28,31,42)` |
| Window 820×720 (innerWidth 820) | PASS | `D1_dark820\*` |
| zh-TW General tab full scroll | PASS | no clipping, tabs 通用/語音識別/AI 潤色/關於 on one row |
| zh-TW Voice tab full scroll | PASS | `zhTW_voice_cdp.txt` |
| zh-TW Model/AI tab | PASS | `zhTW_model_cdp.txt` |
| zh-TW About tab | PASS | `SpeakType 0.17.0 (f1e651d)` |
| ko General / Voice / Model / About | PASS | `ko_general_01..04`, `ko_voice_01..03`, `ko_model_on_form`, `ko_about_01..02` |
| `select option` legibility in dark (zh-CN + ko interface-language dropdowns, hotkey dropdowns, theme dropdown) | PASS | option bg `rgb(35,39,52)` fg `rgb(228,232,241)`; `ko_uiLanguage_dropdown_dark.png`, `zhCN_uiLanguage_dropdown_dark.png`, `ko_handsfree_select_options_dark.png` |
| Focus ring visible in dark | PASS | ko Voice bottom `ko_voice_03_bottom_focusring.png`, persona modal textarea `ko_persona_modal_filled_focusring.png` |
| Hint boxes (amber Personas hint, violet/indigo cards) remap in dark | PASS | `ko_personas_top_amber_hint_dark.png` |
| Dictionary kana/hangul hint in dark zh-TW / ko | PASS | fg `rgb(163,173,195)` bg `rgb(43,48,64)`, wraps to 2 lines; `zhTW_dict_hint_zoom.png`, `ko_dictionary_hint.png`, `zhTW_dict_hint_cdp.txt` |
| Home / History / Dictionary / Personas / Transcribe pages zh-TW + ko | PASS except Personas | Alt+1..9 hint on one line; Personas → defect #1 |
| en comparison for Personas add-rule button | done | wraps to 2 lines in en → generic, worsened by CJK |

## D2 — Transcribe long audio (UI zh-CN, dark, SenseVoice)

| Item | Result | Notes / evidence |
|---|---|---|
| Decoding phase text 「正在解码音频…」 | UNTESTED (too fast) | WAV decode of 18 min finished < 1 s; first sample already 「转录中… 8%」 |
| Progress monotonic, ≤99 while running, ends 100 | PASS | samples 8→42→56→71→85→100 (`run1_progress_samples.txt`); bar width == text % |
| Segment list grows live | PASS | 5→28→37→47→56→65 segments |
| Final header 「共 65 段 long_zh_18min.wav · 2026/9/3 19:23:26」 | PASS | `run1_03_done_65segs_finishedAt.png`; whole 18-min file processed in ~37 s |
| main.log `file transcribe started (1080.3s, model=sensevoice-small)` / `done (65 segments)` | PASS | `run1_mainlog.txt` |
| history.json +1 entry source=file, personaName=long_zh_18min.wav, durationMs=1080280 | PASS | `run1_history_file_entry.txt` |
| transcribe-last.json written (65 segs, finishedAt) | PASS | `run1_transcribe-last.json` |
| TXT/SRT export | PASS | Electron opens a native Save-As (not silent Downloads write) → saved to Downloads; both files BOM EF BB BF; SRT 65 cues, indices 1..65 sequential, `HH:MM:SS,mmm`, start<end, monotonic (`export_long_zh_18min.{txt,srt}`); exports deleted |
| Cancel at 21 % (14 segs) | PASS | progress row gone < 1 s, no error; header 「共 15 段 long_zh_18min.wav」 (no finishedAt), partial list STAYS and is exportable; no `done` log line; history count unchanged; transcribe-last.json mtime unchanged (`run2_*`) |
| Page immediately usable → Run 3 started | PASS | |
| Navigate Home during run, return after ~10 s | PASS (with defect #3) | back on page: 「转录中… 45%」 30 segs live, ran to 65 segs (`run3_*`) |
| Too-long guard | UNTESTED (not required) | |

## D3 — Exploration (~25 min)

| Item | Result | Notes / evidence |
|---|---|---|
| Home Alt+1..9 hint zh-TW/ko at 820 | PASS | `D1_dark820\zhTW_home.png`, `ko_home.png` |
| Personas ko dark: create 「QA다크290」 → rename 「-edit」 → delete (2-step confirm) | PASS | modal/inputs readable; persisted `personas=0` afterwards; `D3_explore\ko_persona_*.png` |
| Dictionary zh-TW dark hint colours | PASS | see D1 |
| Voice language switch during dictation | FAIL / BLOCKED | defect #2 — select would not open while dictating |
| Hotkey conflict (rewrite = RightCtrl = hold key) | PASS | amber warning 「누른 채 말하기 키와 같아 다시 쓰기가 비활성화됩니다. 다른 키를 선택하세요.」 shown inline, value persisted, restored to F8 (`ko_hotkey_conflict_*`) |
| About tab version/commit | PASS | `SpeakType 0.17.0 (f1e651d)` |
| Window min-size | PASS | MoveWindow 700×500 → client 820×560; layout intact (`minsize_820x560_layout.png`); SetWindowPos quirk #6 |

## Restore (verified)
- theme=system, uiLanguage=zh-CN, language=zh, localModel=sensevoice-small, polishEnabled=false, hotwords=0 (김치찌개/회의록 removed via UI), personas=0, personaId=default, hotkeyRewrite=F8 (`poststate.txt` vs `prestate.txt`).
- Window restored to 1100×688 client (bounds 1100×680 saved).
- history.json restored from `history.prestate.json` (sha256 equal; 23 entries, 0 file entries; pre-restore copy `history_before_restore.json`).
- transcribe-last.json removed (did not exist before phase 3; copy in `D2_transcribe\transcribe-last_final.json`).
- `tts\long_zh_18min.wav` deleted; Downloads empty (also removed a leftover phase-2 file `speaktype-history-2026-09-03export_zhTW.md`).
- App relaunched via launch.ps1: `sherpa worker started (sensevoice-small)`, no error/warn (`mainlog_final_relaunch.txt`, `restore_04_final_relaunch_home.png`).
- Model dir, hosts, ACLs, firewall untouched.
