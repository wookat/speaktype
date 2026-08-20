# SpeakType 第 239 轮严格体验官报告

- 基线：main @ `10e7a32`（含 PR #330：ITN 大数「百」段前缀 + zhNorm 补收 劃→划），版本 0.15.1
- 打包：`npm run build` + `npx electron-builder --dir`（win-unpacked，Electron 43.3.0 / electron-builder 26.15.3），实测对象为打包产物 `release\win-unpacked\SpeakType.exe`
- 环境：Windows 10（本轮为全新 VM，测试基建从零重建），Node v20.19.0
- 手法：fake mic（`--use-file-for-fake-audio-capture` + 合成 16k/mono WAV）+ mock OpenAI 兼容 ASR（127.0.0.1:8899，逐行回放脚本）+ Notepad 落字 + 合成扫描码 SendInput（RightCtrl 按 extended 扫描码注入）
- 证据级别标注：实测确认 / 源码论证 / 推测 / 未测试

## 0. 核心闭环（不可回归项）

按住 RightCtrl 说话 → 松开 → 识别 → 文本落到 Notepad 光标处：**PASS（实测确认）**。

- 连续 4 次 hold 听写全部落字成功，含中文长句、ITN 数字、反例句、繁体句；落字带内置规则句读。
- 免按（Alt+Q）连续 31 分钟约 180 段全部落字，无一段丢失、无崩溃、悬浮条状态正常。
- 附带验证：hold 键松开事件丢失时（模拟工具误用导致按住数分钟）录音持续，补发 keyup 后仍能正常转写落字，无卡死（实测确认）。

## 1. PR #330 回归：ITN 百段大数/反例 + zhNorm 繁→简

### 1.1 端到端（mock ASR → 落字，实测确认）

| 输入（mock 返回） | 落字结果 | 判定 |
| --- | --- | --- |
| 今年的预算是三百万下半年再追加一百万 | 今年的预算是3000000下半年再追加1000000 | PASS（百段前缀生效） |
| 公司估值五百亿融资两百五十万 | 公司估值50000000000融资2500000 | PASS |
| 千万别忘了万分感谢那位百万富翁 | 千万别忘了万分感谢那位百万富翁（原样） | PASS（成语/惯用语反例不受伤） |
| 项目工作計劃需要陳慧琳确认一下 | 原样落字（繁体保留） | 符合设计（云端通道不做繁→简，见 asr.ts 注释；简繁转换仅本地通道/History 搜索/热词匹配） |

### 1.2 源码级批量回归（esbuild 直接打包 `itn.ts`/`zhNorm.ts` 运行，源码论证）

53 例全部通过（fail=0），覆盖：
- 百段正例：三百万/一百万/两百五十万/三百五十六万/五百亿/二百三十亿/一百千（不成词不触发）等；
- 反例：千万别、万分、百万富翁、成百上千、约数（三四百万）、已含阿拉伯数字前缀等；
- zhNorm：劃→划（PR #330 新收）、計→计、陳→陈、慧/琳 等常用繁体抽查。

### 1.3 zhNorm E2E 抽查（实测确认）

History 页用简体「计划」搜索，命中含繁体「計劃」的记录 → PR #330 劃→划 在搜索链路生效，PASS。

## 2. 专项 A：免按 31 分钟 PrivateBytes 斜率（实测确认）

方法：Alt+Q 免按 + fake mic 循环供音（约每 10s 一段，共约 180 段），每 30s 采样 SpeakType 全部 8 个进程 PrivateBytes/WorkingSet，31 分钟全窗口线性拟合（62 个采样点/进程）。

| 进程 | PrivateBytes 首→末 | 斜率 | WorkingSet |
| --- | --- | --- | --- |
| main（2360） | 118 → 180.5 MB | **+1.97 MB/min，全程线性无饱和** | 84→57 MB（平稳/下降） |
| renderer（4288） | 47 → 64.3 MB | +0.44 MB/min | 平稳 |
| renderer（6824，悬浮条/字幕） | 46.7 → 74 MB | +0.30 MB/min | 平稳 |
| 其余 5 进程（gpu/utility/renderer） | — | ≈0 | 平稳 |
| **合计** | **355 → 455 MB / 30.9 min** | **≈+3.2 MB/min** | 平稳 |

主进程逐 3 分钟采样：118→124→130→138→144→149→154→162→166→171→180 MB —— 近乎完美线性，**未见饱和拐点**。

结论：第 237 轮「+60MB/10.5min（≈5.7MB/min）、WorkingSet 平稳」的观察本轮复现且定性升级：增长集中在 **main 进程**，斜率稳定 ≈2MB/min，30 分钟级不饱和 → 按 8 小时工作日外推 main 进程约 +960MB，属需要修复的泄漏（WorkingSet 平稳说明 OS 在换出，但提交内存持续上涨）。立案 P2-2391。

## 3. 专项 B：Transcribe 页 sensevoice-small 全链路（实测确认）

