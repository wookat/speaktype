---
name: testing-speaktype-desktop
description: How to end-to-end test the SpeakType Windows desktop app (Electron, desktop/ dir) — launch flags, Doubao login workaround, synthetic hotkeys, store locations, known traps.
---

# Testing SpeakType Windows desktop (Electron)

## Network-blocking tests (download failure simulation) — CRITICAL traps

- **NEVER enable Windows Firewall on this box** (`netsh advfirewall set allprofiles state on`): it severs the Devin control channel instantly; recovery needed a VM reboot. The firewall is intentionally OFF, so program-scoped firewall block rules are silently ineffective too.
- **hosts-file blocking may silently stop working** (entries present, ANSI encoding fine, flushdns/Dnscache OK, but ping still resolves real IPs). Always verify with `ping <domain>` that blocking is effective BEFORE relying on it — a "blocked" download that succeeds means the block never applied.
- Null routes (`route add <ip> mask 255.255.255.255 <bogus-gw>`) do NOT block here (virtual NAT proxy-ARPs everything). Proxy env vars (`HTTPS_PROXY`) are ignored by Node/undici `fetch` in the Electron main process.
- **Working method: IPsec static policy** (independent of firewall profiles):
  `netsh ipsec static add policy name=P; add filterlist name=F; add filter filterlist=F srcaddr=me dstaddr=<ip-or-net> [dstmask=...] protocol=TCP mirrored=yes; add filteraction name=A action=block; add rule name=R policy=P filterlist=F filteraction=A; set policy name=P assign=y`.
  Block 143.204.0.0/16 (huggingface CF), hf-mirror IP, github.com IP, 185.199.108.0/22 (GH release CDN). Verify with node fetch (UND_ERR_CONNECT_TIMEOUT ≈10s per source). Cleanup: `set policy assign=n; delete policy/filterlist/filteraction`.

This is separate from the Chrome extension skill (`testing-speaktype`). Do NOT test the desktop app via the extension procedure.

## Launch (dev and installed)

- Dev: `cd desktop && npx electron out/main/index.js <flags>` (build with `npm run build` first).
- Installed (NSIS): `%LOCALAPPDATA%\Programs\SpeakType\SpeakType.exe <flags>`.
- Required flags in this environment:
  `--no-proxy-server --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=C:\Users\Administrator\tts\sample.wav`
  plus `--remote-debugging-port=9333` when you need CDP.
- WHY `--no-proxy-server`: Electron follows Windows system proxy (registry points at socks 127.0.0.1:1080 which is NOT listening here) → doubao.com fails with `ERR_PROXY_CONNECTION_FAILED`. Chrome on this box is launched without proxy so it works; Electron needs the explicit override.
- Fake mic works exactly like Chrome; the wav loops, sentence: 「帮我跟老板说那个方案需要再改一下明天上午之前给他答复」.

## Crafting fake-mic WAVs (PR #44 lessons)

- System.Speech WAVs contain a LIST chunk after `fmt ` — the `data` chunk is NOT at offset 44. Naively rewriting sizes at offsets 4/40 yields a file Chrome's fake capture plays as pure silence (dictation logs `maxPeak=0 voicedMs=0`). Parse chunks, extract the `data` PCM, and rebuild a canonical 44-byte-header wav (see `C:\Users\Administrator\tts\makehf2.ps1`).
- Continuous hands-free (Alt+Q) can be tested deterministically: fake-capture loops the file, so a wav of `speech + ~4s trailing silence` makes every loop one auto-finalized sentence (silence > vadSilenceMs=2000 triggers finalize, hands-free auto-restarts). A pure-silence wav drives the 6×10s no-voice rounds → auto-exit toast in ~62s.
- Verify toasts objectively with CDP polling of the toast.html target (`C:\Users\Administrator\tts\toastpoll44.cjs`, needs `--remote-debugging-port`).

## Doubao login inside Electron (independent cookie jar)

