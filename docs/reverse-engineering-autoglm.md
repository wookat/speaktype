# 智谱 AI 输入法（AutoGLM AutoTyper）技术反推报告

分析对象：`AutoGLM_win32_x64_1.11.5_260609_2109.exe`（2026-06-09 版，94 MB）
分析方法：NSIS 安装包解包 → `$PLUGINSDIR/app-64.7z` → Electron `resources/app.asar` → `@electron/asar extract`
产出目的：为 SpeakType（浏览器插件版语音输入）确定协议、交互与工程结构。

## 1. 应用形态

| 项 | 结论 |
| --- | --- |
| 壳 | Electron（Chromium 132 内核，`electron-updater` 自动升级） |
| 前端 | React 19 + Tailwind 4 + Radix UI(shadcn 风格) + MobX + i18next（16 种语言） |
| 主进程 | ESM 编译产物 `dist-electron/app/**`，未混淆、保留注释 |
| 原生能力 | `lib/windows.node`（WASAPI 录音、焦点窗口/编辑框探测、取选中文本、UI 树、系统静音）、`@jitsi/robotjs`（模拟 Ctrl+V）、`@tkomde/iohook`（全局按键钩子） |
| 窗口 | `main`（主界面）/ `panel`（贴边悬浮波形条）/ `toast` |

三类进程内服务：本地 OAuth 回调 HTTP 服务（`127.0.0.1:2513`）、供网页端调用的本地 WS 服务（`127.0.0.1:42666`，`?q=web_agent` 才放行）、键盘子进程。

## 2. 后端接口

网关（国内正式）`https://autoglm-api.zhipuai.cn`，ASR 流式走 `wss://autoglm-acceleration-api.zhipuai.cn`。
所有请求带自签名头：`X-Auth-Appid: 100003`、`X-Auth-TimeStamp`、`X-Auth-Sign = md5(appid & timestamp & appKey)`，另有 `Accept-Language` / `Biz-Language`，鉴权是 `authorization: <access_token>`，410000 触发 refresh、400000 强制重登。

主要 REST：

- 登录/续期：`POST /userapi/v1/autotyper-login/`、`/userapi/v1/refresh`、`/userapi/v1/send-code`，海外另有 Google / z.ai OAuth
- 人设：`GET|POST|PUT /agent-asr/user/personas`，`/personas/v2`，内置人设隐藏 `/personas/hidden`
- 热词（自定义词典）：`GET|POST|PUT|DELETE /agent-asr/user/hotwords/v2`
- 历史与用量：`/agent-asr/history`、`/agent-asr/usage/stats`、`/agent-asr/app/status`
- 配置与版本：`/agent-asr/app/client-config`、`/agent-asr/app/version`、`/agent-asr/app/banners`
- 失败重试（离线补传）：`POST /agent-asr/storage/presign` 取直传地址 → `POST /agent-asr/proxy/asr-hub/batch` 走批式转写+润色
- 进程白名单热更新：`https://autoglm.aminer.cn/autotyper/assets/json/whiteList.json`

## 3. 流式 ASR 协议（核心）

`wss://.../agent-asr/ws-std`，JSON 文本帧，客户端 → 服务端：

```jsonc
// 1) 建联后立即下发会话配置（可多次 update，带 config_seq 递增 + sent_at_ms）
{"type":"config","data":{"session_id":"<uuid>","language":"zh","sample_rate":16000,
  "enable_partial":true,"format":"wav","onboarding_type":"","config_seq":1,
  "sent_at_ms":1765000000000,"context":{"contextText":"","clipboardText":"","osInfo":{}}}}

// 2) 录音过程中每 ~100ms 一帧：PCM16 加 wav 头后 base64
{"type":"audio_frame","data":{"data":"<base64 wav>","format":"wav"}}

// 3) 说话中途可下发指令（决定用哪种后处理）
{"type":"instruction","data":{"type":"polish|command","prompt_type":"transcript-polish|voice-command",
  "selection_available":false,"selection_text":"","persona_mask":null,
  "builtin_key":"default","persona_id":"","persona_instruction":"<人设 prompt>","custom_instruction":""}}

// 4) 结束（同 instruction 载荷）；用户取消则发 {"type":"end_delete","data":{}}
{"type":"end","data":{ ...同上... }}
```

