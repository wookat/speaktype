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
- Installed: `%APPDATA%\SpeakType 语音输入法\speaktype.json` (unicode dir name — `findstr` chokes on it; use PowerShell/.NET IO).
- To simulate "not activated": quit app, set `doubaoAppKeyCache` to `""`, relaunch → hold RightCtrl shows Chinese toast 「还没拿到豆包语音入口…」. Back up the file first.

## Synthetic hotkeys (uiohook sees SendInput)

- Use `C:\Users\Administrator\tts\rkey.ps1 -Seq "down:rctrl,sleep:8000,up:rctrl"` (scancode SendInput). Works for RightCtrl hold, Alt+Space, Alt+digits (d1..d9), Alt+Q (`q` key added for PR #16). If a key is missing from the script's `$map`, the script silently no-ops — add the VK/scancode pair before concluding a hotkey is broken.
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
- `C:\Users\Administrator\tts\mock_whisper.mjs` now matches the exact path `/v1/audio/transcriptions` (404 otherwise) — usable for both the success path and the HTTP-404 error branch of the ASR test-connection button.
