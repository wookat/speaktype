# SpeakType 桌面版（Windows）

开源（MIT）的 Windows AI 语音输入法：Electron 三窗口（主界面 / 贴底悬浮波形条 / toast）+ 全局热键 + 任意 Windows 程序落字。SpeakType 自身不提供任何云端服务：识别引擎三选一（豆包会话 / 任意 OpenAI 兼容转写接口 / 内置离线 whisper.cpp），AI 润色接你自己配置的任意 OpenAI 兼容模型，所有配置与密钥只存本机。产品介绍见[根 README](../README.md)。

## 交互

- **按住 RightCtrl 说话**（键位可改）：按住约 120ms 起录（防误触），实时字幕逐字上屏，松手自动整理并粘贴到光标处。
- **Alt+Q 点按开关**（键位可改）：按一下开始免按说话，再按一下结束。
- **Alt+1..9**：切换人设（默认风格 / 自动翻译 / 面对老板 / 面对同事 / 面对伴侣 / 命令行大神 / 语感编程 + 自定义，可在设置里关闭快捷键切换）。
- 悬浮条上的「取消」按钮可放弃本次输入。

## 设置

- **通用**：长按/点按热键、长按判定时长、开机自启（可选静默启动只进托盘）、自动落字、录音时静音其他应用、麦克风选择与测试（带音量条）、界面语言（跟随系统 / 简体中文 / English，切换即时生效，架构上可继续加语言）。
- **语音识别**：服务商可插拔——豆包（登录并用一次它自带的语音输入即自动获取 App Key，也可手填）/ 任意 OpenAI 兼容转写接口（内置多家预设 + 测试连接）/ 内置离线识别（whisper.cpp，应用内下载 tiny/base/small 模型，可选强制简体输出）；可选下载 Silero VAD 增强包升级人声检测。
- **AI 模型**：任意 OpenAI 兼容端点（内置 DeepSeek / 智谱 / Kimi / 通义 / OpenAI / Ollama 预设）+ API Key + 模型名，带「测试连接」；不配则只做本地口语清理，不影响识别。
- **关于**：开源信息、仓库/Issues/License 入口、隐私说明。

## 架构

```
src/main       Electron 主进程：窗口/托盘/热键(uiohook)/落字(koffi SendInput Ctrl+V)/听写编排(dictation)/ASR 适配(asr、localasr、doubao)/热词纠错(hotwords)/增强 VAD(vad)
src/preload    index.ts（渲染层 API）、doubao.ts（doubao.com 页面内的 WebSocket 桥接）
src/renderer   index(主界面 React) / panel(悬浮条) / toast / recorder(隐藏录音页)
src/shared     类型、内置人设、豆包 VoiceGenie 协议（与浏览器插件同源）
```

识别走豆包 VoiceGenie（用户自己的 doubao.com 登录态，在应用内登录一次并用一次它自带的语音输入即可自动激活）；润色可接任意 OpenAI 兼容端点，不配置则只做本地口语清理。

## 开发与打包

```bash
npm install
npm run dev        # 开发模式
npm run typecheck
npm run build      # 编译 out/
npm run pack       # electron-builder → release/SpeakType-Setup-x.y.z.exe（NSIS 安装包）
```
