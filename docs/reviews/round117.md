# SpeakType 第 117 轮打包运行时审查报告

- 基线：`main@a92b6eb`（含 #196/#197，与 115/116 轮同提交，复用其 pack:dir 产物 `release/win-unpacked/SpeakType.exe`）
- 审查日期：2026-08-16
- 环境：Windows 10，VB-CABLE 虚拟声卡，防火墙三配置文件 OFF（全程未改）
- 证据分级：【实测】打包运行时直接证据；【源码】源码检查；【推测】推理；【未验证】未覆盖

## 结论总览

**P0=0，P1=0，P2=0，P3=0——零立案，观察 ×2 + 设计论证结论 ×1（不改代码）。**

---

## 0. 观察①设计论证：「只认 RightCtrl 扫描码的松键」是否安全（116 轮观察，组合键 Ctrl 干扰 RightCtrl 按住）

**结论：当前实现已经就是「只认 RightCtrl keycode 的松键」，设计安全，不建议改代码。**

1. 【源码】`desktop/src/main/hotkey.ts`：`holdKeycode = UiohookKey.CtrlRight`；`onKeyUp` 中仅当 `ev.keycode === this.holdKeycode` 才调 `releaseHold()`——严格匹配，不存在"任意 Ctrl 松键都结束录音"的代码路径。
2. 【实测】uiohook-napi probe：`CtrlRight=3613`、左 `Ctrl=29`，左右 Ctrl 是两个独立 keycode（非共享 VK_CONTROL），键盘钩子层天然可区分。
3. 【实测】RightCtrl 按住录音期间，合成按下/松开左 Ctrl（scan 0x1D 非扩展）：录音**不被打断**，前后两段语音合并落为同一条 history（"Left control test part1, part2 after left control."）——左 Ctrl keyup 不触发 releaseHold 得到运行时证实。
4. 【推测】因此 116 轮 Win+Ctrl+方向键切桌面导致提前结束，根因不是左右 Ctrl 判定缺陷，而是虚拟桌面切换时系统/钩子层面产生了 RightCtrl 的真实或合成 keyup（桌面切换会重置按键状态）。这是 OS 级行为，应用层无法可靠区分。
5. **卡键/丢 keyup 风险分析**：若进一步收紧（如忽略疑似合成的 keyup），一旦真实 keyup 被误判吞掉，录音将无法结束（卡键）——风险大于收益。当前实现即使丢一次 keyup 也可自恢复：`pressHold` 有 `holdPressed` 守卫（key repeat 不重入），用户再按一次 RightCtrl 并松开即可正常结束，无死锁。
6. **建议：维持现状，不改代码。** 116 观察①保持"热键语义边缘"定性。

---

## 1. 30 分钟混合稳定性 soak【实测】

脚本 `soak117.ps1`：每轮 = RightCtrl hold 中文语音 ×1 + Alt+Q 免按两句 ×1（计 2 条）+ F8 mock 改写 ×1 + 定期 Transcribe 穿插；mock OpenAI 端点 127.0.0.1:18099 逐请求落盘。

| 块 | 时长 | 轮数 | 语音事件 | 结束内存 | 进程存活 |
|---|---|---|---|---|---|
| 1 | ~9 min | 13 | 39+13 F8 | 614.9 MB | ✓ |
| 2 | ~10 min | 15 | 45+15 F8 | 606.8 MB | ✓ |
| 3 | ~11 min | 16 | 48+16 F8 | 600.5 MB | ✓ |

- **总计 ~30 分钟、44 轮、176 次听写/改写事件 + 2 次 Transcribe 穿插（zh1.mp3 与 phone.wav 各识别正确）。**
- **句丢失 = 0**：history 322 → 500，Δ=178 = 176 事件 + 2 转录，逐块核对精确吻合（435→436 转录 +1 →500）。
- **内存无增长**：三块结束值 614.9/606.8/600.5 MB，稳定在 ~600-620 MB 区间，无泄漏趋势。
- **F8 mock 44/44 请求全部到达并替换**（mock.log 最后 #44）。
- **状态机无卡死**：soak 结束后立即听写/Alt+Q 均正常响应；main.log 无 error/uncaught。

## 2. 设置页全量持久化矩阵【实测】

改动 10 项（覆盖 General/Speech/Dictionary 三处，含近 20 轮新增项），确认：改动即写盘（speaktype.json 立即含新值）→ **强杀进程**（比正常退出更严苛）→ 重启后 UI 逐项回显正确：

| 设置 | 改动 | 写盘 | 重启回显 |
|---|---|---|---|
| Hold threshold | 120→300ms | ✓ | ✓ |
| Double-tap hands-free | on→off | ✓ | ✓ |
| Silence duration | 2s→5s | ✓ | ✓ |
| Mute other apps while recording | off→on | ✓ | ✓ |
| Keep failed recordings | on→off | ✓ | ✓ |
| Caption height（字幕行数） | 3→6 lines | ✓ | ✓ |
| Theme | light→dark（立即生效） | ✓ | ✓ |
| Force Simplified Chinese | on→off | ✓ | ✓ |
| Format spoken numbers (ITN) | on→off | ✓ | ✓ |
| Learn from corrections（自动学词） | on→off | ✓ | ✓ |

- **转录持久化**：Transcribe 结果（phone.wav 1 段）重启后完整恢复（transcribe-last.json）✓。
- 说明：「字幕渐隐」「学词 Undo 窗口」并非独立设置项——字幕相关设置即 Caption height（渐隐为固定行为），学词相关设置即 Learn from corrections 开关（Undo 窗口时长为固定常量），如实记录。
- 全部项测毕还原（整体回拷 round117-config.bak）。

## 3. measure.ps1 无声设备守卫（#196 回归）【实测】

- 禁用唯一音频设备（`Disable-PnpDevice VB-Audio Virtual Cable`）后，逐字节复制 measure.ps1 的 `PlayAudio` 函数执行：**12.3 秒抛出 `PlayAudio: no audio device or media failed to load`，不挂死**（0.5s 预等待 + 10s 轮询上限 + PresentationCore 加载开销，符合守卫设计；比字面"10s"多 ~2s 属加载开销，不立案）。
- 重新启用设备后同函数正常播放退出（5.1s，NOERROR）——守卫无误伤。

## 4. 核心回归【实测】

- RightCtrl 中文（sensevoice-small）：「今天下午3点开会，预算是5200元」——含 ITN（3点/5200）准确落字 ✓。
- Alt+Q 免按：「The phone microphone channel is working correctly today.」准确落字并自动退出 ✓。

## 观察（不立案）

1. **观察①**：原配置 localModel=parakeet（文档明示 no Chinese support）下听写中文，识别为空时**静默无落字、无 history 条目、无提示**——与文档一致且空结果不落字合理，但用户若忘了当前模型可能困惑；候选：空结果时给一次轻提示。【实测】
2. **观察②**：soak 中 F8 按住口述指令若无语音输入（maxPeak=0 finalize），改写仍正常走 mock 完成，无异常。【实测】仅记录。

## 清场核对

进程 0、43117/18099 无监听、无 .part、配置/历史（321 条）整体还原、词典 0 条、mock/测试脚本产物留存于 review 工作区不入库、防火墙三 OFF、repo 回 main。
