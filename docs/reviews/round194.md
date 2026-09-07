# 第 194 轮体验官报告（严格 QA/UX 走查）

- 审查对象：main @ `c0ac7a3`（fix(panel): waveform refresh interval only runs while recording, #288）
- 方式：`npm --prefix desktop run typecheck / build / pack:dir` 全绿后，用打包版 `desktop\release\win-unpacked\SpeakType.exe` 实测（`--use-fake-device/-ui-for-media-stream` + `--use-file-for-fake-audio-capture`，`--no-proxy-server`），落字目标 Notepad。
- 环境说明：本 VM 为全新环境（无 `%APPDATA%\SpeakType`、无上轮 `C:\Users\Administrator\models-backup`），本轮为 Parakeet 真·首次下载；默认模型即 `parakeet-tdt-0.6b-v3`。

## 结论速览

- **专项1（#288 后长时 soak）：通过**。38 分钟混合 soak，分 7 个 PID 采样 152 轮，空闲段 panel/index/toast 斜率全部 ≤ ±0.1 MB/min，无新增长点；录音↔空闲多次切换 + 取消/中断/错误态后门控无泄漏。
- **专项2（手机麦）：通过**。局域网直连与公网中转两条链路配对→按住说话→实时字幕→落字全通；刷新重连、桌面端关停提示、token 轮换后"配对已失效"、中转地址切换全部符合预期。
- **专项3（Parakeet 首下+转写异常）：基本通过**，立案 2 个 P3（不支持语言无提示、超长文件先全量解码再报错）。
- **专项4（自由走查·历史页）：通过**，立案 1 个 P3（Undo 10s 无倒计时、超时点击静默失效）。
- 本轮无新增 P0/P1/P2。

## 专项1：PR #288 修复后长时 soak（38 min，分 PID）

采样器：PowerShell 每 15s 记录各进程 WorkingSet/PrivateBytes → `soak194.csv`（152 采样/进程）。renderer PID 与窗口的对应关系用「逐页注入 96MB Float64Array、观察哪个 PID 内存跳变」法实测确定：main=1956、index=7808、panel=1744、toast=6528、recorder=4536、gpu=2240、audio=5100。

节奏：Phase A 免按（Alt+Q hands-free）连续多句 ~6min（落字 ~2800 字符）→ Phase B 纯空闲 ~8min → Phase C 切换压测（正常按住×5、录音中 Esc 取消×3、手机端录音中直接断开×1、F8 无选区错误路径×1）→ Phase D 纯空闲 ~20min。

Private Bytes 线性斜率（MB/min）：

| 进程 | 免按活跃段 | 空闲段B | 空闲段D(20min) |
|---|---|---|---|
| panel | +0.49 | -0.92 | **-0.08** |
| index | +1.15 | 0.00 | -0.00 |
| toast | 0.00 | -0.13 | +0.00 |
| main | +0.92 | -0.01 | -61.6（模型空闲卸载所致，见下） |
| gpu/audio | ~0 | ~0 | ~0 |

- **#288 门控确认有效**：panel 空闲段无任何增长（第 192 轮修复前为 +0.41 MB/min）。活跃段的小幅增长在回到空闲后全部回落，多次录音↔空闲切换（含取消/中断）后无残留增长。
- **两个"异常"均为设计行为，非缺陷**：
  - main 从 ~967MB 掉到 137MB：日志 `21:02:25 sherpa worker stopped (idle)` —— Parakeet 模型空闲自动卸载，内存立刻归还，设计合理。
  - recorder 旧 PID 4536 在最后一次录音 ~30s 后消失、新 PID 4316 出现：源码 `RECORDER_RECYCLE_IDLE_MS = 30_000` 空闲回收重建 recorder 隐藏窗。这实际上部分缓解了上轮遗留 P3-1922（隐藏窗 rAF 空转）——每次空闲 30s 后窗体整个重建，泄漏无法长期累积。P3-1922 维持备注不立案。
- 错误路径顺带验证：F8（改写选区）无选区/未配置润色模型时跳转设置页 AI polish 分区引导配置，无崩溃；手机端录音中直接断开连接，桌面端立即取消录音回到空闲，面板不残留。

证据：`soak194.csv`（VM `C:\Users\Administrator\tts\`）、log `sherpa worker stopped (idle)`、`main/index.ts:100`。

## 专项2：手机麦克风（局域网 + 公网中转）

手机端用独立 Chrome 实例模拟（fake mic 喂 16k WAV，CDP 驱动按住/松开）：

1. **局域网直连**：设置页开启后出示二维码 + `https://172.16.2.2:43117/?t=<token>`；手机页"Connected to your PC"→ 按住说话出实时字幕 → 松手文字落到 Notepad 光标处，全链路 OK。
2. **刷新重连**：手机页刷新后自动重连成功，按钮恢复可用。
3. **断连提示**：桌面端关闭手机麦开关，手机页立即显示"Disconnected, reconnecting…"并禁用按钮；重新开启后 token 已轮换，旧页按设计连拒 8 次后显示"Pairing expired — scan the QR code on your PC again"，实测约 15s 后出现，符合预期。
4. **中转切换**：Connection 切到 Internet relay（默认官方 `speaktype.zalize.com/relay`），出示新二维码 + 配对码；手机开 `…/relay/m/<room>` 配对成功，按住说话→字幕→落字全通；录音中直接杀掉手机页，桌面端干净取消。日志：`remote mic relaying via https://speaktype.zalize.com/relay/m/0209b1674278`。
5. 多机争用（busy）路径本轮未测（单模拟手机）。真实断网（拔网线/飞行模式）不可在本 VM 模拟（不动防火墙），用"服务端关停"等价覆盖了 onclose 重连路径。

