# Round 212 严格体验官报告（user-experience-officer）

- 日期：2026-08-20
- 被测版本：main `56f12c9`（含 PR #303），`npm run build` + `npx electron-builder --dir` 打包 `desktop\release\win-unpacked\SpeakType.exe` 实测（v0.15.1）
- 方法：fake-mic WAV（`--use-file-for-fake-audio-capture`）+ CDP(9333) 运行时取证 + 本地 mock OpenAI 兼容服务（Node http，可切 ok/401/hang 模式）+ 死端口。无真实麦克风。
- 规则遵守：未碰 GitHub Actions，未合并任何 PR，无产品代码改动。

## 一、回归 PR #303 + RightCtrl 核心

| 项 | 结果 | 证据级别 |
|---|---|---|
| ja「設定をリセット」静止态单行 | 通过，`設定をリセット` 与 `全データを消去` 均单行 | 【实测确认】 |
| ja 确认态单行 | 通过，点击后 `設定をリセットしますか?` 仍单行 | 【实测确认】 |
| RightCtrl 核心落字 | 通过，合成 RightCtrl 按住 7s → 记事本落字 `The meeting is scheduled for 330pm tomorrow afternoon.`（history at 07:00:21Z） | 【实测确认】 |

P3-2101 关闭。

## 二、专项 a：文件转写（Transcribe）大文件/长音频链路

测试材料（合成）：`long10min.wav`（8.4s 语音重复 72 次，约 10 分钟 / 19.2MB）、`fake4h.wav`（WAV 头声称 4 小时、实际约 1MB）、`corrupt.mp3`（200KB 随机字节）。

| 场景 | 结果 | 证据级别 |
|---|---|---|
| 超长预检（>3h 头） | 选择 `fake4h.wav` 立即提示 `File exceeds the 3-hour limit — please split it first.`，未做完整解码 | 【实测确认】 |
| 损坏文件 | `corrupt.mp3` 提示 `Could not decode this file: make sure it is a common audio format (mp3 / wav / m4a / ogg / flac).` | 【实测确认】 |
| 进度反馈 | 10 分钟文件转写全程显示百分比（如 `Transcribing... 8%`）且已完成分段实时可见 | 【实测确认】 |
| 完成与历史 | 完成 36 段，history 新增 `source:"file"` 条目（persona=long10min.wav，durMs=601920，len=3995） | 【实测确认】 |
| 导出 TXT/SRT | `long10min.txt`(3999B) / `long10min.srt`(5213B) 均生成且内容/时间轴正确 | 【实测确认】 |
| 中途取消 | 约 8% 时取消，立即回到空闲，已完成的 26 段保留可导出 | 【实测确认】 |
| 转写中切页/最小化 | 转写在主进程执行，窗口最小化/隐藏期间继续，约 35s 后完成（pct=100, n=36） | 【实测确认】 |
| 重启持久化 | 重启应用后上次完成结果（36 段 long10min.wav）自动恢复展示 | 【实测确认】 |
| 转写中强杀进程 | 未测（避免破坏数据） | 【未测试】 |
| 真实多小时人声音频 | 未测（合成重复语音代替） | 【未测试】 |

链路整体健壮，无立案。

## 三、专项 b：云端 provider 异常降级（OpenAI 兼容通道）

设置 `asrProvider:"openai"` 指向本地 mock（127.0.0.1:8412）/ 死端口（8999）。

| 场景 | 结果 | 证据级别 |
|---|---|---|
| 正常基线 | mock 200 → 落字 `mock cloud transcription result.`，history provider=openai | 【实测确认】 |
| HTTP 401（口述） | history 失败条目 `err = ASR HTTP 401 {"error":{"message":"Incorrect API key provided: ..."}}`（原始 JSON 直出，见 P3-2121），失败音频已保存 | 【实测确认】 |
| HTTP 401（设置页测试连接） | `testAsr` 返回 `HTTP 401 Incorrect API key provided: ...`（已解析 JSON message，文案可行动） | 【实测确认】 |
| 断网/死端口 | 立即失败，文案 `Cannot reach the speech recognition service — check your network or switch provider in Settings`，可行动性好；失败音频保存 | 【实测确认】 |
| 失败重试 | 历史页 retry（`history:retry`）用保存的音频重发，服务恢复后原条目就地升级为成功文本 | 【实测确认】 |
| 服务端挂起（超时） | 无客户端超时：请求挂起期间应用「处理中」卡住约 5 分钟（undici 默认 headersTimeout≈300s 才报错），期间 Esc 无法取消、再按 RightCtrl 新录音被静默丢弃；约 300s 后以网络错误失败（07:15:34Z 新失败条目），之后功能恢复正常（07:16:11Z 成功落字）。见 P2-2122 | 【实测确认】 |
| doubao / chatgpt 真实登录态 | 无账号 | 【未测试】 |

## 四、立案

| 编号 | 级别 | 描述 | 证据级别 |
|---|---|---|---|
| P2-2122 | P2 | 云端 ASR 请求无客户端超时：服务端挂起时口述「处理中」卡死约 5 分钟（依赖 undici 默认 300s headersTimeout），期间 Esc 不能取消处理阶段、新的 RightCtrl 录音被静默丢弃且无任何提示。建议：finish() 加 AbortSignal.timeout（如 30s）+ 处理阶段允许 Esc 取消（走失败音频保存+重试路径） | 【实测确认】 |
| P3-2121 | P3 | 口述失败错误文案不一致：`startOpenAiAsrSession.finish()` 抛 `ASR HTTP 401 {raw json body}` 原样进历史/提示，而设置页 `testAsr` 已用 `httpErrorDetail()` 解析出可读 message。建议 finish() 复用 httpErrorDetail | 【实测确认】 |

## 五、下轮 Top3 建议

1. 修 P2-2122（云端请求超时 + 处理中可取消），并回归失败重试链路。
2. 修 P3-2121（错误文案统一走 httpErrorDetail）。
3. 专项：doubao/chatgpt 通道（若可提供测试账号）或 Recorder/overlay 视觉细节走查（多显示器/DPI）。

## 六、清场

- history 中本轮 30 条测试记录已删除（余 0 条为本轮前状态，Round 210 后历史本为空）。
- 设置恢复：asrProvider=local、asrBaseUrl/asrApiKey 清空、localModel=tiny-q5_1、uiLanguage=system、vadAutoStop=true。
- 删除：transcribe-last.json、failed-audio\*.wav、合成测试音频/损坏文件/mock 脚本/导出文件；SpeakType 与 mock 进程已退出。
