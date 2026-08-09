<div align="center">

# SpeakType

**Open-source AI voice typing for Windows — speak, and the words land at your cursor, in any app.**

Hold a key, talk, release. Recognition, AI polishing and correction are all yours to configure — keys never leave your machine.

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11%20x64-0078d4.svg)](#install)
[![i18n](https://img.shields.io/badge/i18n-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87%20%7C%20English-16a34a.svg)](#internationalization)

[Download installer](https://github.com/wookat/speaktype/raw/dist-v0.1.0/SpeakType-Setup-0.1.0.exe) · [简体中文](README.md) · [Report an issue](https://github.com/wookat/speaktype/issues) · [Desktop dev docs](desktop/README.md)

</div>

---

## Why SpeakType

Most AI voice-typing tools are closed source, or route your voice through the vendor's own servers. SpeakType flips that:

- **Fully open source (MIT)** — protocols, correction, UI: every line is readable, hackable, self-hostable.
- **No backend of its own** — SpeakType runs no cloud service. Your audio goes only to the recognition service **you choose and configure** — or stays entirely offline.
- **Everything pluggable** — ASR engine, polishing model, hotword dictionary, persona styles, hotkeys: all yours.

## Core experience

| | |
|---|---|
| 🎙️ **Push to talk** | Hold `RightCtrl` (configurable), live captions stream as you speak, release to type into any Windows app |
| ⚡ **Hands-free mode** | Tap `Alt+Q` to start, auto-stops on silence — great for long dictation |
| 🎭 **Personas** | `Alt+1..9` to switch: default / auto-translate / report-to-boss / casual / CLI / custom prompt |
| 📖 **Hotword correction** | Add names and product terms to the dictionary; homophone/near-phone errors are fixed locally via pinyin matching |
| 🧠 **Enhanced voice detection** | Optional Silero VAD neural network (~35MB download, runs on-device) for accurate auto-stop and hallucination filtering in noise |
| 🔁 **Retryable failures** | Failed recordings kept locally (max 20 clips / 7 days / 50MB, can be disabled); retry from History without re-speaking |

## Recognition engines (pick one, switch anytime)

1. **Doubao voice** (default, no API key): streaming recognition via your own logged-in doubao.com session, app key auto-captured. Unofficial endpoint; may break when Doubao updates.
2. **Any OpenAI-compatible transcription API**: Base URL + API key + model. Presets for OpenAI Whisper / SiliconFlow / Groq / Fireworks / Mistral / Alibaba Bailian, with a connection test.
3. **Built-in offline recognition (whisper.cpp)**: one-click model download (tiny/base/small) inside the app — no network, no account, no keys.

AI polishing likewise accepts any OpenAI-compatible chat endpoint (DeepSeek / Zhipu / Kimi / Qwen / OpenAI / local Ollama…). Without one, a local cleanup pass still handles self-corrections ("5pm — no, 6pm" → "6pm").

## Install

1. [Download SpeakType-Setup-0.1.0.exe](https://github.com/wookat/speaktype/raw/dist-v0.1.0/SpeakType-Setup-0.1.0.exe) and install (if SmartScreen objects, click "More info → Run anyway"; the installer is not commercially signed).
2. Pick any of the three paths above to get recognition working.
3. Put the cursor in any input field, hold `RightCtrl`, speak, release.

## Privacy boundary

- SpeakType **has no servers** — it collects and uploads nothing.
- Audio goes only to the service you configured; in offline mode it never leaves your machine.
- API keys, Doubao app key, history and failed recordings live only in `%APPDATA%\SpeakType`.
- No third-party credentials are bundled in this repository.

## Internationalization

Simplified Chinese and English built in (follows system or manual, applies instantly); the locale architecture welcomes community additions (日本語, 한국어, 繁體中文, …).

## Contributing

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

## License

[MIT](LICENSE) © wookat & SpeakType contributors

> SpeakType is an independent open-source project, unaffiliated with Zhipu, ByteDance or others; "Doubao" is a ByteDance trademark and refers here only to the user's own account session.
