# 第 215 轮严格体验官报告

- 被测版本：main `65d7768`（docs: round 214 report），本机 `npm run build && npx electron-builder --dir` 打包 `desktop\release\win-unpacked` 实测
- 环境：Windows Server 2022，无真实麦克风（fake-mic WAV：time330.wav），手机端用本机 Edge/Chrome 模拟，真手机【未测试】
- 证据级别标注：【实测确认】/【推测】/【未测试】

## 1. 回归：RightCtrl 核心落字

- RightCtrl 按住 7s / 20s，Parakeet 本地模型，文本正确落到 Notepad 光标处【实测确认】。
- 观察：7s 单遍播放时 Parakeet 直接解码出 "3.30 pm"（点分变体），ITN 不归一（ITN 规则只覆盖 "3 30 pm"→"3:30 pm"）；20s 多循环时解码 "3 30 pm"→ITN 正常出 "3:30 pm"。见立案 P3-2151。

## 2. 专项 a：手机麦克风（remoteMic）LAN 直连链路

打包版实开 `remoteMicEnabled + remoteMicMode:'lan'`，自签 HTTPS 服务起于 `https://172.16.9.2:43117/?t=<token>`。

| 场景 | 结果 |
|---|---|
| 证书提示 | 无 ignore 标志的 Edge 首开显示 `NET::ERR_CERT_AUTHORITY_INVALID` 拦截页，Advanced→Continue 后配对页正常加载并连上 WS（"Connected to your PC"）【实测确认】 |
| 配对/按住说话 | fake-mic 手机页 mousedown 按住 7s → 桌面端转写并落字 Notepad，手机页同步显示 partial 字幕【实测确认】 |
| 断线重连 | 手机页 `ws.close()` → 1.5s 内自动重连回 "Connected"，按钮恢复可用【实测确认】 |
| 录音中断线 | 按住说话中途断 WS → 桌面端正确 cancel，不落字、无残留会话（history 计数不变）【实测确认】 |
| busy 互斥 | 桌面端 RightCtrl 录音期间手机 start → 手机页显示 "Your PC is recording, please wait" 并自动松手，结束后恢复 Connected【实测确认】 |
| 无效 token | `?t=WRONGTOKEN` 返回 403 "Link expired" 引导页【实测确认】 |
| 中途切中转 | LAN 手机在连情况下切 `remoteMicMode:'relay'`：~0.3s 内 LAN 服务关闭（closeAllConnections 无卡死）、中转连上官方 relay（speaktype.zalize.com）并生成固定配对码；旧 LAN 页重连 8 次后正确提示 "Pairing expired — scan the QR code again"【实测确认】 |
| 中转端到端 | 手机页连官方 relay `/relay/m/<room>`，按住说话 → 经公网中转正常转写落字【实测确认】 |
| 切回 LAN | relay 手机在连情况下切回 lan：LAN 服务重启、token 轮换，relay 手机页显示 "Connected to relay, waiting for your PC…"【实测确认】 |
| 真手机（iOS/Android 浏览器、锁屏/切后台） | 【未测试】无真机 |

无新立案：配对、重连、busy、模式互切全链路行为符合设计且提示可行动。

## 3. 专项 b：enhancedVad + enhancedPunct 组合场景

两模型初始均未下载（vad ~2.3MB，punct ct-transformer ~281MB），全部按需下载成功。

| 场景 | 结果 |
|---|---|
| 仅 VAD | 下载后听写 finalize `voicedMs=3520`（=110×32ms Silero 窗口，非峰值路径），落字正常，无 "silero vad load failed"【实测确认】 |
| 仅标点 / 两开 | punct worker 单实例启动（log 仅 1 条 "punct worker started"），听写正常出 "3:30 pm"【实测确认】 |
| 下载中切换 | punct 下载进行中（13%）连续 6 次开关 enhancedPunct/enhancedVad + 触发一次听写：无崩溃，下载不中断并完成，听写正常落字【实测确认】 |
| 免按模式组合切换 | Alt+Q 免按 ~54s 内依次 两开→关VAD→关标点→两开，6 段全部正确落字（"3:30 pm"），会话不中断【实测确认】 |
| 双 ORT 回归（第 7 轮 P0 旧案） | 全程仅加载 1 份 `sherpa-onnx-win-x64\onnxruntime.dll`（进程模块枚举），`userData\vad` 无旧版独立 ORT 残留（cleanupLegacyVad 生效）【实测确认】 |
| 内存 | 基线 1023MB → punct worker 启动后 ~1392MB（+~370MB，符合注释预期）→ 免按组合切换后 1446MB，平稳无持续增长【实测确认】；worker 10 分钟空闲自动释放【未测试】（时间盒外） |
| 崩溃/错误 | 全程 main.log 零 warn/error，进程数稳定 8【实测确认】 |

无新立案（除下述 P3-2151 与本专项无关）。

## 4. 立案

- **P3-2151**【实测确认】：Parakeet 短保持（单遍 ~7s）会直接解码 "3.30 pm" 点分变体，ITN（itn.ts 时刻合成）只覆盖 "3 30 pm" 空格形，输出 "3.30 pm" 与常规 "3:30 pm" 不一致。建议 ITN 增加 `\d.\d{2} (am|pm)` → `:` 归一规则（一行可修）。影响小、非回归（#299 空格形路径仍正常）。

## 5. 下轮 Top3 建议

1. P3-2151 小修（ITN 点分时刻归一）+ 打包回归。
2. 真机 remoteMic 走查（若有测试机）：iOS Safari 自签证书信任路径、锁屏/切后台时 WS 与 AudioContext 行为。
3. 未深挖角落自选：词典/热词 300 条满载下的纠错性能与 UI；或 punct worker 10 分钟空闲释放与再唤醒延迟实测。

## 6. 清场

- 设置恢复：enhancedVad/enhancedPunct/remoteMicEnabled=false、remoteMicMode=lan、remoteRelayRoom 清空。
- 已删除：本轮下载的 vad/punct 模型、remote-mic 自签证书目录、测试用 Edge profile、16 条测试历史；failed-audio 为空。
- SpeakType.exe / msedge.exe 测试进程已全部终止。
