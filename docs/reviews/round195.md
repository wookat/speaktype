# SpeakType 第 195 轮严格体验官报告

- 日期：2026-08-19
- 被测版本：main @ 12c3df4（含 PR #289：历史 Undo 15s 可见倒计时、超长 WAV 头预检、转写页 Parakeet 语言提示）
- 测试方式：本机 clone → `npm --prefix desktop ci` → build → `pack:dir`，用打包版 `desktop\release\win-unpacked\SpeakType.exe`（v0.15.1）+ 假麦克风 flags（16k mono 中文 TTS WAV，1s 头静音 + 4s 尾静音）+ CDP(9333) 精确断言；手机页用 Playwright 驱动独立 Chrome（iPhone UA/390×844/touch + fake mic）连生产 relay `https://speaktype.zalize.com/relay`；落字目标 Notepad

## 本轮范围

1. P3-1943 复核 + relay 手机页语言（含配对→按住说话→落字→刷新重连全链路）
2. relay 失败路径（地址错误/不可达）错误提示与无重启恢复
3. PR #289 回归抽查（Undo 倒计时 / Parakeet 提示 / >3h WAV 快速报错）
4. 自由走查：词典（粘贴导入 / 导出 / 清空二次确认 / 搜索 / 上限与假名提示）

## 结论摘要

| # | 项目 | 结果 |
|---|------|------|
| 1a | relay 手机页语言跟随桌面 uiLanguage | ❌ 不跟随（P3-1951，P3-1943 未修复于 relay 路径） |
| 1b | 配对→按住说话→落字→刷新重连 | ✅ 通过 |
| 2a | relay 地址不可达：桌面错误提示 | ✅ 可见可行动（红字 + 持续重试） |
| 2b | relay 地址不可达：手机页提示 | ✅ 可见（"已连接中转，等待电脑…"） |
| 2c | 恢复正确地址后无重启恢复 | ✅ 通过（改回即重连，随后落字成功） |
| 3a | Undo 15s 倒计时（含悬停暂停/离开 3s 重臂/点击恢复） | ✅ 通过 |
| 3b | Parakeet 转写页语言提示 | ✅ 通过 |
| 3c | >3h WAV 快速报错 | ✅ 通过（~1s 内拒绝 1KB 假头文件） |
| 4 | 词典走查 | ✅ 无缺陷 |
| — | 计划外发现：relay 桌面连接闲置静默僵死 | ❌ P1-1950 |

## 发现

### P1-1950 relay 桌面端 WebSocket 闲置数分钟后静默僵死：双侧无任何报错、手机永远"等待电脑"，需手动开关恢复

- **实测证据**：22:17:14 relay 听写成功（`dictation finalize durationMs=14998`）后应用闲置；22:22 起手机页重新连入房间 a2eb001bd59d 一直显示"已连接中转，等待电脑…"、按钮禁用（截图 phone_zombie_check.png），而桌面 Settings→Speech 同时显示 "Waiting for a phone to connect…"、无任何错误（截图 ss_30bd4b86）；`main.log` 在 22:16:25（上次 join）→ 22:27:40（手动开关 Phone as microphone 后重新 join）之间没有任何 relay 断开/重连日志——桌面端根本不知道连接已死。手动关开开关后立即恢复（同房间码），随后按住说话/落字成功。
- **源码证据**：`desktop/src/main/remotemic.ts` 的 relay WebSocket 无应用层心跳/ping；`relay/src/`（Cloudflare Worker/DO）也无 heartbeat/alarm。半开 TCP（CF/NAT 空闲回收）不会触发 `close` 事件，`connectRelay` 的 2s 重连逻辑永远不执行。
- **影响**：手机远程麦克风核心场景在真实使用（拿起手机前电脑已闲置几分钟）下大概率不可用，且双侧提示都在"正常等待"，用户无从行动。
- **复现**：relay 模式配对成功 → 电脑闲置 ≥5 分钟 → 手机重新打开配对页 → 永远"等待电脑"。
- **建议**：桌面端 relay ws 加 25–30s 应用层 ping（收不到 pong 主动 terminate 触发既有重连）；Worker 侧可选 alarm 清理。

