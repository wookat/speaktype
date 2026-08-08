---
name: testing-speaktype
description: How to build, load and end-to-end test the SpeakType Chrome MV3 extension (WXT + React) on this Windows box, including fake-microphone setup, the doubao.com VoiceGenie provider, proxy/tunnel requirements and known environment traps.
---

# Testing SpeakType (Chrome MV3 voice-input extension)

## Build & load
- `npm run build` in the repo root → unpacked extension at `.output\chrome-mv3`.
- Load via `chrome://extensions` → Developer mode → Load unpacked, or start Chrome with
  `--load-extension=<repo>\.output\chrome-mv3`. Keep Devin's existing Chrome flags and
  `--user-data-dir` (see `C:\Users\Administrator\tts\launch_chrome.ps1` for the pattern).
- Test page with all three edit targets: `<repo>\test.html` (input / textarea / contenteditable
  + a tall scroll spacer). Chrome needs "Allow access to file URLs" enabled for `file://` pages.

## Fake microphone (no real mic on this box)
Add all three flags; without the third, recording captures silence:
```
--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream
--use-file-for-fake-audio-capture=C:\Users\Administrator\tts\sample.wav
```
`sample.wav` is 16 kHz mono Mandarin: 「帮我跟老板说那个方案需要再改一下，明天上午之前给他答复」.
**The file loops forever**, so a streaming ASR session keeps appending the same sentence and the
floating capsule's text bubble grows, pushing the 停止 button down the page — a click aimed at the
old coordinates will miss. Prefer stopping with the keyboard command (see below) or re-screenshot
immediately before each click.

## Stopping/starting recording reliably
- The command now defaults to **Alt+Q**: on Windows, Alt+Space is swallowed by the window system
  menu and never reaches the extension. Confirm the binding in `chrome://extensions/shortcuts`
  before relying on it.

## doubao provider (reuses logged-in doubao.com session)
- Requires an authenticated `doubao.com` session in the profile, plus a China-exit network path.
  On this box: Windows proxy `HKCU:\...\Internet Settings` `ProxyEnable=1`,
  `ProxyServer=socks=127.0.0.1:1080`, and Chrome launched with
  `--proxy-server=socks5://127.0.0.1:1080 --proxy-bypass-list=<-loopback>`.
- The 1080 SOCKS listener is an SSH tunnel that dies between sessions. Rebuild it:
  ```powershell
  # relay.js (127.0.0.1:2222) forwards through tailscale SOCKS 1055 to node xu-1
  node C:\Users\Administrator\ts\relay.js 2222 100.109.120.28 22   # if not already running
  ssh -i C:\Users\Administrator\.ssh\xu1_key -p 2222 -D 127.0.0.1:1080 -N `
      -o StrictHostKeyChecking=no -o ExitOnForwardFailure=yes root@127.0.0.1
  ```
  Verify with `Test-NetConnection 127.0.0.1 -Port 1080` and
  `curl.exe --socks5-hostname 127.0.0.1:1080 -o NUL -w "%{http_code}" https://www.doubao.com/chat/`
  (expect 200). doubao.com sometimes first renders 「该页面暂时不可用」 — click 刷新页面 once.
- Architecture to keep in mind while testing: content-script capsule → background SW →
  offscreen document (audio + provider) → background → **content script injected into a pinned
  background doubao.com tab**, which is where the VoiceGenie WebSocket is opened so it carries
  cookies. Background auto-creates that pinned tab on first record.

### Traps that will waste your time
- After reloading the extension, an already-open doubao.com tab has an orphaned content script.
  Background now pings the bridge and reloads/recreates the tab, and forwarding failures surface
  as a visible error instead of a permanent 「准备中…」 — if you ever see that state again with a
  silent console, that regression is back.
