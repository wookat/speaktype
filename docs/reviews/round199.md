# SpeakType 第 199 轮打包实测报告（qa-engineer 回归轮）

- 审查对象：main @ `54a2043`（含 PR #291），打包版 `desktop\release\win-unpacked\SpeakType.exe`（UI 显示 v0.15.1，packaged=true）
- 环境：Windows Server（RDP VM，无真实麦克风），fake-mic 16kHz WAV（「帮我跟老板说那个方案需要再改一下明天上午之前给他答复」），落字目标 Notepad，模型 sensevoice-small 走应用内下载（Ready）
- 中转：真实生产 Worker `https://speaktype.zalize.com/relay`（线上已部署 #291 的 relay 代码：`/m/<room>` 页面含 busyHold/ping 逻辑，服务端应答 pong——发布确认）
- 手机侧：Chrome fake-phone（独立 CDP 端口），按住/松开用 CDP `Input.dispatchMouseEvent`；协议级证据用 CDP Network 域抓 WS 帧
- 证据分级约定：每条发现标注【源码证据】【打包实测】【推论】【未测试】

---

## 一、冒烟基线

- 打包版核心闭环通过：RightCtrl 按住 → sensevoice-small 本地识别中文 → 松手落字 Notepad，`main.log` 有 `dictation finalize`。首页/历史/设置页无异常。【打包实测】

## 二、PR #291 回归结果（第 197 轮四项立案逐条验证）

### R1 P2-1971 busy 口径改用会话占用（isBusy）——通过

- 【源码证据】`desktop/src/main/dictation.ts` 新增 `isBusy()`（start 到落字/失败全程为 true），`remotemic.ts` start 分支由 `isRecording()` 改为 `isBusy()`。
- 【打包实测】录音中按手机：mousedown 01:34:36.684（桌面录音区间内），53ms 后收到 `{"type":"busy"}`，手机显示 busy 文案，随后 0.9s 的 recording 状态广播未覆盖（busyHold 生效），按钮复位（endHold+cancel），桌面本次听写照常落字。
- 【打包实测】转写/润色窗口按手机（197 轮静默丢话的核心场景）：用本地 OpenAI 兼容 mock 把润色拉长到 6s；mock 请求 01:39:09.885 在途时手机 start（01:39:10.882）→ 49ms 后收到 busy，busy 文案保持 5.3s（≥3s 保护期）后恢复 "Connected to your PC"，桌面润色结果 `POLISH-MOCK-R199 六秒延迟润色结果` 正常落字。不再被静默吞掉。
- 【未测试】云端 ASR 转写窗口（本轮仅本地模型 + 润色 mock 拉宽窗口）。

### R2 P2-1972 手机侧心跳——通过

- 【源码证据】`relay/src/phone.ts` 每 25s 发 `{"type":"ping"}`、pong 缺 2 次即主动 close 走重连；`relay/src/index.ts` 服务端应答 pong 且不转发给桌面。
- 【打包实测（协议级）】`tts/probe_pong.mjs` 直连线上 Worker：ping→pong 0.1s 内应答。
- 【打包实测（E2E）】手机页闲置 88s：WS 帧显示 3 次 ping 间隔精确 ~25s、每次 pong RTT ~30ms；期间无断连/重连，闲置后 talk 按钮仍可用、状态 "Connected to your PC"。
- 【未测试】真机蜂窝网半开连接的实际探活恢复（本环境无法制造真实半开 phone socket）。

### R3 P3 手机顶替（后来者顶替 + 不误报离线）——通过

- 【源码证据】`relay/src/index.ts` phone slot 改为顶替策略（旧连接 close 1000 "replaced"），且被顶替的旧连接 close 时不再清掉新 phone / 不误发 `peer:false`；`phone.ts` 对 "replaced" 与 "room occupied" 同样显示占用文案且不重连。
- 【打包实测（协议级）】`tts/probe_replace.mjs`：同房间第二个 phone 连入，旧连接收到 close 1000 "replaced"，新连接存活并可 ping/pong。
- 【打包实测（E2E）】第二个 Chrome 标签页打开同房间 URL：新页接管（peer 后 talk 可用），旧页显示 "Another phone is already connected to this room" 且 27s 观察内不自动重连；桌面侧连接数轮询全程保持 "1 device(s) connected" 无 offline 闪烁；新页完成一次完整 8s 手机听写并落字 Notepad，历史页新增该条目。

### R4 P3-1973/1974 QR ?lang 即时刷新——通过

- 【源码证据】`desktop/src/main/index.ts` uiLanguage 变化时调用 `refreshRemoteMicQr()`：仅原地重算 URL/QR 并推送，不重建 ws 连接。
- 【打包实测】中转运行中把界面语言 English→简体中文：约 2s 内设置页 QR 链接由 `?lang=en` 变 `?lang=zh-CN`，房间号 `1faed4b72b5b` 不变，`main.log` 无新的 `remote mic relaying via`（未重连），开关未动；切回 English 同样即时回到 `?lang=en`。

## 三、本轮新发现

### P3-1991 busy 文案可永久残留：会话末尾的 busy 撞上 3s 保护期，最终 idle 广播被吞后无人恢复

- 【打包实测（复现 2 次）】手机 start 落在桌面会话最后 ~1-3s 内（如 8s 按住的第 7.5s）：busy 正常返回并显示，但桌面收尾的最终 `idle` 状态广播恰好落在 3s busyHold 保护期内被忽略，此后再无任何广播——手机页 "Your PC is recording, please wait" 残留 60s+（实测 01:26:27 出现，01:27:35 仍在），直到下一次听写或刷新页面。
- 【源码证据】`relay/src/phone.ts` busyHold 分支对非 error 状态一律丢弃，且 idle 广播是一次性的、无重发；busyHold 到期后没有"补放最后一条状态"的机制。
- 【推论】常见场景（busy 发生在会话中段）不受影响（R1 已证恢复正常）；只有边沿时序命中才触发，属 197 轮 P3-1974 修复方案自身引入的边界。
- 修复建议：busyHold 记录期内最后一条被丢弃的 status，到期用定时器补放；或桌面在回 busy 后 >3s 再补发一次当前状态。定级 P3。

### 其他

- 手机页 `<select>` 与设置页下拉在本 RDP 环境常需点击 2-3 次才展开（首次仅聚焦）——输入注入特性，不立案。【打包实测】
- 本轮把 store 的 `remoteMicMode` 留在了 `relay`（测试遗留，功能开关已关，无副作用）。【打包实测】

## 四、结构化结论

### 回归结果

| 197 轮立案 | 本轮结论 | 关键证据 |
| --- | --- | --- |
| P2-1971 busy 口径 | 通过 | 录音中 53ms / 润色窗口 49ms 收到 busy，不再静默丢话 |
| P2-1972 phone 心跳 | 通过 | 88s 闲置 3×ping/pong 间隔 25s，无断连 |
| P3 顶替 | 通过 | 旧连接 close "replaced"，桌面无 offline 闪烁，新页可完整听写 |
| P3-1973/1974 QR ?lang | 通过 | 语言切换 ~2s 内原地更新，房间不变、不重连 |

### 新立案列表

| 编号 | 级别 | 一句话 | 根因位置 |
| --- | --- | --- | --- |
| P3-1991 | P3 | 会话末尾的 busy 撞 3s 保护期吞掉最终 idle 广播，手机 busy 文案永久残留 | relay/src/phone.ts（busyHold 丢弃 status 无补放）|

（报告分支：review/round199-report，仅含本文件，不含产品代码改动。测试录屏与 WS 帧日志见本轮会话。）
