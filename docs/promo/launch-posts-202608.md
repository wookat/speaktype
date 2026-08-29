# SpeakType launch post drafts (2026-08)

Status: DRAFTS ONLY — none of these have been published. Each platform needs an
account owned by the boss; do not post from throwaway accounts. Update version
numbers and links before posting.

Facts checklist (verified against the repo as of 2026-08-03, do not inflate):

- MIT licensed, public repo: https://github.com/wookat/speaktype
- Latest release: v0.16.0 (Setup exe + portable exe). Android APK last shipped as v0.15.0.
- Offline by default: SenseVoice (zh/en/ja/ko/yue), Parakeet TDT 0.6B v3 (en + European), whisper.cpp tiny/base/small.
- Optional BYOK cloud: any OpenAI-compatible API, ChatGPT, Gemini, Groq, plus domestic channels (Doubao, Zhipu, Bailian).
- Correction learning: watches later edits in the same field and adds corrections to the dictionary.
- Phone as remote mic (LAN direct or same-domain relay at speaktype.zalize.com/relay).
- Windows only today (desktop). No macOS/Linux build yet — do not claim otherwise.
- Submitted, not yet accepted (do not claim inclusion until merged):
  winget-pkgs #426225, Scoop Extras #18637, Awesome-Whisper-Apps #34, awesome-windows #269.

---

## Show HN (news.ycombinator.com)

Title: Show HN: SpeakType – Hold-to-talk voice typing for Windows, offline by default

Body:

I built SpeakType because I wanted Wispr-Flow-style dictation without sending
audio to a cloud. Hold a hotkey (Right Ctrl), speak, release — the recognized,
punctuated text is typed into whatever app has focus.

What's different from other Whisper wrappers:

- Offline by default. SenseVoice for Chinese/English/Japanese/Korean/Cantonese,
  Parakeet for English/European languages, whisper.cpp as a third option.
  One-click model download, sha256-verified, resumable.
- It learns from your edits. If you correct the inserted text within the same
  field, SpeakType diffs your edit against what it typed and adds the
  correction to a local dictionary, so the same mistake stops happening.
- Phone as microphone: scan a QR code and use your phone's mic, over LAN or a
  relay (self-hostable Cloudflare Worker).
- BYOK cloud providers (any OpenAI-compatible endpoint) if you want them; the
  app never talks to a server otherwise.

Windows only for now. Electron + sherpa-onnx. MIT.

Repo: https://github.com/wookat/speaktype
Site: https://speaktype.zalize.com

---

## Reddit r/LocalLLaMA

Title: SpeakType: open-source hold-to-talk dictation for Windows that runs SenseVoice/Parakeet/whisper.cpp locally and learns from your corrections

Body: (same content as Show HN, more casual tone; mention model sizes:
SenseVoice-small int8 ~230MB, Parakeet 0.6B ~660MB, punctuation model optional
~2.3MB with sherpa-onnx built-in VAD. Invite feedback on model choices.)

## Reddit r/speechrecognition / r/productivity

Shorter variant: focus on the hold-to-talk workflow, correction learning, and
that it's free/MIT, no account.

---

## V2EX (分享创造)

标题: SpeakType：开源 Windows 按住说话语音输入，默认离线识别，会从你的修改里自动学词

正文:

做了一个 Windows 语音输入工具，按住右 Ctrl 说话、松手落字到当前光标处。

几个特点：

- 默认完全离线：SenseVoice（中/英/日/韩/粤）、Parakeet（英文/欧洲语言）、
  whisper.cpp 三套本地引擎，一键下载模型，不联网也能用。
- 自动学词：落字后你手动改了哪里，它会对比差异把纠正加进本地词典，
  下次同样的词就不会再错。
- 手机当麦克风：扫码即用，同 Wi-Fi 直连，跨网走自建中转（Cloudflare Worker，
  可自部署）。
- 想用云端也行：任意 OpenAI 兼容接口、ChatGPT/Gemini/Groq、豆包/智谱/百炼，
  自带 key，不经过任何第三方服务器。

MIT 开源：https://github.com/wookat/speaktype
官网下载：https://speaktype.zalize.com

欢迎试用挑毛病，尤其想听听中文识别准确率的真实反馈。

---

## 少数派 (sspai.com)

标题: SpeakType：离线优先的 Windows 语音输入，按住说话、松手落字，还会从你的修改里学习

（长文投稿，结构：痛点 → 工作流演示 GIF → 离线引擎对比表 → 自动学词原理 →
手机麦克风 → 与讯飞/Wispr Flow 对比 → 下载。需真实截图/GIF，发布前重新截图。）

---

## Product Hunt

Tagline: Hold-to-talk voice typing for Windows. Offline. Learns from your edits.

First comment: same content as Show HN body. Needs gallery images (1270x760),
a maker account, and a scheduled launch date. Recommend launching after winget
inclusion is merged so "winget install speaktype" can be in the copy.
