# 第 67 轮体验官审查（main @ 3b940a0，本机 pack:dir 实测）

日期：2026-08-15。产品代码与 round66 实测版本一致（#127 仅 SKILL.md）。本轮主题：round66 观察项定性——parakeet 单文件损坏后 UI Download 是否为增量重下，以及文案是否值得优化。

## 结论速览

- P0/P1/P2：无新增。
- **观察项定性（round66 遗留）**：增量重下 **实测成立**——joiner（6.2MB）损坏时点 Download 仅重下该文件（~6 秒完成），encoder/decoder/tokens 三件 mtime 全程未变，重下件 SHA256 与原件一致。
- **P3（文案，建议优化）**：见下。

## 1 增量重下实测（round66 观察项 → 定性）

复现/证据：
1. joiner.int8.onnx（SHA 3164C13F…48B3，6,355,277 B）替换为 34B 垃圾；localModel=parakeet。
2. 启动 → Home 引导条「Download the offline speech model / One-time download (~660MB)」（ss_73a5f8ed.png）。
3. 点 Download → 按钮变进度百分比（点击瞬间 0%，ss_7c893782.png）。
4. **~6 秒后**（22:50:10 点击 → 22:50:16 log `local model parakeet-tdt-0.6b-v3 downloaded`）引导条消失（ss_0c4a7a9b.png）。
5. 文件系统证据：joiner 恢复 6,355,277 B、mtime=22:50:16（新）；encoder/decoder/tokens mtime 均保持 8/14 15:13（未动）；重下 joiner SHA256 与原件**一致**。
6. Settings→Speech：Status ✓ Ready、「Model ready」（ss_f20925f9.png）；后续英文 RightCtrl 实际落字（worker 正常起）。

代码依据：download.ts downloadFiles 对已存在且 size 相符的文件 continue，仅 size 不符者 rmSync 重下——与实测一致。

### 文案论证（P3，建议做）

- 现状：单件损坏时引导条仍写「One-time download (~660MB)」，且进度条从 0% 起算至 100%（onProgress 以 doneBytes+got/totalSize 计，跳过件在遍历到时才计入 doneBytes，小文件下载快看不出跳变）。
- 问题：用户会以为要重下 660MB / 消耗大流量，可能因此不敢点或去手动删目录重来；实际只需 6MB/数秒。
- 修法候选（低成本）：downloadFiles 预扫一遍 dest，把「已存在且 size 相符」的字节数先累进 doneBytes 并把待下字节数回传 UI，引导条文案在待下 < 总量时改为「检测到 X 个文件损坏/缺失，仅需补下 ~YMB」（i18n 5 语言）。进度条也自然从真实比例起算。
- 优先级论证：非功能缺陷（行为已正确），但属「用户不敢点」型信任问题，改动面小（download.ts + Home 文案），建议 P3 排期。

## 2 深挖 A：Dictionary 手动热词 + 纠错 E2E — 通过

- Dictionary 页 textarea 输入 `SpeakType` → Save → chip 出现、计数 1/300（ss_9fc385cf.png）。
- RightCtrl 英文一句（parakeet）→ 落字 **"Please open SpeakType and start dictation now."**（ss_6b739e65.png）——无词典时历轮同语料为 "speak type" 两词，correctAsciiHotword 合并纠正实证生效。
- 搜索 `Speak` 命中 chip（ss_ece0b86b.png）；搜索 `zz` 无命中；点 chip X 删除 → 0/300 空态（ss_9059ce94.png）。
- **P3（文案）**：搜索无命中时空态显示「No hotwords yet / Add names and jargon…」（ss_63b27be8.png），与「词典有词但过滤无命中」语义不符，建议区分为「No matches for "zz"」（Dictionary.tsx:104-108 filtered.length===0 未区分 query 是否为空）。

## 3 深挖 B：Home 统计计数 — 通过

- 基线 Sessions 123 / Words 7106（ss_zoom_94963c59.png，且该值本身已含本轮英文一句的 122→123 增量）。
- 重启后数值持久（ss_69418ac9.png）。
- 一次中文 RightCtrl 后 **Sessions 124（恰 +1）/ Words 7132（+26）/ Time saved 2h40→2h41**（ss_zoom_cd7b7782.png）。

## 4 核心回归 — 通过

- RightCtrl 英（parakeet）："Please open SpeakType and start dictation now."（finalize 7889ms）。
- RightCtrl 中（sensevoice，UI 切换模型）：「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」Col 140（finalize 7883ms）。
- Alt+Q 免按一轮：进/退干净、两段 finalize（9806/3313ms）、中文落字 Col 178。

## P0-P3 汇总

| 级别 | 项 | 状态 |
| --- | --- | --- |
| P3 | 单件损坏时下载引导仍写 ~660MB 全量 + 进度从 0% 起（实际增量 6MB/6s），建议改增量提示 | 新增，修法见 §1 |
| P3 | Dictionary 过滤无命中与词典为空共用「No hotwords yet」空态 | 新增，修法见 §2 |

## 下轮候选

- 增量下载文案优化落地后的验收（若立项）。
- Setup 安装包升级链（Setup→升级→配置保留）。
- muteWhileRecording（仍需真声卡）；真手机麦克风 relay（仍需真机）。
- History 搜索/导出边界（长文本、多语言混排）。

## 清场记录

joiner 为重下正版（SHA256 与原件一致，.bak167 删除）；speaktype.json/history.json 从 bak167 恢复；进程 0；43117 无监听；无 .part；防火墙三 profile OFF（全程未执行任何开启命令）；未改产品代码。
