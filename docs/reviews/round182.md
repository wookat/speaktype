# 第 182 轮严格体验审查报告

- 审查对象：最新 main `737d0f9`（含 #269 paste 前等物理修饰键释放、#270 测试经验沉淀）重新 clone 等效更新 + `npm ci && npm run pack:dir` 打包版
- 方法：fake mic + rkey 合成键（含 #270 沉淀的 atomic 残留修饰键序列）+ CDP，按 `.agents/skills/testing-speaktype-desktop/SKILL.md` 执行；每个结论附一手证据
- 结论：**P0 ×0 · P1 ×0 · P2 ×2 · P3 ×2**；#269 回归通过（R180 P1 丢字窗口 2/2 落字），剪贴板文本/位图恢复达到竞品水准，粘贴兜底矩阵产出供产品决策
- 录屏：`C:\Users\Administrator\screencasts\rec-c7588fa7-76af-4d8c-9b58-e5483574cb9c\rec-c7588fa7-76af-4d8c-9b58-e5483574cb9c-edited.mp4`
- 构建注记（非阻塞）：`npm run pack:dir` 在签名阶段 exit 1，但 `win-unpacked` 产物完整新鲜；开测前已用 asar 抽查确认包内含 #269 GetAsyncKeyState 逻辑。建议排查签名步骤配置。

---

## 一、#269 回归确认 —— 通过

| 场景 | 结果 | 证据 |
|---|---|---|
| 免按 ~2.5s 快退出 + Alt 残留 160ms（R180 丢字窗口） | 落字成功，2/2 稳定 | `ss_zoom_67101b0f.png`、`ss_zoom_73c62d56.png` |
| Alt 残留 800ms | 落字成功（1s 封顶内等到释放） | `ss_zoom_508e3c4d.png` |
| Alt 残留 1600ms | **不落字**（封顶后盲发被吞）——见 P2-1 | `ss_21cb83e2.png`、`ss_zoom_2022ed37.png` |
| 正常 RightCtrl 听写 | 松手 ≤2s 全句落字，无可感等待（Ctrl 不在等待列表） | `ss_zoom_12d2a146.png` |

R180 P1 判定为已修复。

---

## 二、问题清单

### P2-1 Alt 残留超过 1s 封顶后仍盲发 Ctrl+V，静默丢字（设计边界，建议改口径）

- **复现**：免按 ~2.5s 快退出，Alt 残留 1600ms → 等待封顶 1s（50×20ms）后仍发 Ctrl+V → 变 Ctrl+Alt+V 被目标吞掉；历史有条目、无落字、无提示。
- **定性**：#269 代码明确写死的封顶行为，不算回归失败；但「超时后盲发」延续了静默丢字。1s 封顶合理（不能无限等），问题在超时后的处置。
- **建议**：封顶超时不盲发，转为「内容已保存到历史，可从历史页复制」toast（文本此时已在剪贴板+历史，用户零损失）。
- 证据：`ss_21cb83e2.png`（前置态）、`ss_zoom_2022ed37.png`（Col 不变）。

### P2-2 「有窗口但无输入焦点/只读控件」粘贴静默失败（R180 P3-1 复核后升级）

- **复现与矩阵**（兜底枚举专项，逐场景实测）：

| 目标场景 | 实测现状 | 文本去向 | 用户反馈 | 证据 |
|---|---|---|---|---|
| 桌面焦点（Progman） | toast「当前没有可输入的窗口 内容已保存到历史，可从历史页复制」 | 仅历史 | ✅ 有 | `ss_23450a5a.png` |
| SpeakType 自身窗口（无输入焦点） | **静默失败**（连拍 3 张无 toast） | 仅历史（统计 37→38） | ❌ 无 | `ss_a6aa8705.png`、`ss_e09ddcb2.png` |
| 只读控件（WinForms ReadOnly TextBox） | **静默失败**，字段保持基线文本 | 仅历史 | ❌ 无 | `ss_d0c26574.png`、`ss_91da921c.png` |
| cmd.exe 标记/选择模式 | 选择态被自动取消，全句正常落到提示符 | 目标窗口 | 正常 | `ss_7a95f8c2.png`、`ss_641d56a2.png` |
| 提权窗口（跨完整性等级 UIPI） | untested（测试机全程 Administrator，无法构造） | — | — | — |

- **定性**：现有 no-target 兜底 toast 只覆盖 Progman/WorkerW 桌面壳类名判断；「有效窗口但粘贴无效」全部静默。R180 P3-1 的价值得到实证，**升级为 P2**。
- **建议**：粘贴后验证（剪贴板序号变化/焦点控件 UIA 可编辑性），或统一「已存历史」提示；与 P2-1 的超时处置共用同一条 toast 即可。

### P3-1 历史「清空」不清统计，「彻底重置」无入口且遗漏面大（R180 P3-2 展开）

