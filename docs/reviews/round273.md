# 第 273 轮体验官报告（user-experience-officer + qa-engineer）

- 日期：2026-08-31
- 被测版本：main @ d551158（含 #365），SpeakType 0.17.0，Windows 打包版实测
- 环境：Windows Server 2022 VM（无真实麦克风，使用 Chromium fake mic 参数 + 标准 RIFF WAV），Node 24.0.1 构建，Electron 43.3.0，electron-builder 26.15.3
- 方法：npm install / typecheck / build / pack:dir 全部本地通过后，用 release\win-unpacked 打包版走查；portable 版用 `npx electron-builder --win portable --x64` 构建实测
- 本轮专项：① portable 版实测 ② 文件转录长音频 + 历史页 ④ 官网横幅上线实查

## 一、构建链路（通过）

| 步骤 | 结果 |
|---|---|
| npm install（desktop/） | 通过，429 packages，0 vulnerabilities（Node 20 会有 engine warning，需 Node ≥22，用 Node 24.0.1） |
| npm run typecheck | 通过 |
| npm run build | 通过 |
| npm run pack:dir | 通过，产出 release\win-unpacked |
| portable 构建 | 通过，产出 SpeakType-0.17.0-portable.exe（91.7MB）。注意：`--prepackaged release/win-unpacked` 方式会报 nsis.7z 缺失失败，直接 `--win portable --x64` 正常 |

## 二、核心链路回归（全部通过，实测证据）

1. **RightCtrl 中文落字：通过**。fake mic 播放中文 TTS（"帮我跟老板说那个方案需要再改一下明天上午之前给他答复"），按住 RightCtrl 8 秒松开，Notepad 实际落字：`帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复`，标点正确。日志 `dictation finalize: durationMs=7845 maxPeak=32766 voicedMs=4040`。
2. **Alt+Q 免按多句（自动分段）：通过**。Alt+Q（按住 150ms 规避防误触）进入免按，fake mic 循环播放期间 Notepad 连续落下 4 段独立文本（每段间空行分段），日志对应 4 条 finalize（15:22:16 / 15:22:26 / 15:22:36 / 15:22:44），再次 Alt+Q 正常退出。截图：ss_52e3ba66.png。
3. **Esc 取消：通过**。按住 RightCtrl 录音 3 秒后按 Esc：无新落字（Notepad 保持空、Ln 1 Col 1），日志无新的 finalize 条目。截图：ss_0d824e94.png。

## 三、立案项

### P1-273-1 portable 版本地 ASR 完全不可用：缺失 sherpa-onnx-node 原生模块

- **复现步骤**：
  1. `cd desktop && npx electron-builder --win portable --x64`
  2. 把 SpeakType-0.17.0-portable.exe 放到独立目录运行（fake mic 参数）
  3. 配好 sensevoice-small 模型（模型文件放入 SpeakType-data\models\sensevoice-small）与 language=zh
  4. 按住 RightCtrl 说话 → 无任何落字
- **实测证据**（portable 数据目录 logs\main.log）：
  ```
  [2026-08-31 15:33:14.543] [warn]  sherpa prewarm failed Error: Cannot find module 'sherpa-onnx-node'
  Require stack: - C:\Users\ADMINI~1\AppData\Local\Temp\SpeakType\resources\app.asar\out\main\index.js
  ```
  对照解包内容：
  - 安装版 `win-unpacked\resources\app.asar.unpacked\node_modules`：koffi、**sherpa-onnx-node、sherpa-onnx-win-x64**、uiohook-napi（且 resources 下还有 whisper\ 目录）
  - portable 运行时解到 `%TEMP%\SpeakType\resources\app.asar.unpacked\node_modules`：**只有 koffi、uiohook-napi**，sherpa 两个包和 whisper 目录全部缺失
- **影响面**：portable 版（官网"绿色免安装版"主推下载项之一）本地离线识别（SenseVoice/Parakeet/whisper）全部不可用，核心卖点"完全离线"在 portable 版失效。若 v0.17.0 发布的 portable 资产同样由该 target 产出，则线上用户已受影响（本条为本地构建实测，线上资产未逐一验证）。
- **修复建议**：检查 electron-builder portable target 的打包内容——asarUnpack 的 sherpa-onnx-node / sherpa-onnx-win-x64 与 extraResources（whisper）未进入 portable NSIS 自解压包。修复后需实测 portable exe 落字并核对 %TEMP%\SpeakType 解包内容。

### P2-273-1 官网 #365 新横幅文案未上线（Pages 部署停滞）

