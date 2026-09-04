# Round 292 Part 2 - running notes (OpenCC t2cn regression + core regression)

Build: release\win-unpacked\SpeakType.exe @ d18aa8f (app.asar still patched -> fake source). tiny-q5_1 present. Start state: uiLanguage=en, language=en, localSimplified=true, hotwords=[], polishBaseUrl="".

## Source facts (verified by reading code)
- desktop/src/shared/zhNorm.ts L9-12: `toSimplified()` = `Converter({ from: "t", to: "cn" })` from `opencc-js/t2cn` (character table).
- desktop/src/main/asr.ts L245-263 (finish()): sherpa models `return transcribeSherpa(...)` raw; whisper path ends with
  `return settings.localSimplified !== false ? toSimplified(text) : text;` — no check of `settings.language`, so it also runs for language=ja.
- desktop/src/main/transcribe.ts L226-240 (transcribeSlice): identical `return settings.localSimplified !== false ? toSimplified(text) : text;` (file transcription).
- desktop/src/main/store.ts L50: default `localSimplified: true`.
- VoiceTab.tsx L183-186 Toggle label `settings.localSimplified` (zh-TW 「強制簡體輸出」, hint 「whisper 中文識別常出繁體，開啟後落字前自動繁→簡（僅對離線通道生效）。」; en "Force Simplified Chinese" / "Whisper often outputs Traditional Chinese; converts to Simplified before typing (offline channel only).").
- VoiceTab.tsx L318-323 recognition language options: auto / zh 「中文 Chinese」 / en / ja / ko / yue — there is NO zh-TW / 繁體 recognition option.
- History.tsx L121-132: `q = toSimplified(query...)`, matches `toSimplified(h.text)`, `toSimplified(h.raw)`, persona name. Dictionary.tsx L58-59 same for hotword search.
- hotwords.ts L11 `KANA=/[\u3041-\u30ff]/`, L120 `kanaContext = KANA.test(text)`, L128 `if (kanaContext || ...) continue;` -> CJK hotword replacement is skipped entirely for text containing kana; L142 toSimplified only used as the ">=3 chars must share one char" guard.
- dictation.ts L854-856: main.log only logs `dictation finalize: durationMs=.. maxPeak=.. voicedMs=..` — the recognized text (raw or converted) is NOT logged. history.json `raw` is what asr finish() returned, i.e. ALREADY converted; the pre-conversion whisper output is not persisted anywhere.

## Deterministic t2cn table check (node, cwd desktop, opencc-js/t2cn Converter t->cn)
```
気 -> 気 SAME
沢 -> 沢 SAME
広 -> 広 SAME
東京の空は広くて気持ちがいいです。沢山の人が公園に来ました。 -> 东京の空は広くて気持ちがいいです。沢山の人が公园に来ました。 CHANGED
沢山 -> 沢山 SAME
公園に来ました -> 公园に来ました CHANGED
広島 -> 広岛 CHANGED
國際 -> 国际 CHANGED
臺灣的軟體工程師喜歡喝奶茶，網路速度很快。 -> 台湾的软体工程师喜欢喝奶茶，网路速度很快。 CHANGED
軟體 -> 软体 CHANGED
網路 -> 网路 CHANGED
奶茶 -> 奶茶 SAME
裏 -> 里 CHANGED
著 -> 著 SAME
麼 -> 么 CHANGED
乾 -> 干 CHANGED
乾燥 -> 干燥 CHANGED
幹 -> 干 CHANGED
後 -> 后 CHANGED
面 -> 面 SAME
こんにちは、東京へ行きます -> こんにちは、东京へ行きます CHANGED
漢字とカタカナ -> 汉字とカタカナ CHANGED
関係 -> 関系 CHANGED
価格 -> 価格 SAME
図書館 -> 図书馆 CHANGED
経済 -> 経済 SAME
売買 -> 売买 CHANGED
対応 -> 対応 SAME
変化 -> 変化 SAME
発表 -> 発表 SAME
読書 -> 読书 CHANGED
実験 -> 実験 SAME
```
Reading: Japanese shinjitai-only forms (気/沢/広/価/経/対/変/発/実) are not in the TS table and survive; but kanji shared with Traditional Chinese (東, 園, 島, 係, 書, 館, 買, 漢) ARE converted, producing hybrid strings like 东京の空は広くて…公园に来ました / 広岛 / 関系 / 図书馆.

