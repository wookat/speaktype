# 第 278 轮体验官报告（回归 PR #368：手机来源徽标/三分类筛选 + relay manifest 语言协商）

- 日期：2026-08-31
- 被测版本：main @ `45d8b17`（含 #368），打包版 `desktop/release/win-unpacked/SpeakType.exe`（v0.17.0，Node 24.0.1 构建）
- 构建：`npm install` / `npm run typecheck` / `npm run build` / `npm run pack:dir` 全部通过（本地实跑）
- 测试方式：打包版 + fake mic（`--use-file-for-fake-audio-capture` 中文 TTS 固定音频）；手机页用独立 Chrome（fake mic + CDP 注入按住/松开）连官方中转 `https://speaktype.zalize.com/relay`；识别语言 zh、模型 sensevoice-small

## 结论

本轮未发现新立案缺陷（无 P0/P1/P2）。PR #368 的两项修复在打包版与线上均验证通过。仅留一条 P3 观察项（非 #368 引入）。

## 主专项：手机来源标识与筛选（全部实测通过）

环境：本机 RightCtrl 听写 2 条 + 手机页（官方 relay，internet relay 模式，配对码连接成功）按住说话 2 条 + 文件转录（Transcribe zhraw.wav）1 条。

1. 徽标 ✅
   - 手机条目带绿色「手机/Phone/手機/スマホ/휴대폰」徽标；本机条目无徽标；文件条目带蓝色「文件/File」徽标（截图 ss_5d8ef18f / zoom ss_zoom_24739917）。
   - history.json 实证：2 条 `source:"phone"`、1 条 `source:"file"`、本机条目无 source 字段。
2. 来源下拉 ✅
   - 三类共存时下拉显示「全部来源/听写/手机听写/文件转录」（ss_31e89878，en 版 ss_0d23de99）。
   - 删除文件条目后下拉只剩「All sources/Dictation/Phone dictation」（ss_41b75140）——只列实际存在的类别。
   - 再删除全部手机条目后（仅剩本机一类）下拉整体消失（ss_85b5589e）——≥2 类才显示。
3. 三个筛选口径 ✅
   - Phone dictation → 仅 2 条手机（ss_a5f5c26b）；Dictation → 仅本机（ss_4ae09220）；File transcripts → 仅文件（ss_5d5f3c10）。
4. 搜索 + 筛选叠加 ✅
   - 筛选=Phone dictation + 搜索「说那个」→ 只命中 1 条手机条目（ss_93294d20）。
5. 手机听写失败条目带徽标：未测（可选项，见未测试项）。

## 5 语言历史页文案抽查（通过）

en / zh-CN / zh-TW / ja / ko 逐一切换实测：徽标与下拉文案均正确显示、无截断无乱码（en ss_0d23de99、zh-CN ss_31e89878、zh-TW ss_5d697361、ja ss_648006e7、ko ss_3f572a01）。locale 源文件核对：五语言均含 `history.filterPhone` / `history.sourcePhone`（en "Phone dictation"/"Phone"，zh-CN 手机听写/手机，zh-TW 手機聽寫/手機，ja スマホ音声入力/スマホ，ko 휴대폰 받아쓰기/휴대폰）。

## 副专项：relay manifest 线上核验（通过）

`https://speaktype.zalize.com/relay/manifest.webmanifest` 实测：

| 口径 | lang | name |
|---|---|---|
| 不带 Accept-Language | en | SpeakType phone microphone |
| Accept-Language: zh-CN | zh-CN | SpeakType 手机麦克风 |
| ?lang=ko | ko | SpeakType 폰 마이크 |
| Accept-Language: ja | ja | SpeakType スマホマイク（UTF-8 字节级核验 hex 正确；PowerShell 控制台显示 ???? 为控制台编码问题，非缺陷） |

`/relay/app` HTTP 200；手机页 `/relay/m/<code>` 正常加载、配对连接、按住说话落字成功。

## 轻量核心回归（通过）

- RightCtrl 中文落字：2 条中文完整落入记事本（ss_fe8e0060）。
- Alt+Q 免按多句：开启后连续多句分段落字（3 条历史条目），再按 Alt+Q 停止并出提示（ss_dbf3c1f3）。
- Esc 取消：录音中按 Esc，记事本光标位置不变（Ln6 Col19 前后一致）、history.json 条目数不变，无文字插入（ss_c6ca0dd3）。

## 立案项

### 278-P3-1 历史条目的人格（persona）名称按录制时的界面语言固化

