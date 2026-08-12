<div align="center">

<img src="docs/assets/logo.png" width="128" alt="SpeakType logo" />

# SpeakType

**You speak, it types — open-source AI voice typing, into any app.**

Hold a key, talk, release — the words land at your cursor.<br/>
Recognition engine, AI polishing and hotword correction are all yours to configure; keys and audio never leave your control.

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11%20x64-0078d4.svg)](#-download--install)
[![Release](https://img.shields.io/badge/Release-v0.9.2-8b5cf6.svg)](https://github.com/wookat/speaktype/releases/latest)
[![i18n](https://img.shields.io/badge/UI%20languages-5-16a34a.svg)](#-internationalization)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-22c55e.svg)](CONTRIBUTING.md)

[⬇ Download](#-download--install) · [🌐 Website](https://speaktype.zalize.com) · [简体中文](README.zh-CN.md) · [Report an issue](https://github.com/wookat/speaktype/issues) · [Dev docs](desktop/README.md)

<img src="docs/assets/screenshot-home.png" width="720" alt="SpeakType home" />

</div>

---

## ✨ Why SpeakType

Most AI dictation tools are closed source, or route your voice through the vendor's own servers. SpeakType flips that:

|  |  |
|---|---|
| 🔓 **Fully open source (MIT)** | Protocols, correction algorithms, UI — every line is readable, hackable, self-hostable |
| 🛡️ **No backend of its own** | Runs no cloud service; your audio goes only to the recognition service **you choose and configure** — or stays entirely offline |
| 🧩 **Everything pluggable** | Recognition engine, polishing model, hotword dictionary, persona styles, hotkeys: all yours |
| 📱 **Your phone as the microphone** | Desktop with no mic? Scan a QR code and talk into your phone — LAN direct, or through a relay you can self-host |

## 🎬 Core experience

|  |  |
|---|---|
| 🎙️ **Push to talk** | Hold `RightCtrl` (any key or mouse side button, recordable), live captions stream as you speak, release to type into any Windows app |
| ⚡ **Hands-free mode** | Tap `Alt+Q` to start, auto-stops on silence — great for long dictation |
| 🎭 **Personas** | `Alt+1..9` to switch: default / auto-translate / report-to-boss / CLI / custom prompt — and optionally switch automatically per foreground app |
| 📈 **Gets better as you use it** | Fix a word by hand after it lands and SpeakType learns it into your dictionary — the same mistake won't happen twice |
| 📖 **Hotword correction** | Add names and product terms; homophone and near-homophone errors are fixed locally via pinyin matching |
| ✍️ **Select and rewrite** | Select text, hold `F8` and say "translate to English" / "make it formal" — the selection is replaced in place |
| 🧠 **Enhanced voice detection** | Optional Silero VAD neural network (~35MB, on-device) for accurate auto-stop and hallucination filtering in noise |
| 🔁 **Retryable failures** | Failed recordings are kept locally (max 20 clips / 7 days / 50MB, can be disabled); retry from History without re-speaking |

<div align="center">
<img src="docs/assets/screenshot-personas.png" width="720" alt="Personas" />
</div>

## 🎛️ Recognition engines (pick one, switch anytime)

<div align="center">
<img src="docs/assets/screenshot-asr.png" width="720" alt="Recognition settings" />
</div>

1. **Built-in offline recognition** (default, recommended) — one-click model download inside the app: whisper.cpp (tiny/base/small) or SenseVoice-Small for Chinese (~0.27s per utterance, punctuation included). No network, no account, no keys.
2. **Any OpenAI-compatible `/audio/transcriptions` API** — Base URL + API key + model name. Presets for OpenAI Whisper, Groq (free tier), Fireworks, Mistral Voxtral, SiliconFlow and Alibaba Bailian, with a connection test.
3. **No-API-key web providers** — ChatGPT web transcription (a free OpenAI account works) or Doubao voice, both reusing a session you sign into yourself inside the app. These use undocumented endpoints, are off by default, and may break or conflict with those services' terms — the account risk is yours to judge. See [DISCLAIMER.md](DISCLAIMER.md).

AI polishing likewise accepts any OpenAI-compatible chat endpoint (OpenAI, Google Gemini's OpenAI-compatible endpoint, Groq, DeepSeek, Zhipu GLM-4-Flash, Kimi, Qwen, or a local Ollama…). Without one, a local cleanup pass still handles self-corrections ("5pm — no, 6pm" → "6pm").

## 📦 Download & install

| Platform | Download | Status |
|---|---|---|
| Windows 10/11 x64 | [SpeakType-Setup-0.9.3.exe](https://github.com/wookat/speaktype/releases/download/v0.9.3/SpeakType-Setup-0.9.3.exe) (~98MB) | ✅ Stable |
| Windows portable | [SpeakType-0.9.3-portable.exe](https://github.com/wookat/speaktype/releases/download/v0.9.3/SpeakType-0.9.3-portable.exe) (~87MB) | ✅ Stable |
| Android (phone as microphone) | [SpeakType-0.9.3.apk](https://github.com/wookat/speaktype/releases/download/v0.9.3/SpeakType-0.9.3.apk) | ✅ Available |
| macOS (Apple Silicon / Intel) | Platform layer merged; installer pending a macOS build environment | 🚧 In progress |

Latest release: https://github.com/wookat/speaktype/releases/latest · Website: https://speaktype.zalize.com

1. Install (if SmartScreen objects, click "More info → Run anyway"; the installer is not commercially signed).
2. Settings → Recognition → **Built-in offline** → download a model (or fill in your own API key).
3. Put the cursor in any input field, hold `RightCtrl`, speak, release.

## 🔒 Privacy boundary

- SpeakType **has no servers** — it collects and uploads nothing.
- Audio goes only to the service you configured; in offline mode it never leaves your machine.
- The "learn from my edits" comparison happens entirely on your machine.
- API keys, history and failed recordings live only in `%APPDATA%\SpeakType`.
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

Stack: Electron + React 19 + Tailwind 4 + lucide-react; global hotkeys via uiohook-napi; typing via koffi SendInput; offline recognition via SenseVoice / whisper.cpp; enhanced VAD via Silero + onnxruntime; phone microphone via a Cloudflare Worker relay you can self-host. See [desktop/README.md](desktop/README.md).

An earlier [Chrome extension form](docs/browser-extension.md) lives in this repo too.

Issues and pull requests welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

[MIT](LICENSE) © wookat & SpeakType contributors

> SpeakType is an independent open-source project, unaffiliated with OpenAI, Google, ByteDance, Zhipu or any other vendor. The no-API-key providers reuse a login session you create yourself against undocumented endpoints, which may not comply with those services' terms; the account risk is yours to judge. Prefer the built-in offline engine or your own API key if unsure. See [DISCLAIMER.md](DISCLAIMER.md).
