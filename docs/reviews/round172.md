# SpeakType 第 172 轮严格体验报告

- 日期：2026-08-17
- 基线：main `48e4975`（含 #262 隐藏启动最大化修复、#261 下载文案修复）
- 构建：`desktop/` 下 `npm ci`（428 packages，0 vulnerabilities）+ `npm run pack:dir`，实测对象为打包版 `release/win-unpacked/SpeakType.exe`（v0.15.1，Electron 43.3.0）【实测】
- 运行方式：打包版 + `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<wav>`（16 kHz 单声道 TTS 固定语料），目标窗口为系统记事本【实测】
- 证据分级：【实测】打包版真实运行验证；【源码】仅读代码；【推测】未直接验证的推断；【未验证】本轮未覆盖

## 结论速览

| 级别 | 数量 |
| ---- | ---- |
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 1 |

本轮重点全部通过：#262 回归双侧通过；两个专项（云 provider 配置表单校验、词典页交互）整体表现良好，仅留 1 个 P3（网络不可达时报错文案不可操作）；中英核心回归全过。

## 1. #262 回归抽验（隐藏启动 + 上次最大化）

上一轮 P2 场景：`windowBounds.maximized=true` + Start hidden 开启时，`--hidden` 启动主窗口会全屏弹出。#262 将 `win.maximize()` 推迟到首次 `show` 事件（【源码】`desktop/src/main/windows.ts`：`saved?.maximized` 时 `visible ? win.maximize() : win.once("show", () => win.maximize())`）。

- 步骤 A（原 P2 场景）：`speaktype.json` 设 `windowBounds.maximized=true`、`startMinimized=true`、`launchAtLogin=true`，以 `--hidden` 等效方式启动打包版 → 7 个进程运行、**0 个可见主窗口**，桌面无任何 SpeakType 窗口（截图 ss_4331bd6b）【实测】通过。
- 步骤 B（反向验证）：托盘图标 → Open SpeakType → 主窗口**以最大化状态**显示，铺满整个工作区（截图 ss_a4741205），说明推迟的 maximize 在首次 show 时正确补上【实测】通过。

设计评价：`once("show")` 是此问题的最小正确修法；与 Wispr Flow 的隐藏启动行为一致（后台驻留、托盘唤起后恢复上次窗口状态）。无进一步建议。

## 2. 专项 1：云 provider 配置表单校验（近 20 轮未覆盖）

Settings → Speech recognition service，四个 provider：Doubao（流式，需登录）/ OpenAI-compatible / ChatGPT web / Built-in offline。

### OpenAI-compatible

- 空表单时「Test connection」按钮置灰不可点【实测】通过。
- Preset 下拉含 Custom / OpenAI Whisper / SiliconFlow / Groq / Fireworks / Mistral Voxtral / 阿里云百炼（Qwen ASR）/ 本地 faster-whisper-server，选 OpenAI Whisper 自动填充 Base URL 与 model，手改 URL 后自动切回 Custom【实测】通过。
- Base URL 填 `not-a-valid-url` → Test 报「Failed: URL must start with http:// or https://」，本地即时校验【实测】通过。
- 填假 key `sk-invalid-...` + 官方 URL → Test 返回「Failed: HTTP 401 Incorrect API key provided: sk-inval***2345」，错误透传清晰、key 已脱敏【实测】通过。
- Base URL 指向不可达端口 `http://127.0.0.1:9/v1` → Test 报「**Failed: fetch failed**」→ 见 P3-1。
- API key 保存后显示为掩码、状态徽标变「Configured (untested)」【实测】通过。

### Doubao / ChatGPT web

- Doubao 未配置时「Test transcription」返回「FAIL · Speech recognition not configured: sign in to Doubao and use its voice input once, or enter an App Key in Settings」——失败原因 + 两条解决路径都给了【实测】通过。
- ChatGPT web 未登录时返回「FAIL · Not signed in to ChatGPT: click "Sign in to ChatGPT" in Settings → Speech recognition」——同样可操作【实测】通过。
- 两者表单顶部均有账号风险黄条提示（undocumented endpoint 风险自负）【实测】，信息披露到位。

