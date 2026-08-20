# Round 214 严格体验官报告（user-experience-officer）

- 日期：2026-08-20
- 被测版本：main `01a25b3`（含 PR #305），`npm run build` + `npx electron-builder --dir` 打包 `desktop\release\win-unpacked\SpeakType.exe` 实测（v0.15.1）
- 方法：fake-mic WAV（`--use-file-for-fake-audio-capture`）+ CDP(9333) 运行时取证 + 本地 mock OpenAI 兼容服务（ok/401/hang/slow 四模式）+ Win32 `WindowFromPoint` 命中测试 + StuckRects3 改任务栏位置 + `--force-device-scale-factor` 模拟 DPI。屏幕 1280×720，无真实麦克风。
- 规则遵守：未碰 GitHub Actions，未合并任何 PR，无产品代码改动。

## 一、回归 PR #305 + RightCtrl 核心

| 项 | 结果 | 证据级别 |
|---|---|---|
| 挂起 60s 超时 | mock `hang` 模式下，finish 阶段约 60s 后失败，文案为新键 `error.asrTimeout`（"The speech recognition service took too long to respond — try again or switch provider in Settings"），不再卡 5 分钟 | 【实测确认】 |
| 处理中 Esc 取消 | mock `hang`：录音松键进入「处理中」后 2.5s 按 Esc → 立即回 idle、无落字、无失败条目残留卡死；mock 日志确认请求已发出后被中断 | 【实测确认】 |
| 延迟结果不落字 | mock `slow`（8s 后才返回 200）：处理中 2s 时 Esc 取消，等满 12s 后光标处未出现 `DELAYED RESULT SHOULD NOT APPEAR.`，记事本 Ln/Col 不变 | 【实测确认】 |
| 401 已解析文案 | 悬浮条错误态显示 `ASR HTTP 401 Incorrect API key provided: sk-bad. ... · Recording kept — press the hotkey again to retry`（原始 JSON 已解析，附重试指引） | 【实测确认】 |
| 失败重试链路 | 401 失败后切 mock 为 ok，错误态内再按 RightCtrl 短按 → 用保存音频直接重试，成功落字 `mock cloud transcription result.`；历史页 retry 同样成功 | 【实测确认】 |
| RightCtrl 核心落字 | 本地 Parakeet 端到端落字 `The meeting is scheduled for 3:30 pm tomorrow afternoon.`（含 ITN 3:30 pm，#299 仍无回归） | 【实测确认】 |

P2-2122、P3-2121 关闭。

## 二、专项：Recorder/悬浮条/字幕 overlay 视觉走查

| 场景 | 结果 | 证据级别 |
|---|---|---|
| 常规位置 | 悬浮条（460×150 面板）居中停靠在 workArea 底部上方 12px，波形胶囊 + 取消按钮完整可见 | 【实测确认】 |
| 实时字幕 | 本地 sherpa（Parakeet）流式 partial 字幕气泡正常出现在波形胶囊上方，深底白字，在白色记事本背景上可读性好 | 【实测确认】 |
| 超长 partial 截断 | `captionLines:1` 下溢出内容自动滚动到最新，顶部经 maskImage 渐隐，无生硬裁切、无布局破坏 | 【实测确认】 |
| 任务栏移到顶部 | StuckRects3 edge=1 + 重启 explorer 后，悬浮条正确跟随新 workArea 停靠屏幕底缘，不与任务栏重叠 | 【实测确认】 |
| 遮挡 | 记事本最大化时悬浮条/字幕仍置顶可见（alwaysOnTop screen-saver 级） | 【实测确认】 |
| 穿透 | `WindowFromPoint` 命中测试：面板透明区（420,530）命中下层 Notepad，胶囊（640,645）与字幕（640,600）命中 `SpeakType Panel`——透明像素可穿透点击，无 460×150 全幅挡鼠标死区 | 【实测确认】 |
| DPI 150% | `--force-device-scale-factor=1.5` 模拟：主窗口与悬浮条/字幕等比放大、无裁切错位，字幕仍可读 | 【实测确认】（模拟） |
| DPI 125% | `--force-device-scale-factor=1.25` 同上无异常 | 【实测确认】（模拟） |
| OS 级 DPI 缩放 | 改系统 DPI 需注销重登，远程会话无法执行 | 【未测试】 |
| 多显示器 | 单显示器环境，无法接入第二屏/虚拟显示器 | 【未测试】 |
| 深色背景可读性 | 深色 SpeakType 主窗口背景上字幕气泡（#292929/95 + white/10 边框）与背景色接近、边界较弱，但白色文字本身仍清晰可读——观察项不立案 | 【实测确认】 |
| 任务栏左/右侧 | 仅测了顶部（机制同为 workArea 驱动） | 【未测试】 |

无立案；「深色背景下气泡边界弱」记为观察项，若后续用户反馈再考虑加深边框或阴影。

## 三、自选专项：错误态 15s linger 与新录音抢占

| 场景 | 结果 | 证据级别 |
|---|---|---|
| 可重试错误 linger | 401 失败后错误胶囊停留约 15s（代码 `lastFailed ? 15000 : 5000`），到时自动清除回 idle | 【实测确认】 |
| 错误期间按热键 | 错误态内短按 RightCtrl = 直接用保存音频重试（非开新录音），恢复后就地成功落字，交互闭环顺畅 | 【实测确认】 |
| 重试落字粘连 | 重试文本插入光标处紧跟前次句号无空格（`afternoon.mock cloud...`）——超出 15s glue 窗口属预期行为，光标位置本就由用户掌控，不立案 | 【实测确认】 |

## 四、立案

本轮无新立案（P0-P3 均无）。

## 五、下轮 Top3 建议

1. doubao / chatgpt 真实登录态链路（若能提供测试账号），或补 OS 级 DPI/多显示器实机验证。
2. 手机当麦克风（remoteMic，LAN HTTPS+WS）链路端到端：扫码、按住说话、断连恢复。
3. 增强 VAD / 增强标点（enhancedVad/enhancedPunct）开启后的实效与性能对比走查。

## 清场

mock 服务与临时脚本（mock_asr.mjs/asr_mode.txt/asr_mock.log/taskbar.ps1/hittest.ps1）已删除，任务栏恢复底部，asrProvider/asrBaseUrl/asrApiKey/asrModel/captionLines 已恢复，Round 214 全部 12 条测试历史与 failed-audio 已清理，SpeakType/记事本/node 进程已退出。
