# SpeakType 桌面版（Windows）

按 AutoGLM「智谱 AI 输入法」的桌面形态复刻：Electron 三窗口（主界面 / 贴底悬浮波形条 / toast）+ 全局热键 + 任意 Windows 程序落字。

## 交互

- **按住 RightCtrl 说话**：按住约 120ms 起录（防误触），实时字幕逐字上屏，松手自动整理并粘贴到光标处。
- **Alt+Space 点按开关**：按一下开始免按说话，再按一下结束。
- **Alt+1..9**：切换人设（默认风格 / 自动翻译 / 面对老板 / 面对同事 / 面对伴侣 / 命令行大神 / 语感编程 + 自定义）。
- 悬浮条上的「取消」按钮可放弃本次输入。

## 架构

```
src/main       Electron 主进程：窗口/托盘/热键(uiohook)/落字(koffi SendInput Ctrl+V)/豆包会话编排
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
