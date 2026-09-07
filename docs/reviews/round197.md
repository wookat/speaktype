# SpeakType 第 197 轮体验官报告（user-experience-officer）

- 审查对象：main @ `8a61094`（含 PR #290），打包版 `desktop\release\win-unpacked\SpeakType.exe`（UI 显示 v0.15.1，packaged=true）
- 环境：Windows Server（RDP VM，无真实麦克风），Edge fake-mic（`--use-fake-device-for-media-stream` + 16kHz 单声道 PCM WAV），落字目标 Notepad，模型 sensevoice-small 走应用内下载
- 中转：真实生产 Worker `https://speaktype.zalize.com/relay`（未部署本地 relay，全部走线上）
- 证据分级约定：每条发现标注【源码证据】【打包实测】【推论】【未测试】

---

## 一、构建与冒烟

- `npm --prefix desktop ci`：依赖装齐（428 packages，0 vulnerabilities），但退出码 1，出现多条 `EBADENGINE`（electron@43.3.0 / @electron/rebuild@4.2.0 等要求 Node >= 22.12.0，本机 Node v20.19.0），且 electron 安装钩子没有落下 `dist/electron.exe`，需手动执行 `node desktop/node_modules/electron/install.js` 后 `pack:dir` 才能通过。【打包实测】
  - 建议：README/开发文档明确 Node >= 22 的硬要求（engines 字段或 .nvmrc），否则新机器首次构建必踩。属环境问题不立案。
- 打包版核心闭环冒烟通过：RightCtrl 按住 → sensevoice-small 本地识别中文 → 松手落字到 Notepad 光标处，`main.log` 有对应 `dictation finalize` 记录。【打包实测】

## 二、PR #290 回归结果

### R1 relay 心跳（闲置不僵死）——通过

- 【源码证据】`desktop/src/main/remotemic.ts:337-363`：25s 协议层 ping/pong，pong 缺失即 `terminate()` 交给既有重连逻辑。
- 【打包实测】公网中转房间 `8e37a7aeb9b1`：手机页 23:32 连上后完全闲置至 23:43（11 分钟），期间 `main.log` 无 heartbeat timeout/重连记录，手机页始终 "Connected to your PC"；23:43:53 直接按住说话，8.9s 音频完整转写并落字 Notepad（`dictation finalize: durationMs=8934`）。闲置后连接未僵死。
- 【未测试】数小时级长闲置、真机蜂窝网络切换。

### R2 手机页 5 语言——通过

- 【打包实测（线上 Worker 实拉）】`/m/<room>?lang=en|zh-CN|zh-TW|ja|ko` 五种均正确：服务端渲染 `<html lang>` 与 `SERVER_LANG` 一致，客户端按钮/状态/页脚文案逐语言核对（如 zh-TW「按住說話/鬆手後文字會落到電腦游標處」、ja「押しながら話す」、ko「누르고 말하기」）。
- 【打包实测】`/app` localStorage 继承：先开 `?lang=en` 房间页（localStorage 写入 `speaktype-lang=en`），再开无参 `/app`，界面为英文且 manifest link 自动带 `?lang=en`。
- 【打包实测】未知值回退：`?lang=xx-weird` → 不污染 localStorage（保持 null），最终按 `navigator.language`（en-US）回退英文；服务端渲染回退默认。`manifest.webmanifest?lang=bogus` 与无参均回退 `zh-CN`。与 `relay/src/phone.ts` `resolvePhoneLang`/`pickLang` 行为一致。
- 【未测试】真机 iOS/Android PWA 安装后的 manifest 语言表现。

## 三、立案项

### P2-1971 busy 竞态实锤：桌面收尾窗口内手机按住说话被静默吞掉（待定夺项②，建议立案）

- 【打包实测（复现）】桌面 RightCtrl 松手进入转写/润色阶段后 49ms（23:49:17.227，`dictation finalize` 日志 23:49:17.178），手机端 mousedown：
  - 手机未收到 busy（按钮保持 "Release to finish"，busy 会触发 endHold 复位按钮——对照组 23:46:11 桌面录音中按下时正确弹出 "Your PC is recording, please wait"）；
  - 手机 state 显示的是桌面会话的 "Polishing…"，用户以为自己在录；
  - 松手发 stop 后无任何 finalize/错误/落字/历史记录（`main.log` 23:49:17.178 后无新 finalize，历史页无该条），这句话无声丢失；
  - 手机 state 停留在 "Polishing…" 超过 4 分钟不复位（23:53 仍在显示）。
