# 第 191 轮体验官报告（严格 QA/UX 走查）

- 审查对象：最新 main（HEAD `f5a6e6b` fix(handsfree): Alt+Q 退出免按补齐退出提示 + 句间空档退出停麦解除静音 #286）
- 方法：一律打包版实测。`npm --prefix desktop run typecheck / build / pack:dir` 全绿后运行
  `desktop\release\win-unpacked\SpeakType.exe`，fake-mic 4 参数启动
  （`--no-proxy-server --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=...`），
  全新档案（`%APPDATA%\SpeakType` 测前不存在，首启 main.log 含 `no legacy userData to migrate`）。
- 证据：截图/CSV/日志/CDP 时间线存于测试机 `C:\Users\Administrator\r191-evidence\`，
  录屏 `C:\Users\Administrator\screencasts\r191-main\r191-main-edited.mp4`（专项1 矩阵 + 专项4，含逐项 annotation）。
- 边界声明：文件转录完整链路（下载真模型后拖 wav → 转录 → 导出）本轮未覆盖；
  专项2/3 为 shell/CDP 取证，无录屏。其余结论均为一手实测。

---

## 一、立案列表

### P2-1911：Transcribe「去下载」按钮在云端 provider 下是死胡同（实测坐实第 190 轮 P3，升级 P2）

- 现象：`Transcribe.tsx` 的缺模型 amber 横幅只查 `settings.localModel` 的下载状态（与 asrProvider 无关）；
  点「去下载」→ `App.tsx` `goModelSettings` = `setSettingsJump("voice") + setPage("settings")`；
  但 `VoiceTab.tsx` 的本地模型下载卡只在 `asrProvider === "local"` 分支渲染。
- 实测矩阵（4 provider，UI=zh-CN，模型均未下载）：

  | asrProvider | 横幅出现 | 落点 | 落点有下载控件 | 判定 |
  |---|---|---|---|---|
  | doubao（默认） | ✓ | 设置→语音识别 | ✗（整页滚到底无） | **死胡同** |
  | openai | ✓ | 设置→语音识别（仅 BaseURL/API Key/测试） | ✗ | **死胡同** |
  | chatgpt | ✓ | 设置→语音识别（仅登录/测试） | ✗ | **死胡同** |
  | local | ✓ | 设置→语音识别（含「本地模型」卡+「下载模型」按钮） | ✓ | 唯一可用路径 |

- 复现：任一云端 provider + 未下载 base-q5_1 → 打开文件转录页 → 点「去下载」→ 落点页无任何可操作的下载项。
- 证据：`p1_{doubao,openai,chatgpt,local}_banner.png` / `_landing.png` / `_landing_scrolled.png`（共 11 张）+ 录屏。
- 定级理由：文件转录是核心功能之一，默认 provider 即 doubao（即装即中招），引导按钮把用户带进无出口页面，
  属「明显缺陷」而非打磨项，建议从第 190 轮的 P3 升级为 P2。

### P3-1912（备注级，不立案）：panel/字幕 renderer 纯空闲 +0.41 MB/min 微漂移持平

- 22 分钟纯空闲（不录音、零交互）、30s 间隔、44 采样/进程、全窗口线性回归（PrivateBytes）：

  | 进程 | 斜率 MB/min | 对比上轮 | 判定 |
  |---|---|---|---|
  | main | -0.003 | 上轮 +0.42~0.97 | **改善，归零** |
  | renderer 主窗口 | -0.001 | — | 持平 |
  | renderer panel/字幕 | **+0.409** | 上轮 +0.41~0.52 | 持平未恶化 |
  | renderer toast | -0.000 | — | 持平 |
  | renderer recorder | -0.001 | — | 持平 |
  | GPU / utility network | -0.002 / -0.001 | — | 持平 |

- panel 窗口全程从未显示过仍 +0.41 MB/min，22 分钟约 +9 MB，量级尚小，维持观察不立案；
  根因排查列入下轮候选。WorkingSet 斜率为负是 Windows 空闲 working-set trim（80→32MB），非泄漏信号。
- renderer→窗口映射基于 `--renderer-client-id` + 窗口创建顺序（4=主窗/5=panel/6=toast/7=recorder），
  CDP 只确认进程类型，映射为高置信推断（已在证据文件注明）。
- 证据：`idle_mem.csv`、`idle_slopes.csv`、`idle_pid_kinds.txt`、`idle_pid_cmdlines.txt`、`idle_procinfo.txt`。

### 专项2 判定：toast「空白窗口」用户不可感知，不立案（P3 备注：DOM visible 是误报信号）

- 复核结论修正第 190 轮观察：toast renderer 的 `document.visibilityState` 从首启起**长期**为
  `visible`、body 空文本、520×92 rect（21s~180s 全程如此），不是"约 12 秒"的暂态，而是常态。
- 但三重取证证明屏幕上没有空白块：
  1. 原生 `EnumWindows`：`SpeakType Toast` HWND `visible=False`（Electron `show:false` 生效）；
  2. 全屏截图对应区域零可见像素（窗口 transparent + `#00000000`）；
  3. 放大截图 `p2_toastrect_zoom.png` 确认无渲染痕迹。
