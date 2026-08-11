<div align="center">

<img src="docs/assets/logo.png" width="128" alt="SpeakType logo" />

# SpeakType

**You speak, it types — open-source AI voice typing, into any app.**

Hold a key, talk, release — the words land at your cursor.<br/>
ASR engine, AI polishing and hotword correction are all yours to configure; keys and audio never leave your control.

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11%20x64-0078d4.svg)](#-download--install)
[![Release](https://img.shields.io/badge/Release-v0.3.0-8b5cf6.svg)](#-download--install)
[![i18n](https://img.shields.io/badge/UI%20languages-5-16a34a.svg)](#-internationalization)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-22c55e.svg)](CONTRIBUTING.md)

[⬇ Download](#-download--install) · [🌐 Website](https://wookat.github.io/speaktype/) · [简体中文](README.md) · [Report an issue](https://github.com/wookat/speaktype/issues) · [Dev docs](desktop/README.md)

<img src="docs/assets/screenshot-home.png" width="720" alt="SpeakType home" />

</div>

---

## ✨ Why SpeakType

Most AI voice-typing tools are closed source, or route your voice through the vendor's own servers. SpeakType flips that:

|  |  |
|---|---|
| 🔓 **Fully open source (MIT)** | Protocols, correction algorithms, UI — every line is readable, hackable, self-hostable |
| 🛡️ **No backend of its own** | Runs no cloud service; your audio goes only to the recognition service **you choose and configure** — or stays entirely offline |
| 🧩 **Everything pluggable** | ASR engine, polishing model, hotword dictionary, persona styles, hotkeys: all yours |

## 🎬 Core experience

|  |  |
|---|---|
| 🎙️ **Push to talk** | Hold `RightCtrl` (configurable), live captions stream as you speak, release to type into any Windows app |
| ⚡ **Hands-free mode** | Tap `Alt+Q` to start, auto-stops on silence — great for long dictation |
| 🎭 **Personas** | `Alt+1..9` to switch: default / auto-translate / report-to-boss / casual / CLI / custom prompt |
| 📖 **Hotword correction** | Add names and product terms to the dictionary; homophone errors are fixed locally via pinyin matching — manual corrections in History can be **learned into the dictionary in one click** |
| 🧠 **Enhanced voice detection** | Optional Silero VAD neural network (~35MB download, runs on-device) for accurate auto-stop and hallucination filtering in noise |
| 🔁 **Retryable failures** | Failed recordings kept locally (max 20 clips / 7 days / 50MB, can be disabled); retry from History without re-speaking |

<div align="center">
<img src="docs/assets/screenshot-personas.png" width="720" alt="Personas" />
</div>

## 🎛️ Recognition engines (pick one, switch anytime)

<div align="center">
<img src="docs/assets/screenshot-asr.png" width="720" alt="ASR settings" />
</div>

1. **Doubao voice** (default, no API key): streaming recognition via your own logged-in doubao.com session, app key auto-captured. Unofficial endpoint; may break when Doubao updates.
2. **Any OpenAI-compatible transcription API**: Base URL + API key + model. Presets for OpenAI Whisper / SiliconFlow / Groq / Fireworks / Mistral / Alibaba Bailian, with a connection test.
3. **Built-in offline recognition (whisper.cpp)**: one-click model download (tiny/base/small) inside the app — no network, no account, no keys.

AI polishing likewise accepts any OpenAI-compatible chat endpoint (DeepSeek / Zhipu / Kimi / Qwen / OpenAI / local Ollama…). Without one, a local cleanup pass still handles self-corrections ("5pm — no, 6pm" → "6pm").

## 📦 Download & install

| Platform | Download | Status |
|---|---|---|
| Windows 10/11 x64 | [SpeakType-Setup-0.9.2.exe](https://github.com/wookat/speaktype/releases/download/v0.9.2/SpeakType-Setup-0.9.2.exe) (~98MB) | ✅ Stable |
| Windows portable | [SpeakType-0.9.2-portable.exe](https://github.com/wookat/speaktype/releases/download/v0.9.2/SpeakType-0.9.2-portable.exe) (~87MB) | ✅ Stable |
| Android (phone as microphone) | [SpeakType-0.9.0.apk](https://github.com/wookat/speaktype/releases/download/v0.9.2/SpeakType-0.9.0.apk) | ✅ Available |
| macOS (Apple Silicon / Intel) | Platform layer merged; installer pending a macOS build environment | 🚧 In progress |

Latest release: https://github.com/wookat/speaktype/releases/latest · Website: https://speaktype.zalize.com

1. Install (if SmartScreen objects, click "More info → Run anyway"; the installer is not commercially signed).
2. Pick any of the three engine paths above to get recognition working.
3. Put the cursor in any input field, hold `RightCtrl`, speak, release.

## 🔒 Privacy boundary

- SpeakType **has no servers** — it collects and uploads nothing.
- Audio goes only to the service you configured; in offline mode it never leaves your machine.
- API keys, Doubao app key, history and failed recordings live only in `%APPDATA%\SpeakType`.
- No third-party credentials are bundled in this repository.

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
npm run pack       # NSIS installer → release/
```

Stack: Electron + React 19 + Tailwind 4 + lucide-react; global hotkeys via uiohook-napi; typing via koffi SendInput; offline ASR via whisper.cpp; enhanced VAD via Silero + onnxruntime. See [desktop/README.md](desktop/README.md).

An earlier [Chrome extension form](docs/browser-extension.md) lives in this repo too, sharing the Doubao protocol layer.

Issues and pull requests welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

[MIT](LICENSE) © wookat & SpeakType contributors

> SpeakType is an independent open-source project, unaffiliated with OpenAI, ByteDance, Zhipu or others. The "Doubao" and "ChatGPT web transcription" providers reuse your own local login session against undocumented endpoints of those services, which may not comply with their terms; the account risk is yours to judge. Prefer the built-in offline engine or a service with your own API key if unsure. See [DISCLAIMER.md](DISCLAIMER.md).