### P3-1951（P3-1943 复核）relay 手机页语言完全硬编码中文，不跟随桌面 uiLanguage

- **实测证据**：桌面 uiLanguage=English 时打开生产手机页：`<html lang="zh">`、"已连接电脑 / 按住说话 / 松手后文字会落到电脑光标处"全中文（截图 phone_pair_1787177231460.png，桌面英文界面同屏证据 ss_fada4653）；切换桌面为 日本語 后刷新手机页，仍全中文（phone_after_ja.png）。
- **源码证据**：`relay/src/phone.ts` 整页与 `manifest()`（`lang: "zh-CN"`、"SpeakType 手机麦克风"）均为硬编码中文字符串，页面由 Worker 静态生成，没有任何桌面语言传递通道（URL/协议均不带语言）。对照组：LAN 直连页 `desktop/src/main/remotemic.ts pageStrings()` 按 `currentLanguage().startsWith("zh")` 出中/英——即 round 194 的 P3-1943 只修了 LAN 路径，relay 路径仍缺失。
- **建议**：桌面 join 时把 uiLanguage 放进 QR URL 查询参数（如 `/m/<room>?lang=en`），phone.ts 按参数选串；manifest 同理。

### 备注（不立案）

- relay 地址填错时 QR 与链接立即换成坏地址且无格式校验，扫码手机只会得到浏览器打不开页（未实机扫码，推论）；桌面红字提示已足够定位，暂不立案。
- 词典清空按钮二次确认 4s 超时静默回弹与 round 188 P3 同源，不重复立案。

## 各项断言与证据

### 专项 1：relay 手机页语言 + 全链路（结论：链路通过，语言不通过）

- **配对**：桌面 Internet relay 模式生成房间 a2eb001bd59d，手机页经 QR URL 打开即自动入房并写入 `localStorage['speaktype-room']`，状态"已连接电脑"（phone_pair_1787177231460.png）。
- **按住说话→落字**：mousedown 按住 13s（假麦克风循环中文 WAV），手机页状态"录音中…"并实时显示 partial 字幕；松手后 Notepad 落字"帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复。…"（截图 ss_7a576be0；`main.log` `dictation finalize durationMs=14998 maxPeak=32768 voicedMs=6696`）。
- **刷新重连**：直接打开 `…/relay/app`（URL 不带房间码），从 localStorage 恢复房间自动重连，"已连接电脑"（phone_waitstate_1787177499153.png）。
- **语言**：见 P3-1951。桌面切 English→日本語→English 全程手机页恒为中文。

### 专项 2：relay 失败路径（结论：通过）

- 桌面 Relay URL 改为不存在域名 `https://no-such-relay.zalize.com/relay`：约 10s 内 Speech 页出现红字 "Can't reach the relay server — check the relay URL and your network. Still retrying…"（ss_3b1c4a70），`main.log` 每 2s 一条 `relay ws error … ENOTFOUND`，持续自动重试。
- 同时手机页（连的是真 relay）显示"已连接中转，等待电脑…"、按钮禁用（phone_desktop_offline.png）——可见、含义明确。
- 桌面改回正确地址（不重启）：0.2s 内 `remote mic relaying via …`（main.log 22:16:25），红字消失（ss_28a376f5），手机页自动恢复"已连接电脑"，随后整段按住说话→Notepad 落字成功（ss_7a576be0 即恢复后所落文字）。

### 专项 3：PR #289 回归（结论：全部通过）