## B1 zh-TW dictation (fixed\tw.wav, UI 繁體中文, 識別語言 中文 Chinese)
- Recognition-language dropdown options (b-00): 自動偵測 / 中文 Chinese / English / 日本語 Japanese / 한국어 Korean / 粤语 Cantonese — no zh-TW / 繁體 option.
- Toggle (b-01, zh-TW UI): 「強制簡體輸出」 hint 「whisper 中文識別常出繁體，開啟後落字前自動繁→簡（僅對離線通道生效）。」 default ON.
- (1) Toggle ON, RightCtrl 9 s (14:46:57): Notepad typed `台湾的软体工程师喜欢喝奶茶,网路速度很快` (b-02) — all Simplified.
  main.log: `[2026-09-04 14:46:59.784] [info]  local whisper-server starting (model=tiny-q5_1, port=18717)` / `[2026-09-04 14:47:08.645] [info]  dictation finalize: durationMs=8867 maxPeak=32767 voicedMs=3520` — NO recognized text in the log (neither raw nor converted).
  history.json[0]: {"text":"台湾的软体工程师喜欢喝奶茶,网路速度很快","raw":"台湾的软体工程师喜欢喝奶茶,网路速度很快。","provider":"local","durationMs":8867} — `raw` is already Simplified, i.e. raw = post-toSimplified whisper text (only punctuation differs); pre-conversion text is not persisted.
- (2) Toggle OFF (speaktype.json settings.localSimplified=false), RightCtrl 9 s (14:49:01): Notepad typed `台灣的軟體工程師喜歡喝奶茶,網路速度很快` (b-03) — Traditional preserved (whisper itself emitted 台 not 臺). main.log `[2026-09-04 14:49:12.911] [info]  dictation finalize: durationMs=8875 maxPeak=32767 voicedMs=3580`.
  history.json[0]: {"text":"台灣的軟體工程師喜歡喝奶茶,網路速度很快","raw":"台灣的軟體工程師喜歡喝奶茶,網路速度很快。"}
- Conclusion: whisper tiny outputs Traditional for the TW voice, so the toggle is NOT moot; default ON silently converts a zh-TW user's dictation to Simplified (軟體→软体, 網路→网路, 喜歡→喜欢). 实测通过 (behaves as coded); UX judgement below.
- UX: for a zh-TW UI user a default-ON 「強制簡體輸出」 is surprising — the first dictation lands as Simplified with no hint on the Home page; the setting sits at the bottom of 語音識別 under the model block. The hint copy 「whisper 中文識別常出繁體，開啟後落字前自動繁→簡（僅對離線通道生效）。」 explains WHAT it does but frames Traditional as a defect ('常出繁體') — for a Traditional-script user that is the desired output. Suggest P2: default localSimplified=false when uiLanguage==='zh-TW' (or on first run derive from UI/system locale), and reword the hint for zh-TW.

## B2 Japanese (UI 日本語, 認識言語 日本語 Japanese, fixed\ja.wav, relaunch 14:51)
- Recognition-language list (b-00): 自動偵測 / 中文 Chinese / English / 日本語 Japanese / 한국어 Korean / 粵語 Cantonese — no zh-TW option.
- ja UI toggle (b-05): 「簡体字に強制変換」 hint 「Whisper は繁体字を出力することが多いため、入力前に簡体字へ変換します（オフラインチャネルのみ）。」 — shown ON even with 認識言語=日本語; nothing tells the user it also touches Japanese kanji.
- (1) Toggle ON, RightCtrl 9 s (14:52:06): typed `东京の空は広くて気持ちがいいです。` / `たくさんの人が后编に来ました` (b-04). 实测失败 (regression): 東京→东京, 後編→后编 (whisper misheard 公園 as 後編; both t2cn-converted). 広/気/来/kana unchanged.
  main.log: `[2026-09-04 14:52:08.090] [info]  local whisper-server starting (model=tiny-q5_1, port=18717)` / `[2026-09-04 14:52:16.970] [info]  dictation finalize: durationMs=8884 maxPeak=32768 voicedMs=3540`
  history.json[0]: {"text":"东京の空は広くて気持ちがいいです。\nたくさんの人が后编に来ました","raw":"东京の空は広くて気持ちがいいです\nたくさんの人が后编に来ました"} (raw already converted)