- **`browser` in this project is plain `chrome`** (`@wxt-dev/browser` resolves to `globalThis.chrome`
  in Chrome; there is no webextension-polyfill). So a content-script `onMessage` listener that
  answers with `return Promise.resolve(...)` is silently dropped: `tabs.sendMessage` resolves with
  `undefined` (no error, because the listener does exist). Symptom seen in practice: every record
  attempt ends in 「doubao.com 标签页里的桥接未就绪…」 and a new pinned doubao tab is spawned each
  time. Diagnose from an extension page console:
  ```js
  chrome.tabs.query({url:'*://*.doubao.com/*'}).then(t=>chrome.tabs.sendMessage(t[0].id,{target:'doubao-bridge',type:'ping'})).then(console.log)
  // undefined => ping broken (needs sendResponse + `return true`); {alive:true} => ok
  ```
  Workaround to keep testing the rest of the pipeline without touching source: patch the built
  file `.output\chrome-mv3\content-scripts\doubao-bridge.js`, changing the listener to
  `(t,__s,__r)=>{ ... if(i.type===\`ping\`){__r({alive:!0});return} ... }`, then hit reload on the
  extension card. Re-run `npm run build` afterwards to restore the pristine artifact.
- Auto app-key extraction scans `script[src]` for a `voicegenie`-nearby `app_key`. On the current
  `https://www.doubao.com/chat/` landing page there are only ~8 external scripts and **none of them
  contain the string `voicegenie`** (the voice chunk is lazy-loaded when the page's own mic entry is
  used), so extraction returns empty and the UI asks you to fill the key manually. Verify quickly by
  evaluating a scan in the doubao tab before blaming the regex.
- The app_key for the WS URL is extracted at runtime from doubao page JS (only near `voicegenie`,
  with a 6s budget). It is brittle by nature. To test the rest of the pipeline without relying on
  extraction, read the real key from a live capture (see the WS Hook helper below) and paste it
  into the popup's 「语音入口 app key」 field, or seed the cache from an extension page console:
  ```js
  chrome.storage.local.set({ doubaoAppKeyCache: '<key from capture>' })
  ```
  Never commit the key — secret scanning blocks the PR.
- To force an offscreen-creation failure (testing error surfacing) without touching source, edit
  the built `.output\chrome-mv3\background.js` and replace the string `offscreen.html` with a
  nonexistent file (e.g. `offscreen-missing.html`), then reload the extension. Clicking 说话 should
  show a red `Page failed to load.` bubble (since commit 79afb3a; before it the UI hung silently).
  Restore with `npm run build` + reload.
- `get-state` (and any background `onMessage` reply) must also use `sendResponse(...) + return true`;
  verify from an extension page console with
  `chrome.runtime.sendMessage({type:'get-state'})` → expect `{state:"idle"}`, not `undefined`.
- **Recurring dead-SW state**: the extension's MV3 service worker suspends after ~30s idle and on
  this box sometimes never wakes again — clicking 说话 / push-to-talk / `runtime.sendMessage`
  produce NO reaction and no error (`get-state` times out; `chrome://serviceworker-internals`
  shows Running Status: STOPPED). It reproduced repeatedly during PR #5 testing (every few minutes
  of idling). Recovery: reload the extension on `chrome://extensions` (the Start button on
  serviceworker-internals starts the SW but messaging may still fail). Before declaring any
  keyboard/UI feature broken, first confirm the SW is alive (e.g. the 说话 button reacts);
  otherwise you will misattribute the failure.
- **Chrome dispatches a keyup for held modifiers when the tab/window loses focus** (observed on this
  box for both tab switches and app-window switches, regardless of how the switch is triggered —
  mouse click, CDP `/json/activate`, or `WScript.Shell.AppActivate`). So any push-to-talk "cancel on
  blur/visibilitychange" logic races against a synthetic hotkey keyup that arrives FIRST and runs the
  normal stop path. When testing leave-page behavior, instrument keyup + blur + visibilitychange
  together (patch the built `content.js` with console.log markers) to see the ordering before
  concluding events "didn't fire".
- The computer-use screenshot/click tooling injects bursts of synthetic Shift/Control/Alt/Meta keyups
  before pointer actions. Never take a screenshot or click while a keyseq.ps1 hold is in flight if
  the test depends on the key staying down — switch tabs/windows via CDP activate or AppActivate.
- To simulate an unresponsive background deterministically (watchdog testing), patch the built
  `background.js`: change `if(a.type===\`start-record\`){` to `if(a.type===\`start-record\`){return;`,
  reload the extension. Note the content-side 2.5s watchdog only fires when capsule state is `idle`;
  a leftover `error` state from a previous attempt suppresses it, so F5 the page between attempts.
