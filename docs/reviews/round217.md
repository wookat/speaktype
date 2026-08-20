# 第 217 轮严格体验官报告（词典 300 条满载 + punct worker 空闲释放）

- 日期：2026-08-20
- 被测版本：main `e74b76d`（含 PR #308 ITN 点分时刻修复）
- 打包方式：`npm run build && npx electron-builder --dir` → `desktop/release/win-unpacked/SpeakType.exe`
- 环境：Windows Server 2022，无真实麦克风（fake-mic WAV：`time330.wav`，内容 "The meeting is scheduled for three thirty pm tomorrow afternoon"），Parakeet tdt-0.6b-v3 本地模型，CDP 9333 观测 renderer
- 证据级别标注：【实测确认】【推测】【未测试】

## 1. 核心回归：RightCtrl 落字 + #308 端到端

- RightCtrl 按住 7s / 20s，均正常落字进 Notepad 与 history【实测确认】。
- #308 端到端：Parakeet 输出经 ITN 归一为 `The meeting is scheduled for 3:30 pm tomorrow afternoon.`，点分变体规则在打包产物中生效【实测确认】（日志 `dictation finalize: durationMs=6882 maxPeak=32623 voicedMs=2920`）。
- 20s 长按时 fake WAV 循环导致同句重复拼接，属测试手法产物，非产品缺陷【实测确认】。

## 2. 专项 a：词典/热词 300 条满载

### 2.1 导入 / 上限 / 边界

- 注入 302 行文本（150 中文 + 150 ASCII + 1 行纯符号 `===` + 1 重复行）保存：最终词典恰好 300/300，横幅提示 `1 line(s) were not added (over the 300-hotword limit, longer than 20 characters, or symbols only).`，纯符号行被正确拒收、重复被去重【实测确认】。

### 2.2 UI 列表 / 搜索 / 导出

- 300 chip 全量渲染无卡顿，页面滚动流畅【实测确认】。
- 搜索：输入过滤耗时 4ms（命中 10 条），清空恢复 28ms【实测确认】。
- 导出：弹 Windows 另存为对话框，保存后文件 `speaktype-dictionary-2026-08-20.txt`：UTF-8 BOM（EF BB BF）、恰好 300 行、内容与词典一致（含 `MeetIng`）【实测确认】。往返再导入未重复验证【未测试】。

### 2.3 落字延迟增量（RightCtrl 键抬起 → history 落库，各 4 次）

| 场景 | 延迟样本 (ms) |
|---|---|
| 词典 0 条 | 576 / 660 / 664 / 670 |
| 词典 300 条 | 534 / 582 / 576 / 551 |

- 300 条满载未观察到可感知延迟增量（英文句 correctHotwords 源码级基准 ~2.7ms/句）【实测确认】。小样本，非严格基准【推测：增量在噪声内】。
- 中文句（63 字）满载纠错基准 ~34.8ms/句（源码级 esbuild 打包同一 `hotwords.ts` 实测），仍远低于可感知阈值【实测确认（源码级）】。

### 2.4 同音/近形误伤抽查

- 正向：`MeetIng` 热词使 `meeting` → `MeetIng` 正确落字【实测确认（端到端）】。
- 中文同音：`张京` 热词下 `张静要开会` → `张京要开会` 正确纠错；但若句中已含 `张京`，同句其他 `张静` 不再纠正（`out.includes(trimmed)` 提前跳过，保守设计，记录为观察）【实测确认（源码级）】。
- 5 句日常中文（不含热词）扫描零误伤【实测确认（源码级）】。
- **新发现 P3-2171：ASCII 模糊纠错在近邻热词族中链式漂移**。词典含 `HotTerm000`–`HotTerm148` 时，口述 `hot term 12` 最终被改成 `HotTerm099`（而非 012/129 任一合理候选）：`correctAsciiHotword` 允许 1 字符增删/替换（长度≥6），逐词迭代时上一次纠错结果又被后续编辑距离 1 的热词再次改写，逐步漂移到任意词条。单词条时 `hot term 12`→`HotTerm012` 正常；全族时漂移【实测确认（源码级，产物同一代码路径；音频端到端复现受 fake WAV 限制未做）】。影响面：需词典中存在多个互为编辑距离 1 的 ≥6 字符热词（版本号/编号族场景），故定 P3。建议：单次纠错后对已替换区间加保护，或在候选多于 1 个时放弃模糊纠错。

## 3. 专项 b：punct worker 10 分钟空闲释放与再唤醒

前置：enhancedPunct 重新下载（progress 100，`punct model downloaded`）。

| 阶段 | 证据 |
|---|---|
| worker 启动前内存 | 520 MB（SpeakType 全进程 WorkingSet） |
| 冷启动首句 | 1582 ms（`punct worker started` 09:06:50） |
| 热态句 | 994 / 963 ms |
| 热态内存 | 1465 MB |
| 空闲释放 | 最后一句后 ~10 分钟，日志 `punct worker stopped (idle)`（09:17:14）【实测确认】 |
| 释放后内存 | 251 MB（回收 >1.2 GB WorkingSet，含系统整体 trim） |
| 再唤醒首句 | 1772 ms（`punct worker started` 09:18:55），第 2 句回落 970 ms |
| 再唤醒后内存 | 1432 MB |

- 结论：10 分钟空闲释放按设计生效，无重复 worker、无崩溃、无脏状态；再唤醒首句额外 ~0.8s（1772 vs ~980 热态），第二句即恢复热态【实测确认】。对比无 punct 基线 ~560ms，punct 热态本身增加 ~400ms/句（记录为观察，不立案）。
- 内存回收量以 WorkingSet 观测，含 OS 换页影响【推测：实际堆回收约数百 MB】。

## 4. 立案汇总

| 编号 | 级别 | 描述 | 证据 |
|---|---|---|---|
| P3-2171 | P3 | ASCII 模糊热词纠错在编辑距离 1 的热词族中链式漂移（`hot term 12`→`HotTerm099`） | 源码级实测确认（§2.4） |

无 P0/P1/P2。观察项（不立案）：同句已含热词时其余同音错误不再纠正；punct 热态每句 +~400ms；punct 再唤醒首句 +~0.8s。

## 5. 下轮 Top3 建议

1. 修复 P3-2171（模糊纠错区间保护/多候选放弃），并补编号热词族回归用例。
2. 真机（真实麦克风/手机 remoteMic）端到端验证——历轮均为 fake-mic/模拟手机，仍是最大证据缺口。
3. 词典导出→手改→再导入往返 + 中文热词端到端（需中文 WAV）补测。

## 6. 清场

- 词典 300 条清空、enhancedPunct 关闭并删除 punct-ct 模型、测试 history 清空、导出文件与本轮临时脚本删除、SpeakType 进程退出、设置恢复默认。