- (2) Toggle OFF, RightCtrl 9 s (14:54:20): typed `東京の空は広くて気持ちがいいです。` / `たくさんの人が後編に来ました` (b-06 shows both runs) — intact Japanese, proves whisper raw was 東京/後編.
  main.log `[2026-09-04 14:54:31.766] [info]  dictation finalize: durationMs=8877 maxPeak=32768 voicedMs=3560`
  history.json[0]: {"text":"東京の空は広くて気持ちがいいです。\nたくさんの人が後編に来ました","raw":"東京の空は広くて気持ちがいいです。\nたくさんの人が後編に来ました。"}
- Code (ungated by language): desktop/src/main/asr.ts L263 `return settings.localSimplified !== false ? toSimplified(text) : text;` (inside finish(); sherpa branch L246 returns raw). transcribe.ts L240 identical. No check of settings.language === "ja" anywhere; `localSimplified` grep hits only these two + store default + VoiceTab.
- Deterministic t2cn table (node, desktop/): 気→気 沢→沢 広→広 価格/経済/対応/変化/発表/実験 unchanged; 東京→东京 公園→公园 広島→広岛 関係→関系 図書館→図书馆 読書→読书 売買→売买 漢字とカタカナ→汉字とカタカナ こんにちは、東京へ行きます→こんにちは、东京へ行きます; 沢山→沢山; full sentence → 东京の空は広くて気持ちがいいです。沢山の人が公园に来ました。
- Severity suggestion P1: with default ON, every Japanese whisper user gets hybrid Simplified-Chinese/Japanese text for common words (東京, 公園, 関係, 図書館, 読書, 漢字…). Fix: gate on language (`settings.language === "zh" || auto && detected zh`) or at least skip when text contains kana.

## B3 History / Dictionary search (UI 日本語)
- Dictionary: pasted 沢山 / 広島 / 東京 → 保存 (b-07a, "3/300 ホットワード"). Search results (ホットワードを管理 box):
  - `广岛` → 「一致するホットワードはありません。」 (b-07) — no hit: 広 is not in TSCharacters, so 広島→広岛 ≠ 广岛.
  - `东京` → hits `東京` (b-08) — cross-script hit (query and stored word both toSimplified → 东京).
  - `泽` → no hit (b-10) — 沢 not in table, so 沢山 stays 沢山.
  - `沢` → hits `沢山` (b-09).
- History (entries: 14:54 ja raw 東京…後編, 14:52 ja converted 东京…后编, 14:49 zh-TW raw, 14:47 zh-TW converted, older en):
  - `沢` → 「一致する履歴はありません。」 (b-11) — whisper wrote たくさん (kana), no 沢 in any entry; nothing to false-hit.
  - `広` → 2 ja entries (b-12). `気` → 2 ja entries (b-13).
  - `泽` → none (b-14). `广` → none (b-15). `气` → none (b-16) — Japanese 気 does NOT map to 气 (気 not in TSCharacters), so a zh user searching 气 never sees ja 気 entries; conversely no false hits.
  - `东京` → BOTH ja entries incl. the raw-Japanese 東京 one (b-17). `東京` → both (b-18). So 東京↔东京 is a two-way cross-script match; 沢↔泽 / 広↔广 / 気↔气 are NOT matched (table has no shinjitai→simplified mappings).
