<div align="center">

# SpeakType

**开源的 Windows AI 语音输入法 —— 你说，它写，落字到任何程序。**

按住一个键说话，松手，文字就出现在光标处。识别、润色、纠错全部可自定义，密钥只存你自己的电脑。

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11%20x64-0078d4.svg)](#安装)
[![i18n](https://img.shields.io/badge/i18n-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87%20%7C%20English-16a34a.svg)](#国际化)

[下载安装包](https://github.com/wookat/speaktype/raw/dist-v0.1.0/SpeakType-Setup-0.1.0.exe) · [English](README.en.md) · [报告问题](https://github.com/wookat/speaktype/issues) · [桌面版开发文档](desktop/README.md)

</div>

---

## 为什么是 SpeakType

市面上的 AI 语音输入法要么闭源、要么把你的语音送进厂商自己的服务器。SpeakType 反过来：

- **完全开源（MIT）**：协议、纠错、界面，每一行都能看、能改、能自部署。
- **没有自己的后端**：SpeakType 不架设任何云端服务，你的语音只发给**你自己选择并配置**的识别服务——或者干脆完全离线。
- **一切可插拔**：识别引擎、AI 润色模型、热词词典、人设风格、快捷键，全部由你定义。

## 核心体验

| | |
|---|---|
| 🎙️ **按住说话** | 按住 `RightCtrl`（可改）说话，实时字幕逐字上屏，松手自动落字到任何 Windows 程序的光标处 |
| ⚡ **免按模式** | `Alt+Q` 按一下开始、说完自动结束（静音检测），适合长段输入 |
| 🎭 **人设风格** | `Alt+1..9` 秒切：默认 / 自动翻译 / 汇报老板 / 面对同事 / 命令行 / 自定义 prompt |
| 📖 **热词纠错** | 词典里加上人名、产品名，识别结果里的同音/近音误字自动替换（本地拼音算法，无需联网） |
| 🧠 **增强人声检测** | 可选下载 Silero VAD 神经网络（约 35MB，本机运行），噪声环境下自动结束与防幻听更准 |
| 🔁 **失败可重试** | 识别失败的录音保留在本机（最多 20 段/7 天/50MB，可关），历史页一键重试，不用重说 |

## 识别引擎（三选一，随时切换）

1. **豆包语音**（默认，免 API Key）：复用你自己登录的 doubao.com 会话做流式识别，App Key 自动获取。非官方接口，可能随豆包改版失效。
2. **任意 OpenAI 兼容转写接口**：填 Base URL + API Key + 模型名即可，内置 OpenAI Whisper / SiliconFlow / Groq / Fireworks / Mistral / 阿里云百炼 预设，带测试连接。
3. **内置离线识别（whisper.cpp）**：应用内一键下载模型（tiny/base/small），完全本机识别——不联网、不注册、零密钥。

AI 润色同样接任意 OpenAI 兼容 Chat 端点（DeepSeek / 智谱 / Kimi / 通义 / OpenAI / 本地 Ollama…），不配置则只做本地口语清理（如「5 点，不对，6 点」→「6 点」），不影响识别。

## 安装

1. [下载 SpeakType-Setup-0.1.0.exe](https://github.com/wookat/speaktype/raw/dist-v0.1.0/SpeakType-Setup-0.1.0.exe) 并安装（SmartScreen 拦截时点「更多信息 → 仍要运行」，安装包未做商业签名）。
2. 三条路任选其一开始用：
   - **零密钥**：首页点「去激活」→ 登录豆包并用一次它自带的语音输入；
   - **自带 key**：设置 → 语音识别 → 选服务商预设，填 key；
   - **完全离线**：设置 → 语音识别 → 内置离线识别 → 下载模型。
3. 把光标放进任何输入框，按住 `RightCtrl` 说话，松手落字。

## 隐私边界

- SpeakType **没有服务器**，不收集、不上传任何语音、文本、统计。
- 语音只发给你配置的识别服务；离线模式下不出本机。
- API Key、豆包 App Key、历史记录、失败录音全部只存本机（`%APPDATA%\SpeakType`）。
- 仓库不内置任何第三方凭证。

## 国际化

界面内置简体中文与 English（跟随系统或手动切换，即时生效）；语言包架构支持社区继续添加日本語、한국어、繁體中文等。

## 参与开发

```bash
cd desktop
npm install
npm run dev        # 开发模式
npm run typecheck
npm run pack       # NSIS 安装包 → release/
```

技术栈：Electron + React 19 + Tailwind 4 + lucide-react；全局热键 uiohook-napi；落字 koffi SendInput；离线识别 whisper.cpp；增强 VAD Silero + onnxruntime。详见 [desktop/README.md](desktop/README.md)。

仓库里还有一个更早形态的 [Chrome 浏览器扩展](docs/browser-extension.md)（网页内按住说话落字），与桌面版共享豆包协议层。

欢迎 [Issue](https://github.com/wookat/speaktype/issues) 与 Pull Request。贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

[MIT](LICENSE) © wookat & SpeakType contributors

> SpeakType 是独立的开源项目，与智谱、字节跳动等公司无关；「豆包」为字节跳动商标，本项目仅指用户自有账号会话的接入方式。