- 现象（实测）：界面为韩语时用 Alt+Q 录的条目，切回英文界面后元信息仍显示「기본」，而更早的条目显示「Default」（截图 ss_85b5589e，同屏对比）。
- 复现步骤：设置界面语言=한국어 → 用默认人格听写一条 → 切界面语言=English → 打开 History 查看该条目的 persona 标签。
- 影响面：多语言用户的历史列表元信息语言混杂，观感不一致；不影响功能与筛选。
- 修复建议：历史条目存 persona id（或 i18n key），渲染时按当前界面语言解析显示名。
- 备注：与 #368 无关的既有行为（#368 只改动 source 徽标/筛选与 manifest）；「存的是显示名而非 id」为源码推断，未逐行核对写入路径。

## 实测证据 vs 源码推断

- 实测：上文所有 ✅ 项均为打包版 GUI 实操 + history.json / 线上 curl 一手证据。
- 源码推断：仅 278-P3-1 的成因分析；locale 键值核对属于源码检查（其 UI 呈现已另行实测）。

## 未测试项

- 手机听写失败条目（断网重试场景）是否带手机徽标（任务列为可选，未构造断网场景）。
- LAN 直连模式的手机听写（本轮只走 internet relay）。
- relay manifest 除 en/zh-CN/ko/ja 之外语言（如 zh-TW Accept-Language 变体）。
- 手机页 iOS/Android 真机行为（用桌面 Chrome 模拟）。

## 清理

测试后已退出 SpeakType（托盘 Quit）、关闭记事本（不保存）与手机模拟 Chrome，删除临时测试产物；界面语言恢复 English。

## 第 279 轮补测（同环境续测，main @ 45d8b17 打包版，无代码变更）

补测第 278 轮列出的两个未测项 + RightCtrl 轻量回归，全部通过，无新立案项。

### 1. LAN 直连手机链路 ✅（实测）

- 设置→手机当麦克风→连接方式切「LAN direct」，生成局域网地址 `https://172.16.12.2:43117/?t=<12位码>`（自签名证书，浏览器需手动跳过警告——手机端预期为扫码进入，属已知体验）。
- 手机模拟 Chrome（fake mic）打开该地址（含 12 位 token）：显示「Connected to your PC」，按住说话→中文完整落到记事本光标处（ss_8a1901ed）。
- 注：不带 token 直接打开根地址显示「Link expired」引导重扫码，无法在页面上手输 12 位码（12 位码走 URL token；手输配对码为 internet relay `/relay/app` 的流程）。
- 刷新重连：Page.reload 后自动重新显示「Connected to your PC」，再次按住说话落字成功。
- 两条 LAN 手机条目均带绿色「Phone」徽标（ss_a4c196e6），history.json 均为 `source:"phone"`。

### 2. 手机听写失败条目徽标与重试 ✅（实测）

- 构造方式：Provider 临时切「OpenAI-compatible transcription」并指向不可达地址 `http://127.0.0.1:1/v1`（测完已恢复 Built-in offline）。
- 手机页按住说话→识别失败，历史条目：`status:"failed"`、`source:"phone"`、保留 audioFile 可重试；历史页失败条目带绿色「Phone」徽标 + 红色失败文案 + 「Retry」按钮（ss_b12a23f1）。
- Provider 仍为坏配置时点 Retry：按当前 Provider 重试再次失败并就地显示错误（ss_fa6dac3d，符合预期）。
- 恢复 Built-in offline 后点 Retry：重试成功，条目转为正常文本、provider 变 local，且仍保留 `source:"phone"` 与绿色「Phone」徽标（ss_c407ca0f；history.json 实证 source 字段在重试后保留）。

### 3. RightCtrl 中文落字回归 ✅（实测）

- 恢复 Built-in offline（sensevoice-small，语言 zh）后 RightCtrl 按住 8s：整句中文完整落入记事本（ss_4addbc0c）。

### 第 279 轮未测试项

- 真机手机浏览器扫码进入 LAN 页（桌面 Chrome 模拟，自签证书跳过方式与真机不同）。
- 断网（物理网络中断）场景的失败构造（受禁改防火墙/hosts 约束，用错误 Provider 配置等效构造）。

### 第 279 轮清理

已恢复 Provider=Built-in offline（asrProvider=local 实证）、退出 SpeakType 与记事本、关闭手机模拟 Chrome；临时 OpenAI 假配置仅存于本机测试用户数据，不影响仓库。

## 第 280 轮（同环境续测，被测打包版仍为 main @ 45d8b17 构建产物，无代码变更）

- 日期：2026-09-01
- 测试方式：官方中转 relay 房间 `e2ef509bed86`；两个完全独立的 Chrome 实例（不同 user-data-dir，各自 fake mic + CDP 注入按住/松开）模拟两台手机 A/B 先后加入同一房间

### 结论

主专项双手机抢占行为总体合理（后来者接管、被断开方提示明确、无双推流、快速交替无串音/丢字/崩溃），立案 1 条边界项 280-P3-1（抢占发生在对方正在按住录音时：进行中语音被静默丢弃且被断开页按钮卡在「Release to finish」）。副专项五语言与轻量回归全部通过。