服务端 → 客户端：`ready`（可以开始送帧）、`partial`（实时字幕 `data.text`）、`partial_ack` / `instruction_ack`（流控配对，客户端用计数器等待收敛）、`final`（`data.final` 为润色后文本，`data.transcriptText` 为原始转写；风控拦截码 `660150` 时降级用原始转写）、`error`。

关键工程细节（值得照搬）：

1. **抢跑建联**：按下热键先建 WS 并本地缓冲音频，`ready` 到达后 `flushBufferedFrames()` 一次性补发，掩盖握手延迟。
2. **配对计数**：`pairPack{frame,end,instruction,finalPack}` + `waitNoPair()`，保证结束前所有帧都已 ack，避免丢尾字。
3. **静音兜底**：2s 无音频自动结束（`NO_AUDIO_END_TIMEOUT_MS`）；长按需按住 120ms 才真正开录（`HOLD_START_DELAY_MS`），过滤误触。
4. **录音期系统静音**：录音时静音扬声器，结束恢复，避免外放回采。
5. **离线补传**：网络失败时 wav 落盘 `userData/records`，恢复后 presign 直传 + 批式转写。

## 4. 交互设计

- 双热键：`recordToggle = LeftAlt+Space`（点按开关）、`recordHold = RightCtrl`（长按说话）；`Alt+0..9` 切人设；有热键黑白名单策略（放行 `LeftCtrl+LeftAlt`，屏蔽 `Ctrl+C/V` 等）。
- 落字方式：写剪贴板 → `robotjs` 模拟 `Ctrl+V` → 延时后还原剪贴板原内容。
- 选中文本改写：`getSelection()` 拿到选区后 `instruction.type = "command"`（语音指令改写选区）；对 IDE / 终端（Cursor、VS Code、WindowsTerminal、pwsh…）走白名单跳过取选区，因为取选区靠模拟 `Ctrl+C`，会打断前台 CLI 任务。
- 人设（persona）= 一段后处理 prompt，内置例：
  - 默认：「让文本保持自然、清晰、口语化的语气，同时更精炼易读，要把句尾的句号去掉。」
  - 自动翻译：中文→自然英文，已是英文只清理，专有名词保持。
  - 命令行大神：自然语言→最简 shell 命令，不解释。
  - 职场大佬 / 发疯文学 / 凡尔赛 / 互联网黑话 / Vibe Coding 等。
- 上下文注入：`context.contextText`（当前窗口 UI 树文本）、`clipboardText`、`osInfo` —— 当前版本代码里已注释关闭（`syncContextConfigAfterConnect`），说明隐私/收益比不划算。

## 5. 对 SpeakType（浏览器插件）的映射

| AutoGLM 桌面端 | SpeakType 浏览器端 |
| --- | --- |
| WASAPI 原生录音 | `chrome.offscreen` 文档中 `getUserMedia` + AudioWorklet 降采样到 16k PCM16 |
| iohook 全局热键 | `chrome.commands`（Alt+Space 开关 / Alt+Shift+V 长按）+ 页面内 keydown 兜底 |
| robotjs 模拟 Ctrl+V | content script 直接在 `input/textarea/contenteditable` 的光标处插入（`execCommand('insertText')` 优先，保留 undo 与 React 受控组件兼容） |
| `getSelection()` 原生取选区 | `window.getSelection()`，天然无需模拟 Ctrl+C，也就没有终端白名单问题 |
| 自研流式 ASR 网关 | Cloudflare Worker 代理智谱开放平台 `POST /paas/v4/audio/transcriptions`（GLM-ASR-2512，wav/mp3 ≤25MB ≤30s，支持 `stream=true`）+ GLM 对话模型做人设润色 |
| Electron panel 悬浮条 | content script 注入 Shadow DOM 悬浮胶囊（波形 + 实时字幕），页面样式互不污染 |
| personas / hotwords REST | `chrome.storage.sync` 本地存人设与热词，热词作为 ASR/润色提示词注入 |

保留其协议精髓（抢跑建联、partial 实时字幕、persona 二段润色、静音兜底），去掉桌面端的脏活（模拟按键、剪贴板劫持、进程白名单）。

## 6. 复刻时明确不做的

- 不复用其私有网关与 `appId/appKey` 签名（属于其账号体系，也非公开接口）；一律走智谱开放平台官方 API 或用户自带 key。
- 不采集剪贴板与窗口 UI 树。
- 不内置其品牌资源（图标、文案、插画）。