- Settings→语音→Provider 切「内置离线识别」→ 模型选 sensevoice-small（234MB）→ UI 内下载，进度条正常，约 2 分钟完成，落盘 `models\sensevoice-small\model.int8.onnx`（239,233,841 字节）+ `tokens.txt`。
- 素材：本机合成 12.6s 中文 WAV（16k/mono），原文「今天下午三点开会，请大家准时参加。会议地点在二楼会议室。这个项目的预算是三百万元。」
- 转写结果：「今天下午3点开会，请大家准时参加会议地点在二楼会议室。这个项目的预算是300万元。」——内容全对；ITN 生效（三点→3点、三百万元→300万元）；「参加。」后的句号缺失导致两句粘连（模型级句读瑕疵，立案 P3-2393）。
- TXT 导出：UTF-8 带 BOM，内容与页面一致，尾部换行，PASS。
- SRT 导出：UTF-8 带 BOM，序号 1 起、时间轴 `00:00:00,000 --> 00:00:12,595` 与 12.6s 音频吻合，PASS。
- 导出走系统保存对话框，默认文件名取音频名（zh_meeting.txt/.srt），符合预期。

## 4. 自由走查：Dictionary（热词词典）页（此前未覆盖）

全部实测确认：

- 批量粘贴导入：逐行 trim、空行跳过，前后空格词「  前后有空格  」正确入库为「前后有空格」，PASS。
- 超长词（25 字）被拒并给出明确黄条提示「1 line(s) were not added…」，PASS。
- 词条 chip 删除（×）即时生效并持久化到 speaktype.json，PASS。
- 导出：`speaktype-dictionary-2026-08-20.txt`，UTF-8 BOM、一行一词，与导入天然 round-trip，PASS。
- 清空：两步确认（红色「Clear all words? Click again」，4 秒不点自动回弹），连续两次点击成功清空，防误触设计合理，PASS。
- **发现不一致**：热词搜索框输入繁体「陳」不命中「陈慧琳」（`Dictionary.tsx` 用裸 `includes`），而 History 搜索同场景可命中（用了 zhNorm `toSimplified`）。同产品两处搜索行为不一致，立案 P3-2392。

## 5. 立案清单

| 编号 | 级别 | 问题 | 证据级别 |
| --- | --- | --- | --- |
| P2-2391 | P2 | 免按长会话 main 进程 PrivateBytes 线性增长 ≈2MB/min（31min 118→180MB 无饱和；全进程合计 ≈3.2MB/min）。8 小时外推近 1GB，需定位主进程音频缓冲/分段链路的泄漏 | 实测确认 |
| P3-2392 | P3 | Dictionary 热词搜索不做繁→简归一（繁体查不到简体词条），与 History 搜索（zhNorm）行为不一致 | 实测确认 + 源码论证（Dictionary.tsx L53 裸 includes vs History.tsx toSimplified） |
| P3-2393 | P3 | sensevoice-small 转写偶发句号缺失致两句粘连（「请大家准时参加」+「会议地点…」），影响 SRT/TXT 断句可读性 | 实测确认（模型级，单样本） |

无 P0/P1。第 237 轮 P3-2371/P3-2372（PR #330 目标）验证已修复，未见回归。

## 6. 本轮未测/限制

- 真麦克风、真云端 ASR（豆包/ChatGPT 通道）：未测试（mock 手法验证协议层）。
- 免按会话超过 31 分钟的更长窗口、以及 P2-2391 的泄漏根因定位：未测试（建议下轮 --inspect 堆快照）。
- Transcribe 多段长音频（多 SRT 条目）与 MAX_SECONDS 边界：未测试（本轮单段 12.6s）。
- sensevoice 之外的离线模型（parakeet/whisper 系）转写：未测试。

## 7. 下轮 Top3 建议

1. **P2-2391 根因定位**：主进程 `--inspect` + 堆快照对比（免按 10min 前后），重点排查 live session 的 PCM 缓存、分段定时器与 IPC 缓冲是否未释放；修复后复测 30 分钟斜率应≈0。
2. **Dictionary 搜索接入 zhNorm**（P3-2392）修复回归 + 热词在本地通道（sensevoice）听写中的纠错命中率抽查（繁体热词×简体输出交叉）。
3. **Transcribe 长音频全链路**：接近时长上限的多段音频 → 多条 SRT 时间轴单调性/衔接正确性 + TXT 分行，顺带覆盖取消（Cancel）与错误分支。

## 8. 清理

- 已结束 SpeakType 全部进程、mock ASR node 进程、Notepad。
- 已删除 `%APPDATA%\SpeakType`（settings/history/logs/transcribe-last/models 含 234MB sensevoice 模型）。
- 已删除 Downloads 下导出的 zh_meeting.txt/.srt、speaktype-dictionary-*.txt。
- 测试基建脚本（fake-mic WAV 生成、mock ASR、rkey）保留在 `C:\Users\Administrator\tts\`（惯例位置，供后续轮次复用），未提交进仓库。
- launchAtLogin 全程 false，无开机自启残留。