- Code: History.tsx L121-132 `const q = toSimplified(query.trim().toLowerCase()); … toSimplified(h.text.toLowerCase()).includes(q) || toSimplified(h.raw.toLowerCase()).includes(q)`; Dictionary.tsx L57-59 `const q = toSimplified(query…); words.filter((w) => toSimplified(w.toLowerCase()).includes(q))`.
- hotwords.ts: L9 `const KANA = /[\u3041-\u30ff]/;` L120 `const kanaContext = KANA.test(text);` L128 `if (kanaContext || trimmed.length < 2 || !CJK.test(trimmed) || out.includes(trimmed)) continue;` → any text containing kana skips CJK hotword replacement entirely; L142 (n>=3 words) `toSimplified(c) === toSimplified(trimmed[k])` only as a same-char guard. So a Simplified hotword 广岛 can never rewrite Japanese 広島 in kana-bearing text; for a pure-kanji utterance it also cannot (広≠广 under t2cn). 沢山 hotword did not affect たくさん (kana → no correction; hotwords also never do kana→kanji).
- Live re-dictation ja.wav with hotwords present, toggle OFF (15:00:22): typed `東京の空は広くて気持ちがいいです。` / `たくさんの人が後編に来ました` (b-19) — identical to run without hotwords. main.log `[2026-09-04 15:00:33.327] [info]  dictation finalize: durationMs=8873 maxPeak=32768 voicedMs=3560`; history text/raw identical to 14:54 entry.
- Judgement: 沢↔泽 matching does NOT happen today (table gap), and 東京↔东京 does. For a Japanese user the cross-script hit 东京→東京 is harmless (search is an "includes" filter; a ja user rarely types 东京). The inconsistency (東京 matches, 沢/気/広 don't) is a side effect of the char table, not a design. 建议不修 the search normalization (低价值, no false positives observed); 建议修 the ASR-side conversion (B2) which is the real regression.

## CORE regression (UI English, Recognition language 中文 Chinese, Force Simplified ON, fixed\zh.wav, relaunch 15:03:11)
### C1 RightCtrl hold — 实测通过
- rkey "down:rctrl,sleep:9000,up:rctrl" at 15:03:42 → Notepad typed `今天天气很好!我们一起去公园散步!` (core-01, core-01a).
- main.log: `[2026-09-04 15:03:11.982] [info]  SpeakType 0.17.0 starting (packaged=true)` / `[2026-09-04 15:03:45.174] [info]  local whisper-server starting (model=tiny-q5_1, port=18717)` / `[2026-09-04 15:03:54.043] [info]  dictation finalize: durationMs=8874 maxPeak=32768 voicedMs=3180`
- history.json[0]: {"text":"今天天气很好!我们一起去公园散步!","raw":"今天天气很好!我们一起去公园散步!","provider":"local","durationMs":8874}

### C2 Alt+Q hands-free — 实测通过
- Alt+Q at 15:05:12 → bottom-center hands-free panel (waveform + X, core-02); while a segment is being processed the panel shows a spinner + `Transcribing…` (core-02a). wav loops → 5 sentences typed by 15:05:52 (core-03): `今天天气很好!我们一起去公园散步!` ×4, `今天天气很好,我们一起去公园散步!`, `今天天气很好,我们一起。` (last cut by exit).
- main.log: `[2026-09-04 15:05:20.454] [info]  dictation finalize: durationMs=6001 maxPeak=32768 voicedMs=3220` / `[15:05:29.654] … durationMs=8268 maxPeak=32561 voicedMs=3140` / `[15:05:39.054] … durationMs=8449 …` / `[15:05:48.054] … durationMs=8078 …` / `[2026-09-04 15:05:54.236] [info]  dictation finalize: durationMs=5247 maxPeak=27275 voicedMs=2080` (segment cut by Alt+Q). No explicit "hands-free start/stop" log line exists.
- Second Alt+Q → toast (core-04, captured on a repeat cycle 15:07:59–15:08:01 because the toast appears ~1.5 s after Alt+Q, after the final segment's `finalize: durationMs=475 maxPeak=0 voicedMs=0`): title `Hands-free mode ended`, body `Continuous dictation stopped. Press the hands-free hotkey to start again.` CDP toast.html innerText confirms the same text.

### C3 Esc cancel during hold — 实测通过
- Notepad cleared to `[C3 marker] `; rkey "down:rctrl,sleep:3000,down:esc,sleep:60,up:esc,sleep:300,up:rctrl" at 15:09:15 → toast `Dictation canceled` / `Nothing was typed` (core-05); Notepad still `[C3 marker] ` only.
- main.log: no new line after `[2026-09-04 15:08:00.834] [info]  dictation finalize: durationMs=475 maxPeak=0 voicedMs=0` (cancel is not logged at all — nothing to cite; P3 observability). history.json newest entry unchanged (at=1788534480200 = 15:08:00, durationMs=6005) → no history entry created by the cancelled hold.
- Esc during hands-free: covered in Part 1 A4 (toast `Hands-free mode ended` / `Continuous dictation stopped because Esc was pressed…` in en/ja/zh-TW/zh-CN, see notes-part1.md, a-esc-*.png).

### C4 F8 rewrite with mock LLM — 实测通过
- Pre-check, no polish model configured: F8 hold 1.5 s with text selected (15:11:11) → SpeakType window came to front on Settings → AI polish (core-06a). Toast text (CDP toast.html innerText; visual missed, toast gone before screenshot): `Rewrite needs a polish model` / `Configure an OpenAI-compatible model in Settings → AI polish`. A short F8 tap (<120 ms) does nothing (by design, accidental-press guard).
- Settings → AI polish: toggle "Enable AI polish" ON, Base URL `http://127.0.0.1:18090/v1`, API key `mock` (password field), Model `mock-llm`, "Test connection" → green `Connected: mock-llm` (core-06). mockllm.log: `2026-09-04T15:12:00.098Z POST /v1/chat/completions auth=yes body={"model":"mock-llm","max_tokens":4,"messages":[{"role":"user","content":"ping"}]}` (uses chat completions, not /v1/models).
- Notepad `hello world round 292`, Ctrl+A (core-07), rkey "down:f8,sleep:9000,up:f8" at 15:12:44 (zh.wav as spoken instruction) → selection replaced by `[MOCK-REWRITE-R292] 你按用户的口述指令改写下面这段文字（可能是改写、润色、翻译、扩写、缩写等）。 要求： 1. 只输出改写后的正文，不要解释、不要引号、不要 Markdown 代码块。 …` (core-08 head, core-08a tail) — i.e. the mock echoed the whole user message; the replacement starts with the required `[MOCK-REWRITE-R292]` prefix. Repeated twice more (15:14:39, 15:15:33 25-s hold) with identical success.
- mockllm.log request body (Authorization header value omitted; mock logs only auth=yes):
  `2026-09-04T15:12:55.469Z POST /v1/chat/completions auth=yes body={"model":"mock-llm","temperature":0.3,"messages":[{"role":"user","content":"你按用户的口述指令改写下面这段文字（可能是改写、润色、翻译、扩写、缩写等）。\n要求：\n1. 只输出改写后的正文，不要解释、不要引号、不要 Markdown 代码块。\n2. 严格遵守指令；指令没要求的部分不要擅自改动。\n3. 保持原文的换行与列表结构。\n\n口述指令：\n\"\"\"今天天气很好!我们一起去公园散步!\"\"\"\n\n原文：\n\"\"\"hello world round 292\"\"\""}]}`
  Note: single user-role message (no system message); prompt is Chinese regardless of UI language (en) — fine for LLMs, but worth knowing.
- main.log: `[2026-09-04 15:12:55.127] [info]  dictation finalize: durationMs=8557 maxPeak=32768 voicedMs=3220` / `[15:14:50.450] … durationMs=8551 …` / `[2026-09-04 15:16:00.554] [info]  dictation finalize: durationMs=24557 maxPeak=32768 voicedMs=9460`. No rewrite-specific log line (no "rewrite start/done/len") — P3 observability.
- UX while rewriting: during the F8 hold the bottom panel is the same waveform + X pill as normal dictation (core-08b/c) — nothing indicates "rewrite mode" vs dictation. After release the mock answers in ~0.35 s so the "rewriting/polishing" state was too brief to observe; after release the panel briefly shows the spinner state (seen as `Transcribing…` in C2, core-02a); could not visually confirm whether a distinct rewrite/polish label appears during the LLM call (未测 — needs a slow LLM). Suggest P3: a distinct rewrite-mode indicator on the panel during the F8 hold.
- F8 with no selection (caret at end of text), F8 held 1.5 s (15:16:46 via rkey, then repeated via native hold_key for the screenshot) → toast `Nothing selected` / `Select the text first, then hold the rewrite key and say an instruction` (core-09); no request in mockllm.log, no finalize in main.log, Notepad unchanged.


