<div align="center">

<img src="docs/assets/logo.png" width="128" alt="SpeakType logo" />

# SpeakType

**你说，它写 —— 开源、本地优先的 AI 语音输入法，落字到任何程序。**

按住一个键说话，松手，文字就出现在光标处。<br/>
默认完全离线识别，可选接云端引擎；你手改过的词自动学进词典；手机也能当麦克风。密钥与语音永不离开你的掌控。

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11%20x64%20%C2%B7%20macOS%20%E9%A2%84%E8%A7%88-0078d4.svg)](#-下载安装)
[![Release](https://img.shields.io/badge/Release-v0.17.2-8b5cf6.svg)](https://github.com/wookat/speaktype/releases/latest)
[![i18n](https://img.shields.io/badge/界面语言-5%20种-16a34a.svg)](#-国际化)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-22c55e.svg)](CONTRIBUTING.md)

[⬇ 下载安装包](#-下载安装) · [🌐 官网](https://speaktype.zalize.com) · [English](README.md) · [macOS 指南](docs/macos.md) · [报告问题](https://github.com/wookat/speaktype/issues) · [开发文档](desktop/README.md)

<img src="docs/assets/demo.gif" width="720" alt="SpeakType 演示 — 按住热键说话，文字落到光标处" />

<img src="docs/assets/screenshot-home.png" width="720" alt="SpeakType 首页" />

</div>

---

## ✨ 为什么是 SpeakType

市面上的 AI 语音输入法要么闭源、要么把你的语音送进厂商自己的服务器。SpeakType 反过来：

|  |  |
|---|---|
| 🔓 **完全开源（MIT）** | 协议、纠错算法、界面，每一行都能看、能改、能自部署 |
| 🛡️ **本地优先，没有自己的后端** | 不架设任何云端服务；默认在你的电脑上识别，只有**你自己选择并配置**了云端引擎，语音才会发出去 |
| 🧩 **一切可插拔** | 识别引擎、AI 润色模型、热词词典、人设风格、快捷键，全部由你定义 |
| 📈 **越用越准** | 落字后你手改对的词自动学成 `{错 → 对}` 进词典，下次同样的错自动纠正 |
| 📱 **手机当麦克风** | 台式机没麦克风？手机扫码即用，同一 Wi-Fi 走局域网直连，异地走可自部署的中转 |

## 🎬 核心体验

|  |  |
|---|---|
| 🎙️ **按住说话** | Windows 按住 `RightCtrl`、macOS 按住 `右 Option`（可改成任意键或鼠标侧键），实时字幕逐字上屏，松手落字到当前程序的光标处；上一句还在收尾时接着说下一句会排队，不会被吞 |
| ⚡ **免按模式** | `Alt+Q`（macOS `Option+Q`）或双击长按键进入，说话按静音自动分句，停顿更久自动另起一段，再按 `Alt+Q` 结束；可选语音命令（「换行」「另起一段」「删除上一句」） |
| ⎋ **随时取消** | 录音、识别、改写过程中按 `Esc` 直接作废这一句——不落字、不学词 |
| 🎭 **人设风格** | `Alt+1..9` 秒切：默认 / 自动翻译 / 汇报老板 / 命令行 / 自定义 prompt，还可按前台应用自动切 |
| 📖 **热词纠错** | 词典里加上人名、产品名，同音/近音误字自动替换；你手动改过的词自动学进词典（Windows），历史页也能一键学词 |
| ✍️ **选中即改写** | 选一段文字按住 `F8` 说「翻译成英文」「改得正式一点」，直接替换选区；中途切了窗口，结果留在剪贴板而不是落错地方 |
| 🧠 **增强人声检测** | 可选下载 Silero VAD 神经网络（约 35MB，本机运行），噪声环境下自动结束与防幻听更准 |
| 🔤 **标点与数字** | 开箱即用的规则断句标点，可选本机标点模型（约 281MB 附加包），中文口语数字转写（三点半 → 3:30） |
| 🔁 **失败可重试** | 识别失败的录音保留在本机（最多 20 段/7 天/50MB，可关），历史页一键重试，不用重说 |
| 🎵 **文件转录** | 拖入音频/视频文件（mp3、wav、m4a、ogg、flac、mp4…最长 3 小时）→ 离线分段转写带时间戳 → 导出 TXT / 带时间戳 TXT / SRT / VTT |
| 🪟 **悬浮条不挡字** | 录音条与字幕默认停在屏幕底部，会压住文本光标时自动挪到顶部；也可固定顶/底 |
| 🌗 **暗色模式** | 实时跟随系统深浅色设置，也可在设置中固定浅色/深色 |
| 🧹 **重置与清理** | 三档重置：恢复默认设置 / 完全清除数据 / 删除已下载模型 |

<div align="center">
<img src="docs/assets/screenshot-personas.png" width="720" alt="人设风格" />
</div>

## 🎛️ 识别引擎（三选一，随时切换）

<div align="center">
<img src="docs/assets/screenshot-asr.png" width="720" alt="识别引擎设置" />
</div>

1. **内置离线识别**（默认推荐）：应用内一键下载模型，之后不联网、不注册、零密钥。

   | 模型 | 体积 | 适合 | 说明 |
   |---|---|---|---|
   | **SenseVoice Small**（默认） | 240MB | 中文、粤语、日语、韩语、英语 | 实测每句纯识别约 0.27 秒（松手到落字端到端约 0.6 秒），自带标点 |
   | **Parakeet TDT 0.6B v3**（int8） | 670MB | 英语 + 25 种欧洲语言（不支持中文） | 英文准确率最高；int8 版偶发吞掉句首第一个词（"Please" → "Ple"） |
   | **Parakeet 原精度**（fp32） | 2.5GB | 与 Parakeet 相同 | 解决句首吞词，代价是加载后占约 2.7GB 内存；实测识别速度与 int8 同量级。可选项，默认仍是 int8 |
   | **Whisper tiny / base / small**（whisper.cpp） | 32 / 60 / 190MB | 语种覆盖最广 | 仅 Windows；tiny 最快但易错，small 最慢最准 |

   模型下载支持断点续传、SHA-256 校验、三源兜底（Hugging Face → hf-mirror → GitHub Releases）、传输停滞自动换源，失败原因（磁盘满、404、网络）用人话提示并可一键重试。

2. **任意 OpenAI 兼容转写接口**：填 Base URL + API Key + 模型名即可，内置 OpenAI Whisper / Groq（有免费额度）/ Fireworks / Mistral Voxtral / SiliconFlow / 阿里云百炼 预设，带测试连接。
3. **免 API Key 的网页通道**：ChatGPT 网页转写（免费账号也能用）或豆包语音，都是在应用内登录一次后复用你自己的会话。两条走的都是非公开接口，默认关闭，可能失效或与对方条款冲突，账号风险请自行判断，详见 [DISCLAIMER.md](DISCLAIMER.md)。

AI 润色同样接任意 OpenAI 兼容 Chat 端点（OpenAI / Google Gemini 的 OpenAI 兼容端点 / Groq / DeepSeek / 智谱 GLM-4-Flash / Kimi / 通义 / 本地 Ollama、LM Studio——本地端点 API Key 可留空），不配置则只做本地口语清理（如「5 点，不对，6 点」→「6 点」），不影响识别。

## 📦 下载安装

| 平台 | 下载 | 状态 |
|---|---|---|
| Windows 10/11 x64 | [SpeakType-Setup-0.17.2.exe](https://github.com/wookat/speaktype/releases/download/v0.17.2/SpeakType-Setup-0.17.2.exe)（~98MB） | ✅ 稳定 |
| Windows 绿色免安装 | [SpeakType-0.17.2-portable.exe](https://github.com/wookat/speaktype/releases/download/v0.17.2/SpeakType-0.17.2-portable.exe)（~87MB） | ✅ 稳定 |
| Android（手机当麦克风） | [SpeakType-0.17.0.apk](https://github.com/wookat/speaktype/releases/download/v0.17.0/SpeakType-0.17.0.apk) —— 也可以不装，手机浏览器扫码直接用 | ✅ 可用 |
| macOS Apple Silicon（macOS 15.5+） | [SpeakType-0.17.0-mac-arm64.dmg](https://github.com/wookat/speaktype/releases/download/v0.17.1-mac-preview/SpeakType-0.17.0-mac-arm64.dmg)（~113MB）· [zip](https://github.com/wookat/speaktype/releases/download/v0.17.1-mac-preview/SpeakType-0.17.0-mac-arm64.zip) | 🧪 预览版 — 未签名未公证，见 [docs/macos.md](docs/macos.md) |
| macOS Intel（macOS 15.5+） | [SpeakType-0.17.0-mac-x64.dmg](https://github.com/wookat/speaktype/releases/download/v0.17.1-mac-preview/SpeakType-0.17.0-mac-x64.dmg)（~119MB）· [zip](https://github.com/wookat/speaktype/releases/download/v0.17.1-mac-preview/SpeakType-0.17.0-mac-x64.zip) | 🧪 预览版 — 交叉打包，未在 Intel 机器上实测 |

最新发布：https://github.com/wookat/speaktype/releases/latest · 官网：https://speaktype.zalize.com

> `main` 分支已领先 v0.17.2 安装包：原精度 Parakeet、VTT / 带时间戳 TXT 导出、下载停滞自动换源、悬浮条避让光标等将随下一个版本发布；现在想用可按下文从源码构建。

也可以用 [Scoop](https://scoop.sh) 安装：

```powershell
scoop bucket add speaktype https://github.com/wookat/scoop-speaktype
scoop install speaktype
```

**Windows**

1. 安装（SmartScreen 拦截时点「更多信息 → 仍要运行」，安装包未做商业签名）。
2. 设置 → 语音识别 → **内置离线** → 下载模型（或填你自己的 API Key）。
3. 把光标放进任何输入框，按住 `RightCtrl` 说话，松手落字。

**macOS（预览版）**

1. 把 `SpeakType.app` 拖进「应用程序」。安装包只有 ad-hoc 签名、**未公证**，Gatekeeper 会拦：到 系统设置 → 隐私与安全性 点「仍要打开」，或终端执行 `xattr -d com.apple.quarantine /Applications/SpeakType.app`。
2. 按提示授予辅助功能（全局热键）与自动化（⌘V 落字）权限；首次录音时会弹麦克风授权。
3. 按住 `右 Option` 说话，松手落字。macOS 本地引擎只有 SenseVoice 与 Parakeet（whisper.cpp 仅 Windows）。完整说明与已知限制见 [docs/macos.md](docs/macos.md)。

## 🔒 隐私边界

- SpeakType **没有服务器**，不收集、不上传任何语音、文本、统计。
- 默认本机识别；只有你配置了云端引擎，语音才会发给那个端点。
- 「学你手改的词」的文本比对全部在本机完成。
- API Key、历史记录、失败录音全部只存本机（Windows `%APPDATA%\SpeakType`，macOS `~/Library/Application Support/SpeakType`）。
- 仓库不内置任何第三方凭证。

## 🧪 已验证的与尚未验证的

每个版本都在真实 Windows 11 机器上用打包后的安装包实测（模拟麦克风与热键），macOS 预览版在 Apple Silicon 虚拟机上实测。以下是**尚未**被我们自己的测试覆盖的部分，如实列出：

- **macOS**：签名/公证（需要 Apple Developer 账号）、Intel 硬件、物理麦克风与键盘；「学你手改的词」和 whisper.cpp 引擎仅 Windows 可用；macOS 上按 `Esc` 取消时前台 App 也会收到 Esc。
- **Windows**：真实物理麦克风（测试用 Chromium 假音频设备）、真实付费 API Key 的云端 provider、100% / 125% / 150% 之外的高 DPI 多显示器组合。
- **Parakeet fp32**：在离线 A/B 语料和真实 2.5GB 下载上验证过；低内存机器上的长期内存表现尚未测。

## 🌏 国际化

界面内置简体中文、繁體中文、English、日本語、한국어（跟随系统或手动切换，即时生效）；语言包架构支持社区继续添加更多语言。

<div align="center">
<img src="docs/assets/screenshot-settings.png" width="720" alt="设置" />
</div>

## 🛠️ 参与开发

```bash
cd desktop
npm install
npm run dev        # 开发模式
npm run typecheck
npm run build
npm run pack       # Windows NSIS 安装包 → release/
npm run pack:mac   # macOS arm64 + x64 dmg/zip → release/（见 docs/macos.md）
```

技术栈：Electron + React 19 + Tailwind 4 + lucide-react；全局热键 uiohook-napi（macOS 点按组合键走 `globalShortcut`）；落字 Windows 用 koffi `SendInput`、macOS 用 `osascript` ⌘V；离线识别 SenseVoice / Parakeet（sherpa-onnx）与 whisper.cpp（Windows）；增强 VAD Silero；手机麦克风走可自部署的 Cloudflare Worker 中转。详见 [desktop/README.md](desktop/README.md)。

仓库里还有一个更早形态的 [Chrome 浏览器扩展](docs/browser-extension.md)（网页内按住说话落字）。

欢迎 [Issue](https://github.com/wookat/speaktype/issues) 与 Pull Request，贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。本仓库有意不跑 CI，验收标准是本地 `typecheck` + `build` + 打包版实测。

## 📄 许可

[MIT](LICENSE) © wookat & SpeakType contributors

> SpeakType 是独立的开源项目，与 OpenAI、Google、字节跳动、智谱、NVIDIA 等公司无关。免 API Key 的通道复用用户自己在本机的登录态访问对方网页端的非公开接口，可能不符合其服务条款，账号风险由使用者自行判断；不介意可用，介意请改用内置离线识别或自带 API Key 的服务。完整说明见 [DISCLAIMER.md](DISCLAIMER.md)。
