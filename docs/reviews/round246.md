# SpeakType 第 246 轮体验官验收报告

- 日期：2026-08-29
- 角色：user-experience-officer + QA（第 246 轮）
- 基线：main @ `6318ea1`（clone 最新 main，含已合并 PR #338）
- 实测形态：打包版 `desktop/release/win-unpacked/SpeakType.exe`（`npm --prefix desktop run typecheck` → `build` → `npx electron-builder --dir` 全部通过）
- 环境：Windows Server 2022，Node v20.19.0，npm 10.8.2，ffmpeg 8.1.2；模型 sensevoice-small（ONNX SHA256 `C71F0CE0...2CD51`，与 `download.ts` 清单一致）
- 测试音源：fake mic WAV（16k 单声道；msedge-tts 2.0.7 WebSocket 合成持续失败 `Stream closed before the synthesis completed`，改用 edge-tts-universal@1.4.0 合成 + ffmpeg 转 16k 单声道，语料语义等同）
- 启动参数：`--no-proxy-server --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=C:\Users\Administrator\tts\hf246.wav --remote-debugging-port=9333`
- 落字目标：Notepad

---

## 1. PR #338 回归（P3-2397：免按句间空档帧丢字/中英混杂）——部分通过，建议问题保持开放

### 测法
`hf246.wav` 三句中文（"今天下午三点开会…/这个项目的预算是三百万元/会议地点在二楼会议室"），句间 2.6s 空档，fake mic 循环播放。Alt+Q 开启免按，焦点 Notepad，连续采集 16 段落字（主日志 17:59:26–18:00:46 共 16 条 `dictation finalize`），全选复制存证 `r246_hf.txt`。

### 结果（一手证据）
实测落字全文（截图 ss_f5b129cb/ss_b9a56803，剪贴板存证）：

```text
今天下午3点开会，请大家准时参加。项目的预算是300万元。会议地点在二楼会议室。
今天下午3点开会，请大家准时参加。这个项目的预算是300万元。议地点在二楼会议室。
今天下午3点开会，请大家准时参加。这个项目的预算是300万元。地点在二楼会议室。
今天下午3点开会，请大家准时参加。项目的预算是300万元。会议地点在二楼会议室。
今天下午3点开会，请大家准时参加。项目的预算是300万元。会议地点在二楼会议室。
今天下午3点开会，请大家准时参加。
```

- ✅ 中英混杂：16 段全部为纯中文，第 245 轮出现的 "is"/英文碎片 0 次复现 → #338 的 carry 补喂对该症状有效。
- ✅ 整体连续性：句间空档说话每句都产生独立落字，没有整句丢失。
- ❌ 句头丢字仍复现：多段出现句首 1-2 字缺失——"(这个)项目的预算"×3、"(会)议地点"×1、"(会议)地点"×1。丢的都是新会话起始的头部帧，说明 `HANDS_FREE_CARRY_MAX_FRAMES=25`（约 0.5s 环形缓冲）在"上一段 finalize→busy 复位"的窗口内仍可能不足以覆盖已开口的音头（VAD 判停 2s + finalize 处理耗时期间开口的场景）。

### 结论
#338 修复了中英混杂，但 P3-2397 的"句头丢字"半边未关闭。建议：P3-2397 保持开放（或拆出 P3-2397b），方向是 finalize 期间的帧不走"非 busy 丢弃/环形覆盖"，而是全量暂存到下一会话（丢弃仅在明确空闲静音时发生），或以 RMS 判断 carry 内是否已有语音起点、动态扩容。

---

## 2. P3-2395 设计论证（splitByPauses / MAX_SEG_S / capLongSegment）——建议维持立案，推荐"双阈值"方案

### 源码事实（desktop/src/main/transcribe.ts）
- `PAUSE_S=0.5`：静音（帧 RMS < 峰值×0.02）连续 ≥0.5s 才切；切点取静音段中点；且两侧子段各 ≥`MIN_SUB_S=1.5s` 才生效。
- `MAX_SEG_S=28` / `MIN_CUT_S=16`：`capLongSegment` 对超 28s 的段在 16–28s 窗口内找 RMS 最低帧强制切。

### 实测（文件转录页，打包版）
| 语料 | 设计点 | 结果 |
|---|---|---|
| `fast246.wav`（句间 0.35s） | 低于 0.5s 阈值 | 1 段 0–8.0s，三句合一（transcribe-last.json，截图佐证）→ 0.35s 停顿确实不切，标点靠模型自给，无丢字 |
| `ctrl246.wav`（句间 0.7s） | 高于阈值对照 | 3 段（0–3.6 / 3.6–6.4 / 6.4–8.7s），每段一句，切点准确 |
| `long246.wav`（约 41s，内部仅 0.3s 间隔） | 触发 28s 封顶 | 2 段（0–16.3 / 16.3–41.0s）：第一刀来自 splitByPauses 在 16.3s 附近的相对低能量点；第二段 24.7s<28s 不再切。文本完整无丢字，但第二段句读质量下降（"今天下午3点开会。请大家准时参加这个项目的预算…"跨句粘连） |

注：long246 语料由 TTS 句子以 0.3s 间隔拼接，非严格无停顿朗读，capLongSegment 的"16–28s 窗口内选 RMS 最低点"路径已验证会被触发，但真实酣畅朗读下的切点质量未单独验证（如实区分）。