**立案 P3-1943**：桌面界面语言为 English 时，局域网配对页正确显示英文，但中转页显示中文（"已连接电脑/按住说话"）。LAN 页文案由桌面端按 `currentLanguage()` 生成，中转页由 Worker 托管、语言约定不一致。复现：桌面 EN + relay 模式扫码即见。建议：房间 URL 带上语言参数或 Worker 按 Accept-Language 出文案。

## 专项3：Parakeet 首下 + 转写异常路径

- **首次下载**：全新环境首开 Home 显著提示缺模型；下载条从 1% 平滑推进，约 660MB（encoder 652MB + decoder 11.8MB + joiner 6.4MB + tokens），文件落盘齐全，完成后 `sherpa worker started (parakeet-tdt-0.6b-v3)`。设置页与转写页状态同步正确。多文件进度合并为单一百分比展示，体验顺畅（未见每文件分列进度，可接受）。
- **转写页横幅**：`settings.localModel`（本机默认即 Parakeet）已就绪时无横幅，直接可拖放；行为合理。
- **正常转写**：9.4s 英文 WAV → 1 段，文本逐字正确，秒级完成，TXT/SRT/复制按钮齐全。
- **坏音频**：随机字节伪 .wav → 友好报错"Could not decode this file…"，上一次结果不被清掉，无崩溃。
- **超长音频**：11000s（>3h 上限）WAV → 明确报错"File exceeds the 3-hour limit — please split it first"。
- **中文音频 under Parakeet**：中文语音被转成无意义拼音串（"Bawgala sua, min piexa uchianki hatafu."），页面无任何"当前模型不支持该语言"提示。

**立案 P3-1941（语言不匹配零提示）**：Parakeet v3 不支持中文（设置页模型描述有写"no Chinese support"），但转写页/听写对中文音频只输出乱码拼音，无告警。真实用户会以为产品坏了。复现：Parakeet 下转写中文 WAV。建议：转写结果置信度过低或检测到模型语言覆盖外时给一条黄条提示（引导切 SenseVoice）。

**立案 P3-1942（超长文件先全量解码再判限）**：`Transcribe.tsx` 先 `decodeAudioData` 完 352MB/3h 文件、拿到 `decoded.duration` 才报"超 3 小时"，报错前渲染进程瞬时多占数百 MB 且用户白等解码。建议：对 WAV 等可读头格式先做时长预检，或用文件大小粗筛提前拒绝。证据：`Transcribe.tsx:98-101` + 实测 352MB 文件报错前有明显解码等待。

## 专项4：自由走查 —— 历史页

- 搜索（text/raw/persona 名）、来源筛选（混流后才显示筛选器）、分组分页均正常。
- 导出：按当前筛选导出 Markdown，BOM + 多行缩进正确，内容与筛选一致（实测导出 2 条 fox 结果核对通过）。
- 删除→Undo：10s 内点击 Undo 恢复原位，验证通过。

**立案 P3-1944（Undo 窗口静默失效）**：Undo 栏固定 10s、无倒计时/渐隐提示，超时后一瞬间消失；首次实测在临界点点击，条目未恢复且无任何反馈（永久丢失一条）。单条删除是"唯一无后悔药"操作（代码注释自认），10s 静默窗口偏激进。建议：加倒计时进度条或延长到 15-20s，并在窗口关闭前渐隐。

## 立案汇总

| 编号 | 级别 | 摘要 | 复现 | 证据 |
|---|---|---|---|---|
| P3-1941 | P3 | Parakeet 对不支持语言（中文）音频输出乱码拼音，无任何提示 | Parakeet 下转写/听写中文 WAV | 转写页截图、输出文本 |
| P3-1942 | P3 | >3h 文件先全量 decode 再报限，白等且内存瞬时高企 | 转写 352MB/11000s WAV | `Transcribe.tsx:98-101` + 实测 |
| P3-1943 | P3 | 中转手机页语言与桌面语言不一致（桌面 EN、中转页中文） | EN 界面 + relay 模式扫码 | 手机页文本抓取 |
| P3-1944 | P3 | 历史删除 Undo 10s 静默失效，超时点击无反馈、条目永久丢失 | 删除后 ~10s 点 Undo | 实测复现一次 |
| P3-1922 | 遗留 | 隐藏窗恒 visible/rAF 空转 —— recorder 已有 30s 回收机制部分缓解，维持备注 | - | `main/index.ts:100` |

## 已验证 / 未验证边界

- 已验证：#288 门控（源码+38min 分 PID soak）；模型空闲卸载与 recorder 回收；Parakeet 首下/正常转写/坏文件/超长文件/中文乱转；RightCtrl 按住与 Alt+Q 免按听写；手机麦 LAN+relay 全链路、刷新重连、token 失效提示、录音中断开；历史页搜索/筛选/导出/删除/撤销。
- 未验证：真实断网（不动防火墙，用服务端关停等价覆盖）；多手机争用 busy 路径；音频输出静音相关（VM 无声卡）；五语 UI 全量；Parakeet 分文件进度的每文件粒度展示（下载太快，只观测到合并进度）。

## 下一轮候选专项 Top3

1. **中转链路故障注入**：relay 连续建联失败 ≥3 次的设置页可见错误（`RELAY_FAIL_VISIBLE`）、中转掉线自动重连节奏、多手机同房间争用 busy 提示。
2. **配对页/中转页多语言一致性专项**（衔接 P3-1943）：五语桌面语言 × LAN/relay 页文案矩阵抽查。
3. **长音频转写性能曲线**：0.5h/1h/3h 文件的解码等待、内存峰值、进度线性度与取消响应，顺带验证 P3-1942 的预检方案价值。
