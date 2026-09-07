# SpeakType r290 Phase 2 results (packaged v0.17.0 @ f1e651d)

Recording: C:\Users\Administrator\screencasts\r290-phase2\r290-phase2-edited.mp4

| Item | Result | Notes |
|---|---|---|
| B1 zh-TW dict hint | PASS | count 2 -> 1 -> hidden (live) |
| B1 ko dict hint | PASS | count 2 -> 1 -> hidden |
| B2 durations zh-TW/ko | PASS | 8 秒/2 分鐘/1 小時 2 分 ; 8초/2분/1시간 2분; legacy persona 默认风格 kept |
| B2 Home stats | PASS | 2 分鐘 / 10 分鐘 ; 2분 / 10분 |
| B3 create/select/dictate custom persona | PASS | History meta shows QA自定義人設290 |
| B3 search QA自定 / 自定義 | PASS | |
| B3 search 自定义 (simplified) | FAIL | no match; zhNorm.ts PAIRS lacks 義->义 (control 人设 matches) |
| B3 export custom name zh-TW/en/ko | PASS | verbatim |
| B3 rename -> History shows old stored name | observation | QA自定義人設290 kept after rename to QA人設改名 |
| B3 delete -> History still renders name | observation/PASS | name kept; personaId reset to default. Delete confirm auto-resets after 4s (by design) |
| B4 zh-CN + en export | PASS | zh-CN 26x默认风格+1 custom; en 3x默认风格(legacy)+23xDefault+1 custom; BOM EF BB BF |
| C1b EPERM errStorage zh-CN/zh-TW/ko/en | PASS | exact strings; re-localizes w/o retry; only 1 `download source failed` + `local model ... download failed`; no .part left |
| C1c recovery w/o restart | PASS | download ~3s (too fast to screenshot %), sha256 match, worker started, dictation landed |
| C1d ENOSPC | FAIL | uncaughtException Error: ENOSPC ... write -> native error dialog -> app quits; no inline errStorage, no download-failed log; .part (9.5MB) + .part.json left |
| C2 Correct flow en/zh-CN/zh-TW/ja/ko | PASS | labels, textarea autofocus, Esc/Cancel/unchanged-save, chip exact, Add -> hotwords |
| C2 Korean entry under ko | PASS (by design) | no chip, no explanation |
| Restore | done | zh-CN, hotwords [], history.json == backup hash, personas 0, model hash ok, no DENY, no junction, vhdx gone, worker started |