- 结论：真实用户不可感知，不立案。教训：打包版 CDP 的 `visibilityState=visible` ≠ 窗口在屏（Electron
  隐藏窗口的 renderer 可保持 visible），后续取证必须配合原生窗口枚举+像素证据。
- 证据：`toast_timeline.txt`、`p2_winenum_t90s.txt`、`p2_launch_t3s.png`、`p2_launch_t20s.png`、`p2_toastrect_zoom.png`。

### 专项4 自由走查：词典页 + 五语 UI，全部通过，无立案

- Dictionary：空态（0/300 文案正确）；导入 3 词 → 2 词入库计数 2/300、24 字超长词被拒且提示「1 个词未能加入」、
  假名词触发假名提示；Clear 两步确认（首次点击仅进入红色确认态、json 中 hotwords 未变、约 4s 自动回弹）。
- 五语抽查 zh-CN/zh-TW/en/ja/ko ×（Transcribe 横幅/语音识别页/词典页）：无溢出、无截断；
  最长按钮 ko「다운로드하러 가기」像素级确认单行完整含内边距。
- 证据：`p4_dict_*.png`（5 张）、`p4_{zhTW,en,ja,ko}_{banner,speech,dict}.png`、`p4_ko_banner_button_zoom.png` + 录屏。

---

## 二、专项1 设计论证（供改的人参考）

**关键架构事实（源码一手确认）**：文件转录与实时听写的 provider 是两套体系——
`transcribe.ts` 的 `transcribeStart()` 恒取 `settings.localModel || "base-q5_1"` 走本地 whisper/sherpa，
**与 `asrProvider` 完全无关**。也就是说第 190 轮设想的「云端 provider → 提示无需下载」方向是**错的**：
即使用户实时听写用豆包/OpenAI，文件转录也真的需要先下载本地模型。横幅出现是对的，错的只是落点。

**推荐方案（按优先级）**：

1. **首选：横幅内就地下载**。在 Transcribe 页 amber 横幅里直接放「下载 base-q5_1（xx MB）」按钮 +
   进度条，复用现成的 `api.localModelDownload` / `api.onLocalModel`（VoiceTab 已有全套逻辑可抽组件）。
   用户零跳转完成闭环，也彻底绕开「设置页按 provider 条件渲染」的耦合。工作量小、无歧义，最适合。
2. **次选：落点页强制显示模型卡**。`goModelSettings` 改为携带锚点（如 `voice#local-model`，
   settingsJump 已支持 anchor 机制），VoiceTab 在收到该锚点时即使 `asrProvider !== "local"` 也渲染
   本地模型卡（标题可注明「用于文件转录」），并滚动定位。保持"去设置下载"心智但消除死胡同。
3. **不推荐**：云端 provider 隐藏横幅或提示「无需下载」——与文件转录的真实依赖矛盾，会让用户在
   转录时才踩到缺模型错误，属于把问题往后推。

无论选 1 或 2，建议同时把横幅文案从「离线模型还没下载」改为「文件转录需要离线模型（与实时听写的
云端服务无关）」，消除用户"我用的是豆包为什么要下模型"的困惑。

---

## 三、下一轮候选专项 Top3

1. **P2-1911 修复后的回归**：4-provider 矩阵重跑 + 文件转录完整链路（下载真模型 → 拖 wav → 转录 → 字幕/文本导出），后者本轮未覆盖。
2. **panel renderer 空闲漂移根因**：窗口从未 show 仍 +0.41 MB/min；建议 3×22 分钟对照（panel 显示过 / 从未显示 / DevTools heap snapshot 差分），定位是 JS 堆还是原生侧。
3. **toast renderer 生命周期**：`show:false` 下 `visibilityState` 恒为 visible，排查 toast 页是否因此空转动画/定时器（与候选 2 的 panel 漂移可能同根）。

---

## 四、清场记录

- 所有 SpeakType 进程已杀（`Get-Process` 计数 0）；`%APPDATA%\SpeakType` 整目录已删除
  （删除前结构存档 `appdata_structure_before_cleanup.txt`：speaktype.json/history.json/logs/Chromium 缓存，
  本轮未产生 failed-audio / transcribe-last）；HKCU Run 键无 SpeakType 残留。
- 未动防火墙/hosts；GitHub Actions 保持禁用未触碰；未改任何产品代码。