- 【源码证据】根因是两套"忙"判定不一致：
  - `desktop/src/main/remotemic.ts:296-302`：仅当 `d.isRecording()`（state 为 recording/connecting）才回 busy，否则 `activeWs = ws; void d.start()`；
  - `desktop/src/main/dictation.ts:349`：`start()` 开头 `if (this.busy) return;`——转写/润色期间 `busy=true` 但 state 已不是 recording/connecting，手机的 start 被静默吞掉；
  - `desktop/src/main/dictation.ts:489-492`：随后手机的 stop 因 `if (!this.busy) return`（或 session 归属桌面）不会为手机产生结束反馈；
  - 手机端 `relay/src/phone.ts:375`：`idle && !holding` 才复位文案，idle 广播到达时用户还按着，错过后无重发 → "Polishing…" 永久残留。
- 【推论】窗口宽度 = 转写+润色时长：本地 warm 模型约 1-2s；开启 AI 润色或云端 ASR 时可达数秒，家庭场景"电脑前的人刚说完、拿手机的人紧接着说"并不罕见。静默丢话 + 假录音状态是最伤信任的一类失败。
- 修复建议：
  1. `remotemic.ts` start 分支改用 dictation 的 busy 口径（暴露 `isBusy()`），busy 期间一律回 `busy` 消息；
  2. 或 `dictation.start()` 返回是否真正启动，被吞时由 remotemic 回 busy；
  3. 手机端 `endHold()` 时本地立即复位 state 文案，不依赖 idle 广播。
- 定级 P2：有确定性数据丢失但窗口短、有对照提示语可修。

### P2-1972 手机侧半开连接可把房间锁死（"该房间已有手机连接"无法自愈）

- 【打包实测】测试房间内手机页多次导航后，一个未干净关闭的旧 phone socket 把房间占住：此后每次进入均提示"该房间已有手机连接"，从 23:35 持续到 23:53（18 分钟）仍未释放，刷新两次亦无效。
- 【源码证据】
  - `relay/src/index.ts:60-63`：新 phone 连接时只要旧 `this.phone.readyState === OPEN` 一律拒绝（1008 room occupied）；phone slot 没有任何服务端心跳/探活，半开 TCP 永远 OPEN；对比 desktop slot（`relay/src/index.ts:44`）是"新连接顶替旧连接"（`this.desktop?.close(1000, "replaced")`）。
  - `relay/src/phone.ts:359-366`：收到 `room occupied` 后 `return`，不重试不退避——即使占用是瞬时的（自己刷新页面时旧连接尚未关闭），页面也永久停在占用提示，必须手动再刷新。
- 【推论】真机场景：手机进电梯/地铁断网（无 FIN 包）、或杀浏览器进程后重新扫码，都会撞上"自己占自己"的死房间；PR #290 只给 desktop 侧加了心跳，phone 侧仍是 195 轮前的裸状态。
- 修复建议：phone slot 采用与 desktop 一致的顶替策略（同一房间码本就是配对凭证，后到者顶替旧连接风险很小）；或 DO 侧对 phone socket 定期 ping、超时清位；手机页对 occupied 增加 2-3 次退避重试。
- 定级 P2：影响核心"手机当麦克风"可用性，且用户无自救手段（房间码不变，重开页面也进不去）。

### P3-1973 切界面语言后 QR 的 ?lang 滞后（待定夺项①，建议立案 P3、按轻量方案修）

- 【打包实测】手机麦克风运行中把界面语言 English→简体中文：设置页文案立即切换，但 QR 与链接仍是 `?lang=en`；关开一次「手机当麦克风」后才变 `?lang=zh-CN`。
- 【源码证据】`desktop/src/main/index.ts:393-395` 只在 remoteMic 三项设置变化时 `syncRemoteMic`；URL/QR 在 `remotemic.ts:400-402` 启动时一次性生成，`startRelayMic` 对已运行实例直接短路返回。
- 设计意见：应该即时更新，但不必重启服务——语言只影响 URL 字符串和 QR 图，两者可原地重算（房间号、ws 连接都不变，已连手机不受影响）。在 uiLanguage 变化时调用一个只重建 `info.url/qrDataUrl` 并 push 到设置页的轻量函数即可，成本极低。不建议把 uiLanguage 加进 `syncRemoteMic` 触发条件（那会断开已连接的手机，代价大于收益）。
- 影响评估：一次性的首扫体验问题（手机页首次打开后自会把语言写进 localStorage），且中转页有 navigator 回退兜底，实际伤害小 → P3。

### P3-1974 busy 提示会被桌面状态广播立刻覆盖

