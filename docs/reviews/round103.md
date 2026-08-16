# 第 103 轮体验官审查报告 — 官网一致性全查 + Transcribe 大文件边界

- 基线：main @ `3f85c24`（含 #184），`npm run pack:dir` 退出码 0，打包版实测
- 环境：Windows Server 2022，虚拟声卡；延迟绝对值仅作同机相对对比
- 口径：【实测】/【源码】/【未验证】/【推测】

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

零新立案，观察 ×2。

## ① 官网英/中页与应用实态一致性全查

对照对象：https://speaktype.zalize.com/ 与 /zh/ 全文（2026-08-16 抓取）vs 打包应用 v0.15.0 实态与源码。

| 官网声明 | 应用实态 | 判定 |
|---|---|---|
| v0.15.0 三资产（Setup 98MB / portable 87MB / apk）| 直链 HEAD 全 200，实测 103.2/91.7/2.5 MB（=98.5/87.4 MiB，官网约数吻合）| 一致【实测】 |
| releases/latest 链接 | 200 指向 v0.15.0 | 一致【实测】 |
| 文件转录「音视频 mp3/wav/m4a/mp4…最长 3 小时，导出 TXT/SRT」| Transcribe 页实态一致；3 小时上限【源码 Transcribe.tsx + locales transcribe.tooLong】| 一致 |
| 内置模型：SenseVoice-Small（每句约 0.27s 带标点）/ Parakeet 0.6B v3 / whisper.cpp tiny-base-small | 应用内三类模型齐全；0.27s 与本机 101/102 轮实测落字中位 203-300ms 同量级 | 一致【实测】 |
| ASR 预设：OpenAI Whisper/Groq/Fireworks/Mistral Voxtral/SiliconFlow/阿里云百炼 | constants.ts 预设逐一对应 | 一致【源码】 |
| 润色预设：DeepSeek/智谱 GLM-4-Flash/Kimi/通义/OpenAI/Ollama（Gemini 以「兼容端点」表述非预设）| constants.ts 逐一对应，Gemini 无预设但兼容声明成立 | 一致【源码】 |
| 手机麦：QR 配对、LAN 直连/自部署中转、APK+PWA | 100 轮起多轮实测一致 | 一致【实测】 |
| FAQ：热键改键含鼠标侧键、Alt+Q 免按、学词 UIA 机制、%APPDATA% 数据位置、卸载保留数据、ChatGPT/豆包免责 | 与应用行为/历轮实测一致（鼠标侧键无硬件【源码】）| 一致 |
| 5 种 UI 语言 | 一致【实测】 |
| 近期功能（#164 页签更名、文件转录、手机麦）| 官网无过时描述：引导写「设置 → 语音识别」（zh 页签名一致）| 基本一致 |

观察①（不立案，文案级）：EN 页两处写 “Settings → Recognition”，应用 EN 页签实名为 “Speech”（zh 页「语音识别」与 zh 页签一致，仅 EN 措辞不同）。建议官网 EN 改为 Speech。

## ② Transcribe >30 分钟大文件边界【实测】

fixture：57 分 42 秒 WAV（110MB，四段拼接）。

- 进度连续性：0%→100% 连续推进，约 2.5-3 分钟完成（≈20x 实时），完成后显示 180 段带时间戳（0:00→57:17，末段 57:42 完），无缺段跳段。
- 内存：转录中进程组峰值 ≈1.8GB（与源码「16k 浮点采样约 660MB」量级相符），完成后回落 ~600MB→256MB，无泄漏迹象。
- 中途取消：约 45% 处 Cancel，已出的 81 段保留且 Copy all/TXT/SRT 均可用；重选同文件从 0 重跑正常。
- 导出：TXT（42.6KB）与 SRT（48.8KB，180 条 `HH:MM:SS,mmm` 区间连续到 00:57:42）落盘内容核对无误。
- 转录期间热键：RightCtrl 听写**并行可用**，正常落字进 Notepad 与历史，不互斥不排队、互不干扰（转录继续推进）——比「排队提示」更优的设计，无需立案。
- 结果持久化：杀进程重启后 180 段完整恢复（transcribe-last.json）【实测】。

观察②（不立案，自动化摩擦）：文件选择对话框内 Ctrl+L 会触发默认播放器打开音频（Windows 对话框行为非产品缺陷）；导出另存对话框正常。

## ③ 核心回归【实测】

RightCtrl 中文「今天下午3点开会，预算是5200元」含 ITN + Alt+Q「我们明天去公园散步」准确落字——且本轮是在 57 分钟大文件转录进行中执行，结果仍全对（顺带验证并发鲁棒性）。

## 清场记录

- 大音频 fixture/导出文件/concat 清单已删；transcribe-last.json、latest-release.json 已删；配置/历史还原；SpeakType 进程 0；无 .part；43117 无监听；防火墙三 profile 保持 OFF。

## 下轮候选

1. 度量脚本第三数据点随下个发版跑。
2. 手机麦真机/云端 key 补账（挂账）。
3. 官网 EN “Settings → Recognition”→“Speech” 一词修正（若采纳顺带回归）。