- No doubao credentials on the box. Workaround: copy Chrome's doubao.com cookies into the Electron session via CDP (`C:\Users\Administrator\tts\cookie_xfer.js`: reads Chrome's cookies on port 29229/2513, writes via Electron's 9333 using Storage.setCookies). Reload the bridge window after injecting.
- Then the real activation flow works: home 去激活 → doubao window → click its built-in voice input once (fake mic) → WS hook captures `api_app_key` into the store (`doubaoAppKeyCache`).

## Store / userData locations

- Dev: `%APPDATA%\Electron\speaktype.json`.
- Installed/packaged since 0.8.x: `%APPDATA%\SpeakType\speaktype.json` (older builds used `%APPDATA%\SpeakType 语音输入法\` — the app auto-migrates from it on first launch, so when testing a "fresh config" you must rename **both** dirs away, otherwise the legacy config is migrated back in and the test is invalid: look for `migrated legacy userData from …` in main.log).
- Offline model lives in `%APPDATA%\SpeakType\models\sensevoice-small\{model.int8.onnx (239MB), tokens.txt}`; keep a copy outside the config dir so a fresh-config run can restore it instead of re-downloading. `downloadLocalModel` skips files that already exist, so copying them in before clicking 下载 makes the card finish instantly (still logs `local model … downloaded`).
- To simulate "not activated": quit app, set `doubaoAppKeyCache` to `""`, relaunch → hold RightCtrl shows Chinese toast 「还没拿到豆包语音入口…」. Back up the file first.

## Offline (SenseVoice) live captions

- Offline live captions are approximated by re-decoding the buffered audio every ~1s (`asr.ts` PARTIAL_* consts): preview starts after 1s of audio and **stops once the buffer exceeds 20s**; the final result is still decoded on release. To prove it, zoom on the floating panel at ~8s and ~16s (text must grow) and again at ~25s (frozen/shorter than the final pasted text) during a >27s hold.
- Decoding is synchronous in the main process; during long re-decodes the whole UI (and CDP) can stall briefly. If the window stays white and all CDP targets time out, the main process is wedged — kill and relaunch (seen once on 0.8.3).

## Auto-learn corrections (0.8.5 watchedit.ts)

- Trigger conditions: `autoLearn && autoPaste && !failed && text contains Chinese` (dictation.ts finalize). Watcher = hidden `powershell.exe -NonInteractive` child of SpeakType polling the UIA focused element every 700ms for 15s (deadline starts inside PS, so add ~2-3s startup slack).
- Notepad classic Edit works via the Name-property fallback (full text incl. Chinese; verified with a standalone probe replaying the same UIA script).
- To make a correction that actually learns: the changed segment after common-prefix/suffix trimming must be a 2-6 char pure-Chinese word on the "right" side. Replacing 方案→草案 does NOT learn (shared 案 → diff becomes 方→草, 1 char). Use replacements sharing no boundary chars (答复→回执). Make the edit within ~3-13s after paste (before 15s deadline, after PS's first sample).
- Learning evidence: main.log `auto-learn: "X" -> "Y"` (mojibake in console is normal — read speaktype.json as UTF-8/base64), settings.hotwords appended, history text replaced. Since 6eaa42a the renderer refreshes immediately after a learn (learnCorrection calls pushSettings); Dictionary/History should show the new state without touching settings.
- When counting watcher processes, exclude your own shell: filter `Win32_Process powershell.exe` by `ParentProcessId ∈ SpeakType PIDs`, and never put match-strings like 'FocusedElement' in your own command line (it self-matches).
- Cross-window false positive (found in 0.8.5 first cut): typing Chinese in ANOTHER focused control during the 15s window could be mislearned. Fixed in 6eaa42a — the observer binds to the baseline control's UIA RuntimeId; re-verified that typing in SpeakType's search box after paste no longer learns.
- Incremental learning (0.9.1, 6f03041): each ~1.5s edit pause settles a round (toast per word), baseline rolls, LCS splits one big edit into multiple words. Testing traps: (a) the observation window is only WATCH_SECONDS=20 **from the last text change** — it does NOT extend while the user is merely idle, so edits starting >~20s after paste are silently missed (found as a real gap vs the "25s still learns" claim); batch click+select+type into ONE computer-use call, tool round-trips of 3-4s easily blow the window; (b) word pairs must share NO boundary chars or prefix/suffix trimming shrinks the diff below the 2-char threshold (明天→后天 shares 天 → only 明→后 → not learned, by design); (c) the History page "Clear all" button next to the search box wipes ALL history with no confirm — don't click it to clear the search filter.

## App-based persona rules

- Personas page → 「按应用自动切人设」→ 添加规则 → match text (matches process name OR window title, case-insensitive) + persona dropdown. The rule is evaluated **at record start** from the foreground window, and with no LLM configured it only shows up as the `personaName` on the history item (History list shows `HH:MM · <persona> · <secs> · Local offline`).
- Always run the counter-test (foreground = a non-matching window, e.g. the SpeakType window itself) — it must record the global persona instead, otherwise a hardcoded persona would look like a pass.

## Synthetic hotkeys (uiohook sees SendInput)

- Use `C:\Users\Administrator\tts\rkey.ps1 -Seq "down:rctrl,sleep:8000,up:rctrl"` (scancode SendInput). Works for RightCtrl hold, Alt+Space, Alt+digits (d1..d9), Alt+Q (`q` key added for PR #16), `f6`, `esc` (added for 0.8.6 hotkey-capture tests). If a key is missing from the script's `$map`, the script silently no-ops — add the VK/scancode pair before concluding a hotkey is broken.
- Hotkey capture (0.8.6 「录一个键」): the 10s capture window is easily missed if you press the key via a fresh `exec` shell (PowerShell startup can exceed 10s) — the button silently reverts and it looks like capture is broken. Press within the window via the computer-use `key` action (F6/Escape work) or a pre-warmed shell. Middle mouse: computer-use `middle_click` on any blank area is seen by uiohook. Auto-repeat bug found in 509ba94 (holding the OLD hotkey during capture triggered a real dictation via key-repeat keydowns) was fixed in c025093 (captureSwallowKeycode swallows that key until its keyup) — re-verified: hold 1.8s captures cleanly with no finalize, and normal dictation works right after.
- Persona toast lasts 2.6s — screenshot immediately, or verify via store `settings.personaId` change.
- Home page stats/activation card do NOT live-refresh in all cases; stats refresh on app restart.

## Known traps

- Alt+Space is the Windows system-menu key of the focused app (e.g. Notepad) — a paste issued while that menu modal is open is lost. Default toggle is `Alt+Q` since PR #15; if testing Alt+Space anyway, note AutoGLM (`AutoGLM.exe`, auto-running on this box) ALSO swallows it globally — kill it (`taskkill /f /im AutoGLM.exe`) first.
- Fixed in PR #15 (don't re-report): tray icon missing from the installed package; error panel not auto-hiding (now hides after 5s); home activation card not refreshing after key capture.
- Several stale orange tray icons from killed electron.exe dev runs linger in the tray overflow; hover to clear them.
- This VM has NO audio output device (`Get-CimInstance Win32_SoundDevice` empty, taskbar speaker shows red X) — the "mute other apps while recording" switch (VK_VOLUME_MUTE) has no observable effect here; mark it untested rather than inferring.
- System locale resolves to English, so with `uiLanguage: "system"` (fresh store) the app starts in English — useful baseline for i18n tests (since PR #16).
- Dev runs show the Electron version (e.g. 43.3.0) as the app version in sidebar/About (`app.getVersion()`); only the packaged app shows the real product version.
- Computer-use `type` action into the app sometimes drops shifted/capital letters (e.g. "SpeakType" → "peakype") — an input-injection artifact, not an app bug; verify chip text before reporting.
- Launching `rkey.ps1` via `Start-Process -WindowStyle Hidden` can steal the foreground window: the release-Ctrl+V then pastes into the hidden PowerShell instead of the target (looks like "paste failed" while transcription/history are fine). Workaround: re-click the target window during the hold, or diagnose with `C:\Users\Administrator\tts\fg_watch.ps1`.
- Rewrite-selection (0.8.7): `C:\Users\Administrator\tts\mock_chat.mjs` is a local OpenAI-compatible chat-completions mock (http://127.0.0.1:8975/v1, logs each prompt, returns fixed "[REWRITTEN-BY-MOCK]" text) — use it for the rewrite E2E when no real LLM key works. secret:personal:DEEPSEEK_API_KEY was Insufficient Balance (HTTP 402) as of 2026-08-10; verify with the settings-page Test connection button before relying on it. The computer-use `type` action drops `:` in URLs (https// bug) — paste base URLs from clipboard instead. Rewrite toasts last ~2.6s: time the screenshot ~1s after F8 release (fail path) or during the hold (no-model/no-selection paths).
- `C:\Users\Administrator\tts\mock_whisper.mjs` now matches the exact path `/v1/audio/transcriptions` (404 otherwise) — usable for both the success path and the HTTP-404 error branch of the ASR test-connection button. It can also return arbitrary text from `C:\Users\Administrator\tts\mock_text.txt` (useful for long/punctuation test cases).
- Clicking buttons on the floating panel: always `mouse_move` to the target first, then `click` — a direct click sometimes doesn't land in the panel window at all. To verify a click actually hit, inject a CDP click probe into panel.html and check for events.
- In hands-free/hold modes, VAD auto-ends ~2s after sample.wav's speech finishes (history items ~10s). When testing cancel/long-hold behaviors, separate the auto-stop timing from your own action, or a working cancel will look broken.

## Remote mic relay (relay/ Cloudflare Worker) local testing

- `npx wrangler dev` in `relay/` needs Node >= 22 (VM default 20.19 fails). Prepend `C:\hostedtoolcache\node\24.0.1\x64` to PATH first. Serves http://localhost:8787.
- The desktop app connects with `wss://` only. Local wrangler has no TLS: run the TLS-terminating proxy `C:\Users\Administrator\tts\wss_proxy.mjs` (8443 -> 8787, reuses the app's self-signed cert) and launch Electron with `NODE_TLS_REJECT_UNAUTHORIZED=0`; point the relay URL setting at `https://127.0.0.1:8443`.
- `C:\Users\Administrator\tts\relay_pipe_test.mjs` objectively verifies Worker pass-through (binary fidelity, start/stop/status/peer, room-occupied close 1008) against ws://localhost:8787 without the desktop app.
- CDP `Runtime.evaluate` with top-level `const` fails on re-run — wrap injected snippets in an IIFE.
- Real phone mousedown on the Chrome phone page steals foreground; use CDP `Input.dispatchMouseEvent` for hold/release so pasted text lands in the target window.
- A real relay deployment exists at `https://speaktype-relay.wookat520.workers.dev` — use it directly for production-path relay tests (no local wrangler/TLS proxy needed). Do NOT pass `--ignore-certificate-errors` to the fake-phone Chrome when targeting workers.dev, so the real TLS chain is verified too.
- PWA `/app` pairing (0.9.0+): the fixed pair code == `settings.remoteRelayRoom` (12 hex chars, generated once when Internet relay is first enabled; shown under the QR in Settings→General→Audio→Phone as microphone). Phone page stores it in `localStorage['speaktype-room']`; refresh must skip the pairing UI and auto-reconnect. `cdp_phone_hold090.js` (variant of cdp_phone_hold.js) also matches `/app` targets — note after installing the PWA there are TWO `/app` CDP targets (tab + standalone window); the script grabs the first, so close the tab if you need the standalone one. `beforeinstallprompt` DOES fire in Chrome-for-Testing here — clicking 添加到主屏幕 opens the native Install dialog and the installed standalone window works end-to-end. Console/SW checks: `C:\Users\Administrator\tts\cdp_pwa_check.js` (port 9444) prints SW registration, 4 asset statuses and console errors.

- 0.9.2 (2324483) autolearn window: watcher now renews the deadline while the FOCUSED control's UIA runtime id equals the anchor id (watchedit.ts L54-58), WATCH_SECONDS=45 / MAX=300 - idle 25-40s after paste then editing DOES learn (verified). The old '20s from last text change' trap only applies to <=0.9.1. History 'Clear all' now needs an inline confirm (Clear all history? -> red Clear / Cancel); Cancel preserves entries - safe to click once, but the red Clear still wipes everything.

- PR #39 (8c7166a) round: this RDP VM reports `matchMedia('(hover: hover)')=false`, and Tailwind v4 wraps every `hover:`/`group-hover:` rule in `@media (hover: hover)` — so hover-reveal UI (History card Copy/Correct/Delete) can NEVER appear visually here even with real cursor moves. Verify hover styles via keyboard (`focus-within`, Tab from the search box) plus a CDP selector check (`el.matches('.group-hover\\:opacity-100:is(:where(.group):hover *)')` while dispatching Input.dispatchMouseEvent moves); don't report hover as broken. Hotkey capture takes the FIRST keydown: modifiers/Space are valid single keys, so pressing a combo (Ctrl+Alt+Space) just captures LeftCtrl — trigger the amber "unsupported" warning with a digit/arrow key instead. Generate English test wavs locally with System.Speech (16k mono SpeechAudioFormatInfo); wavs loop during long holds, so a "short English" utterance becomes long if held >wav length — keep the hold under the wav duration. History Retry button only renders on FAILED entries with kept audio (keepFailedAudio default true); the easiest failure is an OpenAI-compatible provider pointed at http://127.0.0.1:9/v1. whisper tiny-q5_1 (~32MB) downloads in seconds via the Local model card and switches workers with no restart. Window bounds persist only via the window 'close' event (click X to tray) — taskkill /F skips persisting.

- Dev-mode launch (no packaged build needed): `cd desktop; npx electron-vite dev` (set NO_PROXY=*). Fake-mic Chromium flags cannot be passed this way - use a separate Chrome (--use-fake-device/-ui/-file flags) as the phone-mic source via the relay instead when the desktop app itself doesn't need a mic. PR #37+: official relay = https://speaktype.zalize.com/relay (relayBase = host+path); the exact old URL https://speaktype-relay.wookat520.workers.dev is auto-migrated back to the new default on every getSettings() read, so to test the old endpoint enter it scheme-less (speaktype-relay.wookat520.workers.dev) which bypasses the exact-match migration. Both domains hit the same Worker, so a phone on the old domain can pair with a desktop on the new one (same room). Relay URL edits only take effect after toggling Connection LAN->Internet relay. When editing speaktype.json from PowerShell use BOM-less UTF8 ([IO.File]::WriteAllText) - Set-Content writes a BOM that crashes electron-store JSON.parse.

- Round-3 (c181c63) testing: startup toasts only display ~2.6s (about 2.0-4.5s after launch) — pixel screenshots almost always miss them; instead poll the toast window's `document.visibilityState` via CDP (visible -> hidden timeline + DOM text is objective proof the toast fired). To verify polish.ts English punctuation rules deterministically, do NOT import the whole file (pulls in electron-store and crashes under plain node) — extract `addEnglishPunctuation` into a standalone harness and run it with `npx tsx`; reusable harness at C:\Users\Administrator\tts\polish_harness.ts.
- Round-5 lessons: (a) hold/rewrite hotkey taps shorter than holdDelayMs (default 120ms) are swallowed by hotkey.ts anti-misfire and trigger NOTHING (incl. exiting hands-free) — always hold synthetic keys >=0.2s before concluding a hotkey path is broken; (b) the CDP toast-poll process binds to a specific target and silently goes stale across app restarts — restart the poller together with the app or you get false 'no toast' results.
- Round-6 lessons: (a) the CDP toast poller script (toastpoll*.cjs) hard-exits after ~90s — before asserting "toast did not appear", confirm the poller process is still alive (or restart it), otherwise you get false negatives (nearly misreported a P1); (b) for fresh-userData tests, renaming `%APPDATA%\SpeakType` alone is NOT enough: if the legacy dir `%APPDATA%\SpeakType 语音输入法` exists, startup auto-migrates it into the new profile (main.log shows "migrated legacy userData") — move both dirs aside.

- PR #51 (VAD/ORT) lesson: to prove the app no longer loads a legacy native binding from a user-writable dir (e.g. the old `%APPDATA%\SpeakType\vad\onnxruntime_binding.node`), plant FAKE placeholder files with those exact names in the dir and restart — the app must stay healthy and log no load errors; byte-identical legacy files are not needed for the "present but not loaded" claim.

- PR #52/#53 (ITN / double-tap) lessons: (a) SenseVoice raw output has BUILT-IN ITN — it emits Arabic numerals for almost everything (二十三岁→"23岁", 幺三八零零→"13800", 三点半→"3点半" with an Arabic hour), so app-layer text-transform rules must be E2E-tested with sentences SenseVoice won't pre-convert (approximate numbers like 四五十个, idioms like 千万别) using an on/off toggle DIFF of the pasted text; also probe the rule module directly (esbuild the .ts to cjs and run cases under node). (b) Synthetic double-tap that beats anti-misfire: rkey.ps1 with ~70ms press duration + ~200ms gap reliably lands inside holdDelayMs=120 / DOUBLE_TAP_MS=400 windows; a single 70ms tap must do nothing (anti-misfire regression check).

- PR #55 (round-8 fixes) lessons: (a) combo-vs-double-tap testing: rkey.ps1's `$map` now includes `c` (vk=0x43/scan=0x2E); simulate "shortcut usage" as Ctrl held <120ms with another key tapped during the hold — this must NOT enter hands-free while a pure 2×70ms double-tap must. (b) SenseVoice itself mis-converts ambiguous number sentences at the ASR layer (两千五百分之五十 → raw "2550%"), so app-layer ITN ambiguity protection can only be verified by probing the rule module directly (esbuild itn.ts to cjs); E2E never sees the Chinese raw for such sentences.

- PR #57 (unified download / silent-partial filter) lessons: (a) in long hands-free silence runs, a manual exit hotkey RACES the ~1-minute 6-silent-round auto-exit — pressing "exit" after auto-exit RE-ENTERS hands-free and looks like "can't exit"; assert exit within 1 minute of entering, or double-prove via main.log finalize durationMs<10s + capsule gone. (b) Download failure paths: block sources via hosts entries `127.0.0.1 huggingface.co / hf-mirror.com / cdn-lfs*.hf.co` (hosts writes occasionally hit file locks — retry), assert UI shows the error AND the target dir has no .part leftovers; restore hosts by marker lines afterwards (script: C:\Users\Administrator\tts\hostsblock57.ps1).

- PR #59 (Parakeet / multi-model sherpa) lesson: when verifying a new sherpa-family model, use main.log `sherpa worker started (<modelId>)` to prove which model the worker loaded (switching models must log a NEW line), and drive it with a fake-mic WAV in the model's language (English: b2.wav); transducer engines ignore the Recognition language setting, so no language-dropdown change is needed to verify.

- PR #66 (site screenshots) lesson: to capture clean app screenshots for the website use CDP `Page.captureScreenshot` (script C:\Users\Administrator\tts\cdp_shot.cjs, with wincap.ps1 MoveWindow to set window size first) — this machine's screen is only 1280x720 and taskbar auto-hide doesn't work, so full-window GDI capture always includes the taskbar. Also: PowerShell variable names are case-insensitive ($h clobbers a $H parameter).

- PR #64 (dark root-cause) lesson: verifying theme/palette fixes must NOT rely on screenshot impressions — dark cards can mask a still-light body background. Assert numerically with CDP `getComputedStyle(document.body).backgroundColor` (helper: C:\Users\Administrator\tts\cdp_eval.cjs against port 9222, index.html page). In dark mode also open every native select's popup: the popup is system-white and option text may inherit light theme variables → low contrast.

- PR #61 (dark mode) lesson: to test "follow system" theme sync, flip the registry directly — `HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize` values AppsUseLightTheme/SystemUsesLightTheme (0=dark/1=light); Electron matchMedia reacts live, no restart or Windows Settings UI needed. Restore both to 1 afterwards.

- PR #49/#50 (enhanced punctuation) lessons: (a) SenseVoice CHINESE raw is essentially always self-punctuated (tried normal and +45% rate edge-tts long run-on sentences) so polish.ts needsPunctuation never fires for zh with SenseVoice - the ct-transformer model path can only be shown E2E with ENGLISH raw (e.g. b2.wav, raw has no mid-sentence punctuation); check main.log for "punct worker started" to prove the model (not rules) ran. (b) No local Chinese TTS voice exists (only David/Zira en-US, and python has no pip); generate Chinese WAVs online with `npm i msedge-tts` + node script (zh-CN-XiaoxiaoNeural, mp3) -> ffmpeg -ar 16000 -ac 1 -> rebuild canonical wav (see C:\Users\Administrator\tts\edgetts49.mjs / buildzh49.ps1); mkdir the toFile output dir first. (c) The punct model download from HF is fast (~5s) and real progress % is visible - click and screenshot within ~1.5s to catch mid-progress. (d) PowerShell here runs .ps1 files as ANSI: any script containing Chinese must be re-saved as UTF-8 WITH BOM before running or it fails to parse.

## Fresh-user simulation trap (legacy userData migration)

- Deleting `%APPDATA%\SpeakType\speaktype.json` is NOT enough to simulate a brand-new user: `src/main/migrate.ts` copies the config back from any legacy dir matching `SpeakType *` that contains a speaktype.json (e.g. `SpeakType ?????`). Renaming with a suffix (`SpeakType xxx-off`) still matches the glob - move the legacy dir OUT of %APPDATA% entirely, and move it back (original name) during cleanup.
- Verify via main.log: expect "no legacy userData to migrate" instead of "migrated legacy userData from ...".
- To make the Home missing-model banner appear for the default model, also stash the model files out of `%APPDATA%\SpeakType\models\<model>` and restore afterwards.

## Capturing loader-phase UI states (badge/spinner)

- SenseVoice offline transcription finishes in <1s, so the post-release loader is nearly impossible to screenshot. To hold the loader open, run a local OpenAI-compatible polish server that delays ~6s before responding (node http server on 127.0.0.1, returning `{choices:[{message:{content:...}}]}`), set polishBaseUrl/ApiKey/Model in speaktype.json, then screenshot during the "Polishing..." spinner. Restore polish settings afterwards.

## Fake mic and audio service traps (round 30)
- The fake microphone is NOT a system device: launch SpeakType.exe with Chromium flags `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=C:\Users\Administrator\tts\sample.wav`. Without these flags hotkeys appear dead: recording aborts instantly with a brief "Microphone unavailable / No microphone found" toast (bottom-center, ~2.6s, easy to miss).
- Windows Audio services (Audiosrv/AudioEndpointBuilder) may be DISABLED on this VM; the Chromium fake-capture flags work regardless. Re-enable with `sc.exe config Audiosrv start= auto` etc. only if real audio devices are needed.
- To debug the packaged main process, launch with `--inspect=9229` and use Runtime.evaluate over the Node inspector WebSocket; require app modules via `path.join(process.resourcesPath, 'app.asar', 'node_modules', ...)`.

## Verifying text-transform paths (round 47, PR #101)
- To prove a localCleanup/polish text transform really fired, screenshot the live-caption capsule mid-hold: it shows the raw ASR partial BEFORE cleanup (e.g. `costs$11`), then compare with the final pasted text (`costs $11`). Same build, before/after distinguishable.
- Custom English fake-mic WAVs can be generated offline with SAPI TTS: `SpFileStream` + `SpAudioFormat.Type=22` (16kHz mono) writes a wav directly usable as `--use-file-for-fake-audio-capture` source.
- When launched with fake-mic flags, the SpeakType main window steals foreground: before dictating into Notepad, click its taskbar icon and confirm focus via the Ln/Col status bar.
