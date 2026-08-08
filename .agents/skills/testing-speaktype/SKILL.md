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
- The app_key for the WS URL is extracted at runtime from doubao page JS (only near `voicegenie`,
  with a 6s budget). It is brittle by nature. To test the rest of the pipeline without relying on
  extraction, read the real key from a live capture (see the WS Hook helper below) and paste it
  into the popup's 「语音入口 app key」 field, or seed the cache from an extension page console:
  ```js
  chrome.storage.local.set({ doubaoAppKeyCache: '<key from capture>' })
  ```
  Never commit the key — secret scanning blocks the PR.
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
- Typing `chrome://…` into the omnibox with xdotool drops characters. Use
  `Set-Clipboard -Value 'chrome://extensions'` then Ctrl+V, or type `chrome`, send
  `shift+semicolon`, then `//extensions`.
- Inspect background/offscreen logs from `chrome://extensions` → Details → Inspect views
  (`service worker`, `offscreen.html`). The service worker shows as *Inactive* when idle; keeping
  its DevTools open keeps it alive, which changes timing — note that when debugging races.
- Resize the browser window for responsive checks with a small P/Invoke `MoveWindow` call from
  PowerShell; avoid `xdotool key super+Up` (tiles to half screen).

## Devin Secrets Needed
- none for the doubao provider (uses the existing logged-in doubao.com session in the Chrome
  profile). A branded Chrome install would be needed for `webspeech`; volc/zhipu need a relay URL
  plus App ID/Access Token or a GLM API key.