### 1. 主专项：双「手机」抢占同一房间 ✅（实测，附 1 条 P3）

- ① 后来者加入即接管（last-joiner-wins）：A 已连接并成功落字 1 条后，B 打开同一房间链接立即显示「Connected to your PC」，A 同步变为「Another phone is already connected to this room」且按住按钮置灰禁用（截图 ss_a3847257：左 A 灰按钮+提示，右 B 紫色可用按钮）。无拒绝加入、无双推流。
- ② 提示可理解：被断开方文案明确指向「另一台手机已连接」；桌面端设置页始终显示「已连接 1 台设备」（不提示发生过切换）。判断：单用户多设备换机场景下该文案与行为合理，桌面端无感切换可接受，不立案。
- ③ 接管后 B 按住说话正常落字：history 新增 `source:"phone"` 条目，主日志 `dictation finalize` 对应（实测）。
- ④ 快速交替：以「reload 抢回连接 + 按住 5s」在 A/B 间连续切换 3 次，3 条均完整落字（19:44:02/19:44:15/19:44:28 三条 finalize + history 三条 phone 条目），无串音、无丢字、无崩溃；被断开方在断开状态下按住无任何动作（按钮禁用，符合预期）。刷新即抢回连接（reload 后原displaced方重新接管，另一方被顶替），与①行为对称一致。
- 边界（立案 280-P3-1，见下）：A 正在按住录音途中被 B reload 抢占。

#### 280-P3-1 抢占发生在对方录音进行中：进行中语音被静默丢弃，且被断开页按钮卡在「Release to finish」（实测）

- 复现步骤：手机 A 连接同一 relay 房间并按住说话（10s），按住约 3s 时手机 B 刷新同房间页面完成抢占；A 随后松手。
- 实测证据：A 页面变为「Another phone is already connected to this room」但按钮文案停留「Release to finish」，松手后数分钟仍不复位（页面状态多次抓取一致）；该次进行中语音无 `dictation finalize` 日志、history 中既无成功条目也无 failed 条目（对比前后条目时间戳确认），Notepad 无落字——即被抢占瞬间的录音被静默丢弃，用户得不到任何「这句话丢了」的反馈。另 B 抢占加入瞬间页面短暂显示 A 的实时字幕残留（「需要再改一下，明天。」），属同房间内可接受。
- 影响面：小（需两台设备同房间且恰在录音中被抢占），但丢语音无反馈与按钮卡死状态影响可感知。
- 修复建议：桌面端/relay 在踢掉旧连接时向被断开页发送明确的 cancel/kick 事件——复位按住状态（按钮回「Hold to talk」）并提示「本句已中断」；可选：对已收到的半句音频按失败条目入库（带 phone 徽标）以便重试。

### 2. 副专项：设置页「手机当麦克风」区块五语言走查 ✅（实测）

- en（ss_b29d83d0）/ zh-CN（ss_1279bee1）/ zh-TW（ss_9cdafbed）/ ja（ss_2580cf65）/ ko（ss_d3a98bff）逐一切换界面语言并检查该区块：标题、说明、连接方式、中转服务地址、扫码说明、配对码、已连接状态文案均完整显示，无截断、无乱码、无未翻译串。
- 二维码与配对码五语言下均正常展示，且二维码链接的 `?lang=` 参数跟随界面语言（en/zh-CN/zh-TW/ja/ko 实测对应）。
- 直连/中转切换与说明一致：韩语下切「LAN 직접 연결」，说明正确切换为同 Wi-Fi/自签证书提示并显示 LAN 地址与等待状态（ss_9edbe0ef），切回「인터넷 중계」恢复中转说明与配对码。

### 3. 轻量回归 ✅（实测）

- RightCtrl 中文落字：按住 8s，整句中文完整落入记事本（finalize 19:50:49，ss_095edc28）。
- Esc 取消：注入 RightCtrl 按下→3s 后 Esc→继续按住 2s 后松开，无 finalize 日志、记事本光标列不变（无落字），取消生效（ss_1175bc13）。

### 第 280 轮实测/推断区分

- 以上①-④、五语言、回归均为打包版实测（截图/日志/history.json）；「relay 服务器侧如何处理旧连接（kick 事件 vs 静默替换）」未读服务端代码，仅由页面表现推断为未向旧连接发送可复位状态的事件。

### 第 280 轮未测试项

- 真机双手机（两台桌面 Chrome 独立实例模拟）。
- 两台设备同毫秒级同时按住说话的竞态（当前架构同一时刻仅一方连接，未构造出双方均认为自己已连接的窗口）。
- LAN 直连模式下的双设备抢占（本轮仅在 internet relay 模式验证）。

### 第 280 轮清理

已退出 SpeakType 与记事本（不保存）、关闭两个手机模拟 Chrome 实例；界面语言恢复 English、连接方式恢复公网中转；未修改产品代码。