- After reloading the extension WITHOUT refreshing the page, the orphaned content script's
  `chrome.runtime.sendMessage` throws **synchronously** (`Extension context invalidated`), which a
  `.catch()` on the returned promise never sees — pressing the hotkey then does nothing visible.
- To get the *actual* WS URL/params the real doubao web app uses, there is a helper extension
  "WS Hook (research)" (`C:\Users\Administrator\tts\wshook.log`) that logs `ws-open` / `ws-close` /
  `ws-send-audio` lines with full query strings — far faster than reading DevTools Network.
- Server rejection frames surface in the capsule as `豆包识别错误 <statusCode>: <statusMessage>`,
  e.g. `40000000: no access right for current endpoint:sami.voicegenie,resourceID:original.sami.VoiceGenie,
  BaseResp.StatusCode:3003` (wrong/unauthorized app_key). Capture that text verbatim — it is the
  fastest signal for protocol/appkey problems.

## Web Speech provider — do not bother on this box
The browser here is **Chrome for Testing (Chromium build)**, which has no Google speech API key:
`new webkitSpeechRecognition().start()` immediately fires `error: not-allowed` on any page, even
though `getUserMedia({audio:true})` succeeds and the mic permission is `granted`. Testing the
`webspeech` provider requires a branded Google Chrome install.

## volc / zhipu providers
No credentials available. Only assert the graceful-failure UX: red bubble with a specific message
(`火山 provider 需要先在设置里填写中转地址…`, `智谱 provider 需要填写 API key 或中转地址`),
state returns to idle, nothing inserted, page does not crash.

## Misc UI-automation notes
- The popup's React-controlled text inputs (LLM 接口地址/API Key/模型 etc.) drop characters when
  typed fast via automation. Fill them with `Set-Clipboard -Value '...'` + click + Ctrl+A + Ctrl+V
  and verify the DOM value afterwards.
- Typing `chrome://…` into the omnibox with xdotool drops characters. Use
  `Set-Clipboard -Value 'chrome://extensions'` then Ctrl+V, or type `chrome`, send
  `shift+semicolon`, then `//extensions`.
- Inspect background/offscreen logs from `chrome://extensions` → Details → Inspect views
  (`service worker`, `offscreen.html`). The service worker shows as *Inactive* when idle; keeping
  its DevTools open keeps it alive, which changes timing — note that when debugging races.
- Resize the browser window for responsive checks with a small P/Invoke `MoveWindow` call from
  PowerShell; avoid `xdotool key super+Up` (tiles to half screen).

## Focus-loss / PTT cancel testing (window & tab switching)
- `WScript.Shell.AppActivate('Untitled - Notepad')` can bring the window to the FRONT while Chrome
  silently KEEPS keyboard focus — the page then gets no blur/visibilitychange and later receives the
  real keyup, so a "switch failed to cancel" result may be a harness artifact, not a product bug.
  Always verify with instrumentation (console markers on keyup/abort/visibility in the built
  content.js) that blur actually fired before declaring failure.
- Reliable focus steal: click the target app's taskbar icon via computer-use. The synthetic modifier
  keyup this injects is exactly the sequence PR #7's 150ms `ending` timer is designed for, so it is
  a realistic test, not interference.
- Tab switching without keyboard injection: CDP `PUT /json/activate/<targetId>` (see
  `cdp_activate.js`). This works reliably (blur+visibilitychange both fire).
- After a cancel, the last partial text may remain visible in the capsule bubble until the next
  action (cosmetic; do not mistake it for an insertion — check the input element value).

## Watchdog re-fire verification
- `start()` clears the bubble text before sending start-record, so a watchdog re-fire from an
  existing error state is visually provable: red text disappears at keydown and reappears ~2.5s
  later. Capture it with `poll_bubble2.js` via `cdp_attach.js` (100ms polling with timestamps).
- Orphaned content script (reload extension, don't refresh page): holding the PTT key now shows the
  red error ~0.3s after keydown; note the fire-and-forget `send()` helper (stop/cancel path) still
  throws an uncaught `Extension context invalidated` in the console (cosmetic).

## Devin Secrets Needed
- none for the doubao provider (uses the existing logged-in doubao.com session in the Chrome
  profile). A branded Chrome install would be needed for `webspeech`; volc/zhipu need a relay URL
  plus App ID/Access Token or a GLM API key.
