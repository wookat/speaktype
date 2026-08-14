---
name: testing-speaktype-desktop
description: How to end-to-end test the SpeakType Windows desktop app (Electron, desktop/ dir) — launch flags, Doubao login workaround, synthetic hotkeys, store locations, known traps.
---

# Testing SpeakType Windows desktop (Electron)

This is separate from the Chrome extension skill (`testing-speaktype`). Do NOT test the desktop app via the extension procedure.

## Launch (dev and installed)

- Dev: `cd desktop && npx electron out/main/index.js <flags>` (build with `npm run build` first).
- Installed (NSIS): `%LOCALAPPDATA%\Programs\SpeakType\SpeakType.exe <flags>`.
- Required flags in this environment:
  `--no-proxy-server --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=C:\Users\Administrator\tts\sample.wav`
  plus `--remote-debugging-port=9333` when you need CDP.
- WHY `--no-proxy-server`: Electron follows Windows system proxy (registry points at socks 127.0.0.1:1080 which is NOT listening here) → doubao.com fails with `ERR_PROXY_CONNECTION_FAILED`. Chrome on this box is launched without proxy so it works; Electron needs the explicit override.
- Fake mic works exactly like Chrome; the wav loops, sentence: 「帮我跟老板说那个方案需要再改一下明天上午之前给他答复」.

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
