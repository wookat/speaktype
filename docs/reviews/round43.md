# SpeakType 第 43 轮严格审查报告 —— 下载中断续传 + 网页会话通道（ChatGPT/豆包）无登录态

- 构建：main@d1708d5（含 PR #95），`npm run pack:dir` 全绿，win-unpacked 打包实测
- 前置：%APPDATA%\SpeakType 备份后移除模拟新机（测毕已还原，无 .part 残留）
- 证据标注：【实测】真机证据；【源码】源码推断；【未验证】未执行

## 一、模型下载中断→续传（全过，含加码破坏性测试）

1. **kill 模拟断电**：Parakeet 下载中途 `taskkill /F` 全进程 → 磁盘留下 `encoder.int8.onnx.part` + `.part.json`（记录 url/etag/total 的断点元数据）【实测】。
2. **重启识别断点**：再启动 Home 横幅按钮变 **"Resume download (99% done)"**，百分比与磁盘断点一致（shots/01）。
3. **续传非重下**：点 Resume 后数秒内完成收尾（652MB 未重新下载，网络流量与耗时铁证）；**#94 就绪 toast 在续传路径同样弹出**（"Offline model ready — All set…"，shots/02），`local model parakeet-tdt-0.6b-v3 downloaded` 入日志，最终无 .part 残留。
4. **加码：占位损坏 .part 续传**：删除成品文件，伪造 100MB 全零 `.part` + 真实 etag 的 `.part.json` → 点 Resume → 日志 `download source failed: … sha256 mismatch (huggingface.co)` **校验捕获损坏** → 自动落到下一源整文件重下 → 完成后 `Get-FileHash` 实测 = etag 期望值逐字节一致。**损坏断点自愈全自动、用户无感知、无死循环**【实测】。

## 二、网页会话通道无登录态走查（1 个 P2）

两条通道均有统一的免责警示条（非公开接口/账号风险自负/建议离线或自带 key），选择器文案与官网叙事一致。登录后链路【未验证】（本机无可登录账号）。

**ChatGPT 通道（全过）**：
- 引导清楚：说明区写明 "sign in once inside the app… free accounts"，有 "Sign in to ChatGPT" 按钮 + **"Test transcription"**（文案明示 "failures show the exact reason"）。
- 未登录点 Test → `FAIL · Not signed in to ChatGPT: click "Sign in to ChatGPT" in Settings → Speech recognition`——可读可操作（shots/03）。
- 未登录直接 RightCtrl 口述 → 错误 toast 同文案 + **"Recording kept — press the hotkey again to retry"**，失败条目入历史并保留 failed-audio 录音（shots/04）——不卡死、可自救，体验达标。
- Sign in 按钮弹应用内登录窗，正常载入 chatgpt.com（本测试机数据中心 IP 遇 Cloudflare 人机验证属环境因素，shots/05）。

**豆包通道（P2）**：
- 页面结构合理：登录/自动截获按钮 + App Key 手填框（placeholder 提示可留空自动截获）。
- **P2（本轮最重要发现）：未登录状态 RightCtrl 口述 → 完全静默零反馈**。三次实测（含释放后即刻截图两次）：无 toast、无错误提示、不落字、历史零条目、无 failed-audio、日志零记录——新用户选了豆包没登录，说完一句话后得到的是"什么都没发生"，与 ChatGPT 通道的 toast+留音+历史三件套形成鲜明不对称。第 28/40 轮立的「降级必须可见」守则再次被同族问题命中。
- 【源码】根因：`startDoubaoSession` 无 key 即 `throw error.noAppKey`（doubao.ts:133-135），dictation.ts start() catch 后只 `report("error")` 进状态 overlay（转瞬即逝），不走 finalize 侧的 showToast/历史/留音路径；ChatGPT 通道恰好在 finalize 阶段失败所以吃到完整错误三件套。
- 修复建议（~10 行）：start() catch 分支对用户可操作的配置类错误（noAppKey/noAsrConfig/localModelMissing 同族）补 showToast + openSettings 引导，或统一走 lastFailed 路径保留录音重试。注意 noAppKey 文案要带"去 设置→语音识别 登录豆包"的行动指引。
- 另一不对称（P3）：ChatGPT 有 "Test transcription" 按钮而豆包没有，未登录用户在设置页无法自查状态，只有 "Not configured" 徽标。

## 三、常规回归（全过）

- RightCtrl 核心链路：切回内置离线 → "Core path regression for round 43." 逐字落字含 ITN（forty three→43）（shots/07）。
- 官网下载链接三个仍指向 v0.11.0；Speech 设置页 Ready/模型下拉无回归。

## 四、分级汇总与下轮候选

| 级别 | 问题 | 修复建议 |
|---|---|---|
| P0/P1 | 无 | — |
| P2 | 豆包未登录口述完全静默零反馈（无 toast/历史/留音/日志） | start() 配置类错误补可见 toast+设置引导（~10 行），文案带行动指引 |
| P3 | 豆包通道无 Test transcription 自查按钮（与 ChatGPT 不对称） | 补按钮或未登录时置灰+提示 |

**下轮候选排序**：
1. P2 豆包静默失败修复回归（可顺带补 P3 按钮）。
2. 云端成功路径补测（等老板 key 到位：有余额 chat key + Groq 免费 ASR key）。
3. 网页会话通道登录后链路（需可登录的 ChatGPT/豆包账号，或由测试工程师在有账号的机器上走）。

## 测毕清场

原配置/模型已还原（无 .part）；SpeakType/Notepad 进程已清；防火墙三 profile 全 OFF、未执行任何开启命令。未修改产品代码。