- **Undo 倒计时**：CDP 逐秒采样：删除后 toast "Entry deleted + 进度条 + Undo"（ss_7f41c3e1），进度条 56px 起以 `transition: width 15s linear` 收缩（t=1.1s 52.3px → t=3.1s 44.8px）；悬停 toast 立即暂停（条隐藏，t=4.2–12.2s 保持存活）；移开后按 3s 重臂（`transition 3s`，t=15.2s 到期消失、条目真删）。另单独实测点击 Undo：删除→点击 Undo→条目恢复（entries before=1, after undo=1）。
- **Parakeet 提示**：本地模型切到 parakeet-tdt-0.6b-v3 后转写页出现提示 "The current model parakeet supports English and 25 European languages only — for Chinese, Japanese, Korean or Cantonese audio, switch the offline model to sensevoice-small in Settings."，与未下载橙色横幅并存（ss_e92de1b8）；切回 sensevoice-small 后提示消失。
- **>3h WAV 快速报错**：构造 1044 字节假 WAV（44 字节标准头，data size 声称 11000s=3.06h，byteRate 32000）拖入转写页，约 1s 内出现 "File exceeds the 3-hour limit — please split it first."，未进入解码（ss_9a6b9a5b）。

### 专项 4：词典走查（结论：通过）

一次粘贴导入 5 行（含重复词、21+ 字超长词、假名词）：
- 只入库 3 条（去重 + 超长丢弃），并同时给出两条提示："1 word(s) were not added (over the 300-hotword limit or longer than 20 characters)." 与 "1 word(s) contain Japanese kana — saved, but auto-correction currently only supports Chinese and ASCII words."（dict_after_import.png）。
- 搜索 "テスト" 精确过滤出假名词条。
- 导出下载 `speaktype-dictionary-2026-08-19.txt`：UTF-8 BOM（EF BB BF）+ 一行一词 `SpeakType\n转写引擎\nテスト用語\n`，与粘贴导入天然 round-trip。
- 清空两步确认：首点变红色 "Clear all words? Click again"，4s 不点自动回弹为 "Clear"（dict_clear_reset.png）；双击后全部清空（dict_after_clear.png）。

## 已测 / 未测

- 已测：生产 relay 配对/按住说话/落字/刷新重连、语言跟随（en/ja/zh 三档桌面语言 × 手机页）、坏地址错误路径与无重启恢复、relay 闲置僵死复现与手动恢复、Undo 倒计时全状态机（初始 15s/悬停暂停/离开 3s 重臂/到期真删/点击恢复）、Parakeet 提示出现与消失、>3h 假头 WAV 快速拒绝、词典导入导出清空搜索全流程。
- 未测：实体手机扫码（浏览器模拟替代）；手机页麦克风权限被拒分支（fake-ui 恒允许）；坏地址 QR 被扫后的手机端表现（推论：浏览器打不开页）；P1-1950 僵死的精确触发时长（介于 1–5 分钟闲置，未做二分）；房间被占（第二台手机）分支；LAN 直连页语言跟随（本轮 relay 模式下 43117 端口不监听，仅源码证据）。

## 建议下一轮

1. 修复 P1-1950（relay ws 心跳/守活）后做 30 分钟闲置 soak：闲置→手机随时连入→落字，全程无需手动开关。
2. 修复 P3-1951：QR URL 携带 lang 参数，5 语言 × 手机页逐一走查（含 manifest）。
3. 补测房间被占分支与实体手机路径（或用第二个模拟手机同时入房验证 "该房间已有手机连接"）。

## 产物（测试机本地）

- 关键截图：`C:\Users\Administrator\screenshots\`（配对 phone_pair_1787177231460、落字+英文桌面 ss_fada4653/ss_7a576be0、日文桌面后手机页 phone_after_ja、桌面坏地址红字 ss_3b1c4a70、手机等待电脑 phone_desktop_offline、恢复 ss_28a376f5、僵死双侧 phone_zombie_check/ss_30bd4b86、Undo toast ss_7f41c3e1、3h 报错 ss_9a6b9a5b、Parakeet 提示 ss_e92de1b8、词典 dict_after_import/dict_clear_reset/dict_after_clear）
- Undo 倒计时逐秒采样与手机页驱动脚本：`C:\Users\Administrator\tts\pw\`（undo.mjs / phone.mjs / dict.mjs / transcribe.mjs）
- 假 3h WAV：`C:\Users\Administrator\tts\fake3h.wav`（1044 字节）
- 日志：`%APPDATA%\SpeakType\logs\main.log`（22:14–22:27 段为专项 2 与 P1-1950 证据）
