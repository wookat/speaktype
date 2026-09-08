<div align="center">

<img src="docs/assets/logo.png" width="128" alt="SpeakType logo" />

# SpeakType

**You speak, it types — open-source, local-first AI voice typing, into any app.**

Hold a key, talk, release — the words land at your cursor.<br/>
Offline recognition by default, optional cloud engines, a dictionary that learns from your own edits, and your phone as a microphone. Keys and audio never leave your control.

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11%20x64%20%C2%B7%20macOS%20preview-0078d4.svg)](#-download--install)
[![Release](https://img.shields.io/badge/Release-v0.19.0-8b5cf6.svg)](https://github.com/wookat/speaktype/releases/latest)
[![i18n](https://img.shields.io/badge/UI%20languages-5-16a34a.svg)](#-internationalization)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-22c55e.svg)](CONTRIBUTING.md)

[⬇ Download](#-download--install) · [🌐 Website](https://speaktype.zalize.com) · [简体中文](README.zh-CN.md) · [macOS guide](docs/macos.md) · [Report an issue](https://github.com/wookat/speaktype/issues) · [Dev docs](desktop/README.md)

<img src="docs/assets/demo.gif" width="720" alt="SpeakType demo — hold a key, speak, and the words land at your cursor" />

<img src="docs/assets/screenshot-home.png" width="720" alt="SpeakType home" />

</div>

---

## ✨ Why SpeakType

Most AI dictation tools are closed source, or route your voice through the vendor's own servers. SpeakType flips that:

|  |  |
|---|---|
| 🔓 **Fully open source (MIT)** | Protocols, correction algorithms, UI — every line is readable, hackable, self-hostable |
| 🛡️ **Local-first, no backend of its own** | Runs no cloud service; recognition happens on your machine by default, and audio goes to a cloud engine only if **you choose and configure** one |
| 🧩 **Everything pluggable** | Recognition engine, polishing model, hotword dictionary, persona styles, hotkeys: all yours |
| 📈 **Learns from your edits** | Fix a word by hand after it lands and SpeakType learns `{wrong → right}` into your dictionary — the same mistake is corrected automatically next time |
| 📱 **Your phone as the microphone** | Desktop with no mic? Scan a QR code and talk into your phone — LAN direct, or through a relay you can self-host |

## 🎬 Core experience

|  |  |
|---|---|
| 🎙️ **Push to talk** | Hold `RightCtrl` on Windows / `Right Option` on macOS (any key or mouse side button, recordable), live captions stream as you speak, release to type into the focused app. Speak the next phrase while the previous one is still finishing — it queues instead of being dropped |
| ⚡ **Hands-free mode** | Tap `Alt+Q` (`Option+Q` on macOS) or double-tap the hold key to start; sentences auto-split on silence, a longer pause starts a new paragraph, `Alt+Q` again ends the session. Optional voice commands ("new line", "new paragraph", "delete last sentence") |
| ⎋ **Cancel anytime** | `Esc` during recording, transcribing or rewriting discards the utterance — nothing is typed and nothing is learned |
| 🎭 **Personas** | `Alt+1..9` to switch: default / auto-translate / report-to-boss / CLI / custom prompt — and optionally switch automatically per foreground app |
| 📖 **Hotword correction** | Add names and product terms; homophone and near-homophone errors are fixed locally via pinyin matching. Corrections you make by hand are learned automatically (Windows) |
| ✍️ **Select and rewrite** | Select text, hold `F8` and say "translate to English" / "make it formal" — the selection is replaced in place; if you switch windows meanwhile, the result waits in the clipboard instead of landing in the wrong app |
| 🧠 **Enhanced voice detection** | Optional Silero VAD neural network (~35MB, on-device) for accurate auto-stop and hallucination filtering in noise |
| 🔤 **Punctuation & numbers** | Rule-based sentence punctuation out of the box, an optional on-device punctuation model (~281MB add-on), and Chinese spoken-number formatting (三点半 → 3:30) |
| 🔁 **Retryable failures** | Failed recordings are kept locally (max 20 clips / 7 days / 50MB, can be disabled); retry from History without re-speaking |
| 🎵 **File transcription** | Drop an audio/video file (mp3, wav, m4a, ogg, flac, mp4… up to 3h) → offline segmented transcript with timestamps → export TXT, timestamped TXT, SRT or VTT |
| 🪟 **Floating bar that stays out of the way** | The recording bar and captions dock at the bottom, or automatically move to the top when they would cover the text cursor; fixed top/bottom also available |
| 🌗 **Dark mode** | Follows the OS light/dark setting in real time, or force light/dark in Settings |
| 🧹 **Reset & cleanup** | Three-tier reset: restore settings, wipe all data, or delete downloaded models |

<div align="center">
<img src="docs/assets/screenshot-personas.png" width="720" alt="Personas" />
</div>

## 🎛️ Recognition engines (pick one, switch anytime)

<div align="center">
<img src="docs/assets/screenshot-asr.png" width="720" alt="Recognition settings" />
</div>

1. **Built-in offline recognition** (default, recommended) — one-click model download inside the app; no network after that, no account, no keys.

   | Model | Size | Best for | Notes |
   |---|---|---|---|
   | **SenseVoice Small** (default) | 240MB | Chinese, Cantonese, Japanese, Korean, English | ~0.27s model inference per utterance (release-to-text end-to-end ≈0.6s) in our tests, punctuation built in |
   | **Parakeet TDT 0.6B v3** (int8) | 670MB | English + 25 European languages (no Chinese) | Highest accuracy for English; the int8 build occasionally clips the first word of a sentence ("Please" → "Ple") |
   | **Parakeet full precision** (fp32) | 2.5GB | Same languages as Parakeet | Fixes the clipped-first-word issue at the cost of ~2.7GB RAM while loaded; same speed as int8 in our measurements. Optional — int8 stays the default |
   | **Whisper tiny / base / small** (whisper.cpp) | 32 / 60 / 190MB | Broadest language coverage | Windows only; tiny is fastest but error-prone, small is slowest and most accurate |

   Downloads resume after interruption, verify SHA-256, fall back across three sources (Hugging Face → hf-mirror → GitHub Releases), switch source automatically when a transfer stalls, and report failures (disk full, 404, network) in plain language with a retry button.

2. **Any OpenAI-compatible `/audio/transcriptions` API** — Base URL + API key + model name. Presets for OpenAI Whisper, Groq (free tier), Fireworks, Mistral Voxtral, SiliconFlow and Alibaba Bailian, with a connection test.
3. **No-API-key web providers** — ChatGPT web transcription (a free OpenAI account works) or Doubao voice, both reusing a session you sign into yourself inside the app. These use undocumented endpoints, are off by default, and may break or conflict with those services' terms — the account risk is yours to judge. See [DISCLAIMER.md](DISCLAIMER.md).

AI polishing likewise accepts any OpenAI-compatible chat endpoint (OpenAI, Google Gemini's OpenAI-compatible endpoint, Groq, DeepSeek, Zhipu GLM-4-Flash, Kimi, Qwen, or a local Ollama / LM Studio endpoint — for local endpoints the API key can be left empty). Without one, a local cleanup pass still handles self-corrections ("5pm — no, 6pm" → "6pm").

## 📦 Download & install

| Platform | Download | Status |
|---|---|---|
| Windows 10/11 x64 | [SpeakType-Setup-0.19.0.exe](https://github.com/wookat/speaktype/releases/download/v0.19.0/SpeakType-Setup-0.19.0.exe) (~98MB) | ✅ Stable |
| Windows portable | [SpeakType-0.19.0-portable.exe](https://github.com/wookat/speaktype/releases/download/v0.19.0/SpeakType-0.19.0-portable.exe) (~87MB) | ✅ Stable |
| Android (phone as microphone) | [SpeakType-0.17.0.apk](https://github.com/wookat/speaktype/releases/download/v0.17.0/SpeakType-0.17.0.apk) — or just open the QR code in the phone browser | ✅ Available |
| macOS Apple Silicon (macOS 15.5+) | [SpeakType-0.17.0-mac-arm64.dmg](https://github.com/wookat/speaktype/releases/download/v0.17.1-mac-preview/SpeakType-0.17.0-mac-arm64.dmg) (~113MB) · [zip](https://github.com/wookat/speaktype/releases/download/v0.17.1-mac-preview/SpeakType-0.17.0-mac-arm64.zip) | 🧪 Preview — unsigned / not notarized, see [docs/macos.md](docs/macos.md) |
| macOS Intel (macOS 15.5+) | [SpeakType-0.17.0-mac-x64.dmg](https://github.com/wookat/speaktype/releases/download/v0.17.1-mac-preview/SpeakType-0.17.0-mac-x64.dmg) (~119MB) · [zip](https://github.com/wookat/speaktype/releases/download/v0.17.1-mac-preview/SpeakType-0.17.0-mac-x64.zip) | 🧪 Preview — cross-built, not run on Intel hardware |

Latest release: https://github.com/wookat/speaktype/releases/latest · Website: https://speaktype.zalize.com


Or install via [Scoop](https://scoop.sh):

```powershell
scoop bucket add speaktype https://github.com/wookat/scoop-speaktype
scoop install speaktype
```

**Windows**

1. Install (if SmartScreen objects, click "More info → Run anyway"; the installer is not commercially signed).
2. Settings → Speech → **Built-in offline** → download a model (or fill in your own API key).
3. Put the cursor in any input field, hold `RightCtrl`, speak, release.

**macOS (preview)**

1. Drag `SpeakType.app` to Applications. The package is ad-hoc signed and **not notarized**, so Gatekeeper blocks it: allow it under System Settings → Privacy & Security, or run `xattr -d com.apple.quarantine /Applications/SpeakType.app`.
2. Grant Accessibility (global hotkey) and Automation (paste via ⌘V) when prompted; the microphone prompt appears on first recording.
3. Hold `Right Option`, speak, release. Local engines on macOS are SenseVoice and Parakeet (whisper.cpp is Windows only). Full details and known limitations: [docs/macos.md](docs/macos.md).

## 🔒 Privacy boundary

- SpeakType **has no servers** — it collects and uploads nothing.
- Recognition is on-device by default; audio leaves your machine only if you configure a cloud engine, and then only to that endpoint.
- The "learn from my edits" comparison happens entirely on your machine.
- API keys, history and failed recordings live only in `%APPDATA%\SpeakType` (Windows) or `~/Library/Application Support/SpeakType` (macOS).
- No third-party credentials are bundled in this repository.

## 🧪 What has been verified — and what hasn't

We test every build on a real Windows 11 machine (packaged installer, simulated microphone and hotkeys) and the macOS preview on an Apple Silicon VM. Things **not** yet covered by our own testing, stated plainly:

- **macOS**: signing/notarization (needs an Apple Developer account), Intel hardware, physical microphones and keyboards; "learn from my edits" and the whisper.cpp engine are Windows-only; `Esc` cancel also reaches the foreground app on macOS.
- **Windows**: physical microphone hardware (tests use Chromium's fake audio device), cloud providers with real paid API keys, high-DPI multi-monitor combinations other than 100% / 125% / 150%.
- **Parakeet fp32** was validated on an offline A/B corpus and a real 2.5GB download; long-term memory behaviour on low-RAM machines has not been profiled.

## 🌏 Internationalization

Simplified Chinese, Traditional Chinese, English, Japanese and Korean built in (follows system or manual, applies instantly); the locale architecture welcomes more community additions.

<div align="center">
<img src="docs/assets/screenshot-settings.png" width="720" alt="Settings" />
</div>

## 🛠️ Contributing

```bash
cd desktop
npm install
npm run dev        # dev mode
npm run typecheck
npm run build
npm run pack       # Windows NSIS installer → release/
npm run pack:mac   # macOS arm64 + x64 dmg/zip → release/ (see docs/macos.md)
```

Stack: Electron + React 19 + Tailwind 4 + lucide-react; global hotkeys via uiohook-napi (plus `globalShortcut` for tap combos on macOS); typing via koffi `SendInput` on Windows / `osascript` ⌘V on macOS; offline recognition via SenseVoice / Parakeet (sherpa-onnx) and whisper.cpp (Windows); enhanced VAD via Silero; phone microphone via a Cloudflare Worker relay you can self-host. See [desktop/README.md](desktop/README.md).

The earlier Chrome extension form (push-to-talk inside web pages, with its `worker/` Cloudflare proxy) has been removed from `main`; it is archived at tag [`archive/browser-extension`](https://github.com/wookat/speaktype/tree/archive/browser-extension) ([docs](https://github.com/wookat/speaktype/blob/archive/browser-extension/docs/browser-extension.md)).

Issues and pull requests welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). This repository intentionally runs no CI; acceptance is local `typecheck` + `build` + packaged-build testing.

## 📄 License

[MIT](LICENSE) © wookat & SpeakType contributors

> SpeakType is an independent open-source project, unaffiliated with OpenAI, Google, ByteDance, Zhipu, NVIDIA or any other vendor. The no-API-key providers reuse a login session you create yourself against undocumented endpoints, which may not comply with those services' terms; the account risk is yours to judge. Prefer the built-in offline engine or your own API key if unsure. See [DISCLAIMER.md](DISCLAIMER.md).
