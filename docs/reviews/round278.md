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