### P3-1：网络不可达时报错仅「Failed: fetch failed」，无可操作指引

- 复现：Provider 选 OpenAI-compatible → Base URL 填任一不可达地址（如 `http://127.0.0.1:9/v1`）→ 填任意 key → Test connection。
- 现象：状态行仅显示「Failed: fetch failed」（截图 ss_zoom_63d7cb9b、ss_e2368630），这是 Node undici 的原始错误串，用户无法据此判断是网络断了、URL 错了还是服务未启动。
- 对比：同页 Doubao/ChatGPT 的 FAIL 文案都给出了具体原因与下一步操作；401 分支也做了错误透传。唯独网络层失败没有翻译。
- 建议：捕获 fetch 异常时按 cause（ECONNREFUSED / ENOTFOUND / ETIMEDOUT）翻译为「无法连接服务器，请检查 Base URL 与网络」级别的可操作文案。竞品参照：Wispr Flow 断网时明确提示检查网络连接。
- 观察（不立案）：Test 失败后状态徽标仍是「Configured (untested)」而非「上次测试失败」，用户离开页面后会丢失失败上下文，可考虑记忆最近一次测试结果。

## 3. 专项 2：词典页交互（近 20 轮未覆盖）

- 添加：一次粘贴 7 行（含中英混合、重复词、超 20 字符词、空行）→ Save 后计数 4/300，重复「SpeakType」去重、空行跳过【实测】通过。
- 超长词反馈（#260 回归）：21+ 字符词被拒并显示「1 word(s) were not added (over the 300-hotword limit or longer than 20 characters)」黄条【实测】通过。
- 搜索：输入 `wis` 大小写不敏感过滤出「Wispr Flow」，无结果时显示「No matching hotwords.」【实测】通过。
- 删除：chip 上 × 单个删除即时生效（4→3）【实测】通过。
- 导出：Export 弹系统保存框，默认名 `speaktype-dictionary-2026-08-17.txt`，文件为 UTF-8 with BOM，中文词「量子纠缠」字节正确【实测】通过。
- 清空：Clear 需二次确认（按钮变红字「Clear all words? Click again」），快速二连击后清空为 0/300 并回到空态引导文案【实测】通过。确认态约 3–4 秒后自动回退，对真实用户节奏足够；本轮首两次点击间隔约 5 秒即错过窗口，属自动化节奏问题，不立案。
- 观察（不立案）：超长词提示把「超 300 上限」与「超 20 字符」合并为一句，无法区分具体原因；词条较多时可考虑分别计数。CapsWriter 的热词文件模式无此问题但也无 UI 反馈，SpeakType 现状整体更好。

## 4. 核心回归（必做）

- 中文：Recognition language = Chinese，记事本聚焦，按住 RightCtrl 约 9 秒 → 录音中实时字幕悬浮条逐字出现中文并带波形动画（截图 ss_2985add6）→ 松开后「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」完整落入记事本（Ln 1, Col 29，截图 ss_a4a7e624）【实测】通过。
- 英文：Recognition language = English，换英文语料重启打包版 → 「Please schedule the design review for tomorrow morning and send the report to the whole team.」落入记事本第二行（Ln 2, Col 94，截图 ss_7ae28a8b），首字母大写、句号正常【实测】通过。

## 5. 本轮未覆盖

- 设置页 5 语言 UI 走查、F8 改写链路、按应用自动切人设规则、多显示器窗口记忆、字幕悬浮条多窗口边界【未验证】，建议后续轮次安排（F8 改写链路需要 polish 模型就绪，建议单独一轮配合本地 LLM 下载验证）。
- 真实开机重启路径的 Start hidden（本轮用 `--hidden` 等效启动验证，与登录项传参一致【源码】，真实重启未做）【未验证】。

## 6. 清场记录

- SpeakType 全部进程结束；`speaktype.json` 还原（startMinimized/launchAtLogin 关闭、windowBounds.maximized 复位、语言/provider 复位）；词典清空回初始空态；HKCU Run 自启值删除；Downloads 导出文件删除；models 目录无 `.part`/`.part.json` 残留；Windows 防火墙三档保持 OFF；`git status` 干净（本报告在独立分支 review/round172-report，未动 main）。