### 是否立案与推荐
- 快语速下 0.5s 阈值并不"过敏"（不切是安全方向），风险反而是**长段+密集停顿时切点全部失效→整段送 28s 封顶强切**，长段末尾句读/标点质量下降（long246 第二段已见）。
- 建议 P3-2395 维持立案但改表述：不是调低 0.5s，而是**双阈值**——保持 0.5s 主切分，另加"段长超过 ~20s 时降级用 0.3s 次级阈值补切"（或对 >MIN_CUT_S 的段落在次级静音点先切），避免频繁落入 capLongSegment 的盲切。1.5s 强制切不推荐：会把正常语段切碎（ctrl246 的 0.7s 停顿即会被 1.5s 方案漏切）。

---

## 3. 自由走查（2 项）

### 3.1 深浅色主题切换 —— 通过
设置页主题"跟随系统→深色"即时生效（截图 ss_c6cde5e8），首页/历史/词典/设置各页深色下对比度、控件可读性正常（ss_81ef0513、ss_3955498d），统计卡片数据正常显示。未发现残留浅色元素。无立案。

### 3.2 配置导出/导入回归 —— 通过（1 个 P3 交互问题）
- 词典添加热词"赛博测试词"→ 设置页导出 JSON（`cfg246.json`，1169B，含 settings/hotwords/theme 等，"配置已导出"提示，ss_0d858ef1）。
- 删除热词后导入该文件 →"配置已导入并生效"，词典热词恢复"赛博测试词"（1/300，ss_7ea27ef5），主题等设置一致。导出确认不含 API 密钥字段明文之外的意外敏感项（导出 JSON 人工核对）。
- **P3-2398（新立案）**：导出 Save As 对话框默认文件名 `speaktype-config-2026-08-29`，用户在文件名框输入绝对路径时默认名不被选中清除，直接拼接成非法文件名并弹 "The file name is not valid."（ss_c77f5126）。建议导出默认名带 `.json` 后缀并全选默认名（Electron `showSaveDialog` defaultPath 行为可优化）。

### 挂账复核
- P3-2396（EBADENGINE）：本轮 `npm install` 在 Node v20.19.0 下仍复现 engine 警告（依赖要求 >=22.12），安装可完成，维持 P3。

---

## 4. 竞品对照（只调研不实现；来源为三家公开功能页 2026-08-29 抓取）

| 竞品 | 与 SpeakType 的差异点 |
|---|---|
| Wispr Flow | 边说边"AI 清稿"（去 um/口头禅、自动改写重复与自我更正）、100+ 语言自动检测、自动学习个人词汇、按 App 记忆语气风格、语音 snippet 短语扩展 |
| Handy | 定位与 SpeakType 最接近（免费/开源/本地/简单），无明显功能超集 |
| superwhisper | 预设模式（Message/Email/Voice 等按场景切换语气与格式）、会议助手（录音+自动笔记）、文件转录、翻译到英语、Super Mode（读屏幕上下文增强） |

**最值得借鉴补齐的 3 个点**：
1. **口语清稿（filler/自我更正/重复清理）**：Wispr Flow 核心卖点；SpeakType 已有 polish 链路（polishEnabled），可加"本地规则级"轻量清稿（哔、嗯、啊、重复词）不依赖云 LLM，缩小与 Flow 的体验差距。
2. **场景模式（persona 的格式化维度）**：superwhisper 的 Message/Email 模式本质是"落字格式模板"；SpeakType 人设目前偏语气，可为每个人设补充目标格式（是否分段/是否保留句号/列表化），成本低感知强。
3. **词汇自学习闭环强化**：两家都强调"自动学你的专有名词"；SpeakType 已有"自动学习纠错"开关，但缺少学习结果的透明呈现/一键确认（学到了什么、来自哪次纠正），补齐可提升信任感与留存。

---

## 5. 立案汇总

| 编号 | 级别 | 状态 | 描述 |
|---|---|---|---|
| P3-2397 | P3 | 保持开放 | #338 后中英混杂已消失，但免按句头丢字（新会话头部帧覆盖/丢失）仍复现（16 段中 5 段丢 1-2 字） |
| P3-2395 | P3 | 维持并改方向 | 不建议调低 0.5s 或 1.5s 强切；推荐"超长段降级 0.3s 次级阈值补切"避免盲切 |
| P3-2396 | P3 | 维持 | Node 20 下 EBADENGINE 警告复现，安装可完成 |
| P3-2398 | P3 | 新立案 | 配置导出 Save As 默认文件名与用户输入拼接导致非法文件名报错，且默认名无 .json 后缀 |

## 6. 已验证 / 未验证清单
- 已验证：打包链路（typecheck/build/electron-builder 全绿）、免按 16 段落字回归、fast/ctrl/long 三组切片边界、深色主题、配置导出导入往返、模型 SHA256。
- 未验证：真实麦克风与真实语速（全部为 TTS 合成音）；"录音时静音其他应用"（VM 无音频输出设备，无法判定）；capLongSegment 在严格无停顿朗读下的切点质量；五语 UI、F8 mock 改写（本轮未覆盖）。

## 7. 证据索引
- 免按落字剪贴板存证：r246_hf.txt（16 段全文）
- 主日志：`%APPDATA%\SpeakType\logs\main.log` 17:59:26–18:00:46 共 16 条 `dictation finalize`
- 文件转录结果：`%APPDATA%\SpeakType\transcribe-last.json`（fast/ctrl/long 三组）
- 截图：免按运行中 ss_f5b129cb、结束提示 ss_ea22b391、全文选中 ss_b9a56803、ctrl 3 段 ss_cedb5996、设置页 ss_a64bf5e2、深色 ss_c6cde5e8、导出文件名报错 ss_c77f5126、导入生效 ss_2ba065b7、热词恢复 ss_7ea27ef5