- 【打包实测】23:45:19 桌面录音临近结束时手机按下：busy 已生效（按钮被复位），但 600ms 后 state 显示的已是 "Transcribing…"——busy 文案被随后的状态广播覆盖，用户可能根本没看到"电脑正在录音"的原因说明。
- 【源码证据】`relay/src/phone.ts:370-381`：status 与 busy 写同一个 `stateEl`，busy 无最短展示时长/优先级。
- 修复建议：busy 提示 toast 化或给 2s 保护期内忽略 status 覆盖。P3。

## 四、Transcribe 长音频体验（22 分钟 WAV，1324s）

- 进度与流式结果：导入后立即显示"转录中… n%"+进度条+已出段落实时滚动，转写中即可复制/导出 TXT/SRT。22 分钟文件全程约 46s（~29x 实时）。【打包实测】
- 取消：转写中点「取消」立即回到拖入区，已出的 13 段结果保留且可导出；取消的运行不写 `transcribe-last.json`、不进历史——符合"完成才落库"预期。【打包实测】
- 完成：63 段、UI 显示完成时间戳，`transcribe-last.json` 仅在完成时写入（LastWriteTime=完成时刻），历史页出现带「文件 · 22min」徽标的条目。【打包实测】
- 错误路径:喂入伪装成 .mp3 的文本文件，红字内联报错「无法解码该文件：请确认是常见音频格式（mp3 / wav / m4a / ogg / flac）」，上一次成功结果不被清掉。【打包实测】
- 小建议（不立案）：取消后主日志没有任何记录（started 有、cancel 无），排查用户报障时少一环，可补一行 log。【打包实测】
- 【未测试】>1GB 超大文件、后台最小化时转写、SRT 时间轴精度校验。

## 五、自由走查

- 界面语言切换即时生效（含侧栏/设置页全量文案），无残留英文。【打包实测】
- 历史页信息架构好：来源筛选、按天分组、「查看识别原文」、文件转写与听写条目区分清楚。【打包实测】
- 手机页「该房间已有手机连接」文案本身没问题，但结合 P2-1972 的不可自愈，用户会理解成"别人占了我的房间"，实际多半是自己的旧连接——文案可加一句"若是你自己的旧连接，稍候片刻或重开页面"。【推论】
- 首页初装引导显示 Parakeet ~660MB 为默认推荐下载，与"默认本地 SenseVoice（中英日韩粤）"的产品定位不一致；中文用户首次进来看到 660MB 英文模型容易劝退（本轮从设置页手动选了 sensevoice-small 239MB 才走通中文）。建议按系统语言推荐模型。【打包实测】【推论】
- RDP 环境无法验证 hover 类交互（`matchMedia('(hover: hover)')` 为 false），本轮不据此报缺陷。【未测试】

## 六、结构化结论

### 立案列表

| 编号 | 级别 | 一句话 | 根因位置 |
| --- | --- | --- | --- |
| P2-1971 | P2 | 桌面转写/润色窗口内手机 start 被静默吞掉：无 busy、无 finalize、话语丢失、手机假状态残留 | desktop/src/main/remotemic.ts:296-302 + desktop/src/main/dictation.ts:349,489-492 + relay/src/phone.ts:375 |
| P2-1972 | P2 | phone 半开连接把房间永久锁死，occupied 后手机页不重试无法自愈（实测 18 分钟不释放） | relay/src/index.ts:60-63（对比 :44 desktop 顶替策略）+ relay/src/phone.ts:359-366 |
| P3-1973 | P3 | 界面语言切换后 QR ?lang 滞后，需关开手机麦克风才更新；建议原地重算 URL/QR 不重启服务 | desktop/src/main/index.ts:393-395 + desktop/src/main/remotemic.ts:400-402 |
| P3-1974 | P3 | busy 提示被状态广播即时覆盖，用户看不到取消原因 | relay/src/phone.ts:370-381 |

### 回归结果

- PR #290 relay 心跳：通过（11 分钟闲置不僵死，闲置后转写落字正常）。
- PR #290 手机页 5 语言：通过（5 语言服务端+客户端、/app localStorage 继承、未知值回退、manifest 回退全部实测）。
- 遗留缺口：phone 侧 socket 无心跳（P2-1972），#290 只覆盖了 desktop 侧。

### 两个待定夺项设计意见

1. QR ?lang 滞后：应即时更新，但用"仅重算 URL/QR"的轻量方案，不动 ws 连接 → 立案 P3-1973。
2. busy 竞态：真实用户影响成立（静默丢话+假录音状态，窗口随润色/云端识别拉宽），应立案 → P2-1971。

（报告分支：review/round197-report，仅含本文件，不含产品代码改动。）