- 历史 Clear all（两击确认 `ss_07d6e951.png`）：history 41→0、失败录音目录整体删除 —— 行为正确。
- 但 Home 三卡统计不动：json `{words:1212,sessions:40}` 不变 + 截图 `ss_43fa1789.png` 双证。用户「清空历史」的直觉预期与实际口径不一致。
- 「彻底重置」目前无任何 UI 管理的数据：**stats**（history.json 内）、**模型 ~868MB**（parakeet-tdt-0.6b-v3 + sensevoice-small）、**transcribe-last.json**、**speaktype.json 全部内容**（settings/personas/doubaoAppKeyCache + 遗留空 history/stats 顶层键）、**logs**、Electron Local Storage/Cache。
- **建议**：设置页加「重置所有数据」入口，明示各项（含模型是否保留的选项）；历史 Clear all 时给「是否连统计一起清」的选择或至少文案说明。

### P3-2 词典「清空」确认态 ~3s 超时回弹且按钮位移，易误触「导出」

- 复现：点「清空」进入确认态 → 犹豫 ~3s 确认态自动回弹且按钮位置变化 → 在原位置点击落在「导出」上，弹出保存对话框（`ss_8ff7ac26.png`）。真实用户同样会中招。
- 建议：确认态不自动超时（点击其他区域才取消），或回弹后保持按钮布局不位移。

---

## 三、剪贴板恢复边界（竞品对齐检查）—— 达标

- 5000 字符 ASCII+中文长文本：落字后剪贴板与原文件**字节级一致**（`ss_16d6e6e4.png`、`ss_zoom_c27a6839.png`）。
- 64×64 位图：落字后 ContainsImage=True、尺寸一致、双像素探针一致——**像素级恢复**（`ss_ba0ba3d0.png`、`ss_zoom_9095a2e0.png`）。对齐 Handy v0.9.5 的 non-text clipboard preserve。
- FileDropList（Explorer 复制文件）：**不恢复**，粘贴后剪贴板残留听写文本（`ss_zoom_de300cda.png`）——与 #138 声明一致，记为文档化边界非 bug；若追求完整对齐可排低优先级。

---

## 四、竞品对照：下一轮最高价值改进 Top2

（基于 R180 对 Wispr Flow 2026-08 文档、Handy v0.9.5、CapsWriter v2.6 的调研，结合本轮实测）

1. **语音 Snippets（说 cue 词插入整段格式化文本）** —— Wispr Flow 桌面+移动全线主打（个人 Snippets + 团队共享 Snippets），Android 端甚至支持听写中语音触发展开。典型场景：日程链接、自我介绍、常用回复。我们的词典/热词架构可直接复用（词条→整段文本 + 触发词匹配层），实现成本低、高频用户每天省几十次复制粘贴，是差异化面上「花小钱补大短板」的第一选择。
2. **流式/GPU 低延迟识别** —— Handy v0.9.0 起集成 transcribe.cpp 真流式；CapsWriter v2.5/2.6 用 Qwen3-ASR-1.7B GGUF（Vulkan/DML）做到 100-300ms 转录延迟、还有 GPU 预加速锁频配置。我们离线 partial 仍是 ~1s 整段重解码 + 主进程同步解码（长句可短暂卡 UI），松手到落字的体感延迟是与竞品正面对比时最容易被感知的差距。建议路径：sherpa-onnx streaming 模型（zipformer streaming）或把解码移出主进程 + 增量解码，两步走。
3. （第三候选留档：Wispr Flow 上下文感知——价值高但涉及读屏隐私边界与实现成本，建议在 Snippets/流式之后立项，并做成默认关闭的可选项。）

---

## 五、「是否有更好设计」反问与建议

1. **静默丢字的最后一公里**：P2-1 + P2-2 本质是同一件事——「粘贴不保证成功，但产品假装成功」。是否直接立一条产品原则：*凡是文本没有落到目标窗口，用户必须在 3 秒内知道，且一键可补救*？统一实现为「粘贴后验证 + 已存历史 toast」，一次修复覆盖全部场景。
2. **统计的语义**：统计到底是「设备生涯统计」还是「当前历史的汇总」？两种都合理，但要选一个并在 UI 上说清楚；现在是前者的行为配后者的直觉。
3. **确认式按钮的通用规范**：词典清空的 3s 回弹误触说明「二次确认态」需要统一规范（不位移、不自动超时/超时前有倒计时视觉），历史 Clear all 与词典 Clear 应共用同一套组件行为。

---

## 六、测试基建注记（供 SKILL.md 合入）

增量要点已写盘：`C:\Users\Administrator\tts\SKILL-round182-addendum.md`（放仓库外为守住 git status 纪律），内容包括：#269 1s 封顶口径与 rkey 残留控制、剪贴板像素级验证配方、兜底 toast 仅覆盖 Progman/WorkerW、词典确认态 3s 回弹陷阱、ReadOnly WinForms 目标构造法、pack:dir 签名 exit 1 应对、桌面 toast 连拍取证。

---

## 七、收尾纪律确认

- 未开防火墙、未动 hosts、未提交 secrets。
- SpeakType/electron 进程 0 残留；speaktype.json + history.json 均从 .bak182 还原（历史恢复 28 条），bak180/bak182 备份已删；无 .part 残留；HKCU Run 无 SpeakType 项（仅原有 Docker Desktop）；`git status --porcelain` 空（除本报告），HEAD 737d0f9。
- 唯一 untested：提权（UIPI）粘贴目标，需非管理员运行 SpeakType + 提权目标环境才能构造。