- **复现步骤**：浏览器/带 nocache 参数的 curl 实查 `https://speaktype.zalize.com` 与 `/zh/`。
- **实测证据**（2026-08-31 15:38 UTC，cf-cache-status: DYNAMIC，非缓存）：
  - 线上英文横幅：`v0.17.0 is out - privacy hardening, cleaner uninstall and portable mode`
  - 线上中文横幅：`v0.17.0 已发布 —— 隐私加固与更干净的卸载/绿色版`
  - 仓库 main（docs/index.html:40、docs/zh/index.html:40，#365 已合并）：`hands-free voice commands, auto paragraph breaks and smarter pause detection` / `免按语音命令、自动分段与更聪明的停顿判停`
- **影响面**：第 272 轮 P3-272-1 的修复（#365）对用户不可见；官网卖点仍是上一版文案。
- **修复建议**：检查 zalize.com 站点的部署链路（Cloudflare Pages/Workers 构建触发）。GitHub Actions 按公司规则保持禁用，需确认站点部署不依赖 Actions，或手动触发一次部署并核对线上横幅。
- **边界说明**：#365 合并、仓库文案正确为实测；"部署停滞的具体原因"为推断，未查 Cloudflare 后台。

### P3-273-1 portable 首页仍显示"下载离线模型"引导横幅（模型已就位）

- **实测证据**：portable 版 SpeakType-data\models\sensevoice-small 模型文件完整（model.int8.onnx 239,233,841 bytes）、speaktype.json localModel=sensevoice-small，但 Home 页仍显示 "Download the offline speech model" 横幅（截图 ss_b76a2021.png）。
- **说明**：可能与 P1-273-1 同根因（sherpa 模块加载失败导致模型状态检测失败），修复 P1 后回归验证即可；单独列出避免遗漏。

## 四、专项通过项（含证据）

### 专项① portable 版（数据分区/跳过迁移：通过；核心落字：失败，见 P1-273-1）

- portable exe 首次启动即在 exe 旁创建 `SpeakType-data\`（speaktype.json、history.json、logs 等齐全），日志：`portable mode, userData at C:\Users\Administrator\portable-test\SpeakType-data`，与安装版 %APPDATA%\SpeakType 完全隔离。
- 无 legacy 迁移动作（对照安装版日志有 `no legacy userData to migrate` / `userData config already present`，portable 日志无迁移行为，%APPDATA% 配置未被读取——portable 默认配置为全新初始值）。
- 核心落字因 P1-273-1 失败。

### 专项② 文件转录长音频 + 历史页（通过）

- ffmpeg 以 `-stream_loop` 正确拼接 RIFF 生成 5 分 41 秒 WAV（10,915,662 bytes）。
- Transcribe 页选择 long273.wav：流式出段、进度百分比正常，最终 **61 segments** 带时间戳，Copy all / TXT / SRT 导出按钮均出现（截图 ss_6d14c735.png、ss_bc9977df.png）。~5.7 分钟音频约 1.5 分钟转完（含流式显示）。
- 历史页出现 File 类型条目：`File · 15:36 · long273.wav · 5min`，多行预览 + Show all（截图 ss_90a088b1.png）。
- 搜索框输入 `long273`：仅命中该 File 条目，fileName 参与搜索确认（截图 ss_791f54c8.png）。

### 专项④ 官网横幅实查（页面可用性通过；新文案未上线，见 P2-273-1）

- `/` 与 `/zh/` 页面本身加载正常、结构完整（Features/Engines/对比表/FAQ/下载区齐全），v0.17.0 下载链接指向 GitHub releases。
- 新横幅文案未上线，立案 P2-273-1。

## 五、未测试项（如实声明）

- 需要真实音频设备的项（系统静音检测、真实麦克风增益/降噪、muteWhileRecording 实际效果）：本 VM 无音频设备，**untested**。
- 专项③ 设置导入导出兼容旧版本配置、专项⑤ 应用人设规则实测：本轮未选，未测试。
- 线上发布的 v0.17.0 portable 资产是否与本地构建同样缺失 sherpa 模块：未下载线上资产逐一核验（推断同源，需在修复 P1-273-1 时一并确认）。
- 手机麦克风（LAN/relay）、ChatGPT/豆包网页通道、AI 润色接入：本轮未覆盖。
- Alt+Q 免按的 4 段落字来自 fake mic 循环播放同一句；真实多句异构内容的分段边界准确性未单独构造测试。

## 六、实测证据与源码推断边界

- 实测：构建产物、打包版/portable 版运行日志、Notepad 实际落字文本、Transcribe/History 页面截图、线上页面 curl 文本与截图、解包目录 diff。
- 推断：官网部署停滞的根因（未查 Cloudflare 后台）；线上 portable 资产受影响范围；P3-273-1 与 P1-273-1 的同根因假设。

## 七、环境清理

已关闭 SpeakType（安装版与 portable）、Notepad、fake mic 播放来源进程；已删除 portable-test 目录与临时长 WAV；测试期间未修改产品代码、未提交 secrets、未改防火墙/hosts。
