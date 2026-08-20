# 第 219 轮严格体验官报告（#310 回归 + 双实例行为 + 系统音频边界）

- 日期：2026-08-20
- 被测版本：main `5eff1fa`（含 PR #310 热词族链式漂移修复）
- 打包方式：`npm run build && npx electron-builder --dir` → `desktop/release/win-unpacked/SpeakType.exe`
- 环境：Windows Server 2022，无真实麦克风；本地 Parakeet tdt-0.6b-v3；CDP 9333 观测 renderer
- 测试手法：fake-mic WAV（RightCtrl 核心链路）+ **mock ASR 注入**（本地 8899 端口 OpenAI 兼容 `/audio/transcriptions` mock，注入任意转写文本走产品完整热词/润色/落字链路）
- 证据级别标注：【实测确认】【推测】【未测试】

## 1. 核心回归：RightCtrl + PR #310

- RightCtrl（local Parakeet）落字正常：`The meeting is scheduled for 3:30 pm tomorrow afternoon.`（键抬起→history 809ms）【实测确认】。
- #310 端到端回归（mock ASR 注入，词典载入 HotTerm000–148 + MeetIng + SpeakType + 张京，共 152 条）：

| 注入转写 | 落字结果 | 判定 |
|---|---|---|
| `hot term 12 will join the meet ing` | `HotTerm012 will join the MeetIng.` | 不再漂移到 099，P3-2171 修复生效【实测确认】 |
| `please open speaktyp now` | `please open SpeakType now` | 模糊纠错（1 字符缺失）仍生效【实测确认】 |
| `请把报告发给张静`（中文同音） | `请把报告发给张京` | 中文同音纠错无回归【实测确认】 |

P3-2171 关闭。

## 2. 专项 a：双实例/多实例行为

实现：`app.requestSingleInstanceLock()`，拿不到锁即 `app.quit()`；`second-instance` 事件 → `showMain()`（`desktop/src/main/index.ts`）。

- 主实例运行中重复启动同一 exe：第二实例立即退出，进程数不变（8→8）、无新窗口/无双托盘【实测确认】。
- 主窗口隐藏（收进托盘）后启动第二实例：`document.visibilityState` hidden→visible，主窗口被唤醒到前台【实测确认】。
- portable 场景：将 win-unpacked 整目录复制到另一路径启动（模拟绿色版共存），同样被单实例锁拦截并唤醒原实例，进程列表仅原路径 exe——不同安装路径不会双开、不会双写 `%APPDATA%\SpeakType` 配置【实测确认】。
- 真实 NSIS 安装版与 portable 混装（不同 userData 策略）【未测试】：本机只有 --dir 产物，未构建安装包。
- 同时双击两次的启动竞态窗口（锁获取前的毫秒级并发）【未测试】。

## 3. 专项 b：系统级音频边界

本机为无麦克风裸机（`navigator.mediaDevices.enumerateDevices()` 返回空数组），天然覆盖"无输入设备"场景：

- 无麦克风时按 RightCtrl：overlay 显示 `Microphone unavailable — No microphone found`，文案可理解、无技术噪音；不产生 history 脏条目、不落半截文本【实测确认】（截图见 PR 评论）。
- 连续多次按键触发同一错误：无崩溃、无重复弹层堆叠、进程稳定【实测确认】。
- 恢复路径：带 fake-mic 重启后第一句即正常落字（735ms），无残留死态【实测确认】。
- 录音中拔出设备、默认输入设备热切换：本机无物理/虚拟音频设备可插拔，无法模拟【未测试】。
- 有多个输入设备时的设备选择/跟随系统默认【未测试】。

## 4. 立案汇总

本轮无新立案（P0-P3 均无）。

观察项（不立案）：
- 无麦错误提示为顶层 overlay toast，15s linger 行为与第 214 轮一致。
- portable 复制版与原版共享同一 userData，是单实例锁的预期语义；若未来发行真 portable 版本需注意 userData 隔离策略。

## 5. 下轮 Top3 建议

1. 构建 NSIS 安装包，补安装版⇄portable 共存 + 升级覆盖安装（运行中升级）场景。
2. 真机（真实麦克风/手机 remoteMic）端到端——仍是最大证据缺口；届时补设备拔插/默认设备切换。
3. mock ASR 注入手法已打通任意文本链路：可做润色/人设/ITN 的批量文本矩阵回归（中英混排、长文本、边界符号）。

## 6. 清场

- 词典 152 条测试热词清空、asrProvider/asrBaseUrl/asrApiKey 恢复默认、测试 history 清空、mock ASR 进程停止、portable 复制目录删除、本轮临时脚本删除、SpeakType 进程退出。
