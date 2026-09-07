# 第 192 轮体验官报告（严格 QA/UX 走查）

- 审查对象：最新 main（HEAD `e63e315` fix(transcribe): missing-model banner downloads in place… #287）
- 方法：一律打包版实测。`npm --prefix desktop run typecheck / build / pack:dir` 全绿后运行
  `desktop\release\win-unpacked\SpeakType.exe`，fake-mic 4 参数 + `--remote-debugging-port=9333` 启动，
  全新档案（本机为全新 VM，`%APPDATA%\SpeakType` 测前不存在，英文 locale）。落字目标 Notepad。
- 证据：采样 CSV / heap snapshot / 差分 / 斜率 / 截图存于测试机 `C:\Users\Administrator\r192-evidence\`，
  专项 3/4 全程录屏（逐项 annotation）
  `C:\Users\Administrator\screencasts\rec-33559906-a888-4d80-8862-3779ffd3972a\...-edited.mp4`。
- 边界声明（如实区分验证过/没验证过）：
  - 专项 1/2 为 CDP + 进程采样取证，无录屏；专项 3/4 为 GUI 实测，有录屏 + 截图。
  - 专项 3 原计划「改名 models\sensevoice-small→.bak 构造未下载态」：本机为全新 VM，模型从未下载过，
    缺模型态天然成立，**未做改名/还原**（无可还原对象）；下载后的模型保留为下轮资产。
  - 未覆盖：手机麦克风局域网/中继页面；长时（2h+）soak 验证漂移是否 plateau；
    英文 locale 默认模型 parakeet-tdt-0.6b-v3 的首下链路（本轮主动切到 SenseVoice 测试）。

---

## 一、立案列表

### P2-1921：panel/字幕 renderer 空闲漂移根因坐实——`panel.tsx` 无条件 60ms setInterval 重渲染循环（第 189~191 轮 +0.41 MB/min 的元凶）

- 根因：`desktop/src/renderer/src/panel.tsx` 挂载时无条件启动
  `setInterval(() => setLevels(prev => [...prev.slice(1), …]), 60)`，每 60ms 触发一次 React 状态更新 + 重渲染，
  窗口从未 show、无录音时也终身运转（约 16.7 次/秒）。配合专项 2 证据（隐藏窗不被 Chromium 节流），
  该循环在纯空闲时持续制造分配churn。
- 三组对照（同一打包版、纯空闲、30s 采样、PrivateBytes 线性回归，`memA/B/C.csv` + `slopes_A/B/C.txt`）：

  | 组 | 处理 | panel renderer 斜率 | 其余 6 进程 |
  |---|---|---|---|
  | A 正常空闲 19min | 无 | **+0.556 MB/min**（44.5→峰值~57.6 MB） | 全部 ≤±0.003 |
  | B 用 CDP 清掉该 60ms interval（页面其余保持活跃） | `clearInterval` | **+0.004 MB/min**（49.7→49.8 MB） | 全部 ≤±0.001 |
  | C `Page.setWebLifecycleState frozen` 冻结 panel | 冻结 | **-0.497 MB/min**（55.4→50.2 MB，内存回落） | 全部 ≤±0.023 |

  单变量清掉这个 interval 漂移即归零 ⇒ 因果成立。
- 定位在哪一侧：**不是 JS 堆对象积累**。
  - Arm A 首尾 V8 heap snapshot 差分（`heapdiff_A.txt`）：total self_size 6.86→6.65 MB（**-206.9 KB**），
    最大变化项是 BytecodeArray -112.9 KB（V8 bytecode flushing），无任何对象类持续增长。
  - `Runtime.getHeapUsage` 采样（`jsheapA.csv`）：usedSize 全程 3.6~4.4 MB 平稳。
  - GPU 进程斜率 -0.002，排除 GPU/合成器侧。
  - 增长体现在 renderer 进程 PrivateBytes（原生侧提交内存的分配churn棘轮）；Arm A 结束时做 heap snapshot
    （强制 full GC）后 PrivateBytes 从 ~57.6 回落到 50.5 MB，说明是**可回收垃圾未及时归还**，
    不是真泄漏——但空闲常驻应用放任 +0.5 MB/min 棘轮不可接受（托盘常驻场景数小时即数十 MB）。
- 复现：打包版启动后不做任何操作，30s 间隔采样 panel renderer 的 PrivateBytes ≥15min，回归斜率 ≈+0.4~0.6 MB/min。
- 修复方向建议（按优先级）：
  1. **状态门控（最小修复）**：`panel.tsx` 的波形 interval 只在 status 为 recording/connecting 时启动，
     其余状态 `clearInterval`——Arm B 已证明清掉即归零，改动仅数行、无副作用面。
  2. 不要指望 `backgroundThrottling`/`document.visibilityState`：专项 2 证明隐藏 panel/toast/recorder 的
     visibilityState 恒为 visible、rAF 满速 61fps（panel/toast 为透明+alwaysOnTop 窗口，Electron 文档记载
     透明窗不参与 occlusion 检测——此句为文档依据，未逐条实验验证）。
  3. 如需更彻底：主进程在 win.hide()/show() 时 IPC 通知 renderer 暂停/恢复一切动画与定时器（可见性驱动）。

### P3-1922：隐藏窗（panel/toast/recorder）对 renderer 全部伪装为 "visible"，定时器/rAF 零节流——立案为设计风险备注

- CDP 对三个隐藏窗逐一实测（窗口从未 show）：

  | 窗 | visibilityState | rAF 频率 | 60ms interval 实际 tick |
  |---|---|---|---|
  | panel.html | visible | 61/s | 16.7/s（不节流） |
  | toast.html | visible | 61/s | 16.7/s（不节流） |
  | recorder.html | visible | 61/s | 16.7/s（不节流，且显式 backgroundThrottling:false） |
- 当前实际危害仅 panel（P2-1921）：toast/recorder 没有常驻定时器，Arm A 中斜率均 ≈0，不空转。
- 立案理由：这是**系统性前提失效**——任何后续在这三个窗里加的动画/轮询都会满速空转且无法靠
  visibilityState 自愈；recorder 的 `backgroundThrottling:false` 是有意为之（PCM 管道），panel/toast 无此需要。
- 建议：修 P2-1921 时一并在代码注释/贡献文档记载「隐藏窗 visibilityState 恒 visible，动画必须状态门控」。

---

## 二、专项 3：PR #287 回归——全部通过，未发现回归

打包版 0.15.1、全新档案、Settings→语音识别切本地模型为 SenseVoice 后进 Transcribe 页（录屏逐项 annotation，截图见 r192-evidence）：

| 项 | 结果 | 证据 |
|---|---|---|
| 缺模型 amber 横幅出现，文案点名 `sensevoice-small`，横幅内唯一按钮为 `Download model`，无「去设置」跳转 | PASS | ss_8752c55c.png |
| 点击后按钮变 `Downloading 58%`（disabled）+ 横幅内进度条推进，页面停留在 Transcribe 不跳转 | PASS | ss_a1c21efa.png |
| 下载完成横幅消失；磁盘确认 `models\sensevoice-small\model.int8.onnx` 239,233,841 字节 | PASS | ss_d24ff05c.png |
| wav 文件转写出 segment，文本逐字匹配语料句，Copy all / TXT / SRT 按钮出现 | PASS | ss_38c90dbb.png |
| Home 页缺模型横幅同步消失 | PASS | ss_f1f30b09.png |

备注：本机带宽下 239MB 约 5 秒下完，进度态仅捕获一帧（58%）；下载中断/续传（Resume xx%）路径本轮未构造，**未验证**。

## 三、专项 4：自由走查（F8 改写 mock 链路 + 按应用切人设）——全部通过，无新缺陷

F8 改写（本地 mock OpenAI 兼容端点 127.0.0.1:8975，固定返回 `[REWRITTEN-BY-MOCK]`）：

- 未配 provider 按 F8：toast "Rewrite needs a polish model…" 且主窗自动跳到 Settings → AI polish，把配置入口带到眼前——体验合理（PASS，ss_a5625905.png）。
- 配好端点（Test connection 显示 "Connected: mock-model"）后，Notepad 选区被替换为 `[REWRITTEN-BY-MOCK]`；mock 控制台收到 prompt，含原文与口述指令（PASS，ss_8f2bfcbb.png + mock 日志）。
- 无选区按 F8：toast "Nothing selected — Select the text first…"，文档未变（PASS，ss_9c732662.png）。

按应用切人设：

- 新建人设 notepad-writer（风格 "keep it short and plain."）+ 规则 match `notepad`；Notepad 前台 RightCtrl 听写后
  History 条目 `notepad-writer · 8s · Local offline`，且 mock 润色 prompt 中出现 `风格要求：keep it short and plain.`（双证据，PASS，ss_a9b6ae77.png）。
- 反例：前台为 SpeakType 自身窗口听写，History 条目为 `Default`，未误用规则人设（PASS，ss_dc9f63f2.png）。

## 四、下一轮候选专项 Top3

1. **P2-1921 修复后回归 + 长时 soak**：状态门控修复合入后，复测三组对照归零，并做 2~3h 纯空闲 soak
   确认 PrivateBytes 收敛/plateau（本轮未验证长时行为）；顺带覆盖「大量录音后回落」。
2. **手机麦克风局域网/中继页面（PWA）**：多轮未覆盖的完整面——局域网直连、中继模式、断线重连、权限提示文案。
3. **英文 locale 默认模型 parakeet-tdt-0.6b-v3（660MB）首下体验 + 转写页异常路径**：全新英文档案默认即 parakeet，
   首下体积是 SenseVoice 的 2.8 倍；同时覆盖下载中断/续传（Resume 文案）、下载中切页、转写大文件与取消。
