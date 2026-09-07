# SpeakType 第 55 轮严格审查报告 —— 落字目标应用兼容性 + 设置持久化扫描 + 强杀自愈 + 核心回归

- 审查对象：最新 main@b46c511（含 #110/#112/#113）pack:dir 打包实测
- 审查方式：【实测】= 真机验证；【源码】= 代码走查；【未验证】= 如实标注
- 环境：Windows Server 2022；配置/历史测毕已从备份还原

## 结论总览

| 级别 | 数量 | 内容 |
|------|------|------|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 0 | — |
| P3 | 0 | 零新立案；一条产品向观察见 §1.3 |

## 1. 落字目标应用兼容性——四类目标全过 + 剪贴板保护实证

### 1.1 逐目标实测【实测】
| 目标 | 结果 |
|------|------|
| cmd 控制台（conhost） | 落字到提示符后，完整无丢字 |
| Windows PowerShell 控制台 | 同样正常 |
| 写字板 WordPad（富文本） | 以纯文本落入、默认字体无样式污染、无 RTF 乱码 |
| Chrome textarea（file:// 本地页） | 逐字准确、光标定位正确 |

### 1.2 剪贴板保护【实测】
- 预置剪贴板内容 `ORIGINAL-CLIPBOARD-CONTENT` → 口述落字 → 落字后剪贴板**原样恢复**——粘贴通道用完即还，不吞用户剪贴板。竞品常见投诉点，SpeakType 处理正确。

### 1.3 观察（不立案，产品向候选）
- 终端目标里落字带句首大写与句尾句号（实拍 `Echo hello from the terminal test.` / `Get process speak type.`），直接回车会因大小写/句号执行失败。属听写格式化的固有行为，但开发者向终端/IDE 口述命令是真实场景；竞品（Wispr Flow 等宣传的 app-aware formatting）按前台应用降格式。建议列为 v0.13 候选：前台是终端类进程（cmd/powershell/wt/conhost）时跳过句首大写与句尾标点（activeapp.ts 已有进程名能力，~15 行）。

## 2. 设置页开关持久化与重启一致性——扫描全过【实测】

- 一次性翻转 8 项：holdDelayMs 120→200、doubleTapHandsFree 关、personaHotkeysEnabled 关、vadSilenceMs 2s→3s、muteWhileRecording 开、keepFailedAudio 关、captionLines 3→6、theme light→dark（即时生效实拍）。
- 全部 8 项即时写入 speaktype.json（逐项核对）；退出前后 json **字节级一致**（fc /b 无差异）；重启后 UI 逐项与翻转值一致（200ms/双击关/人设热键关/3s/深色实拍）——无静默回退、无丢失、无重复默认值覆写。

## 3. 强杀后重启自愈——全过【实测】

- **录音进行中 taskkill /f 全进程**（TTS 说到一半强杀，模拟崩溃/断电）：残留进程 0；speaktype.json / history.json 均完整可解析（无损坏）；无 .part、无残留锁。
- 重启：无 config recovered 恢复提示（说明写入原子性扛住了录音中强杀）、翻转的设置原样保留（dark/200ms）；重启后立即 RightCtrl 口述成功落字入历史——麦克风句柄、热键钩子、worker 全部干净重建。
- 中断那句不入历史、不留半截文本——静默丢弃合理（用户强杀/断电本就无预期）。

## 4. 核心链路回归——全过

- RightCtrl 英文逐字落字（§1 四目标 + 恢复后一句）；Alt+Q 免按「Final regression sentence for round 55.」含 ITN 正常；改 3s 静音阈值后自动退出正常。
- 中文本轮未重复（第 54 轮 sensevoice 中文含 ITN 刚验过，模型/语言配置未动）。

## 5. 下一轮候选（按优先级）

1. 云端成功路径补测（继续等 key——唯一长期未覆盖面）。
2. 终端类应用降格式（§1.3 观察）设计论证与是否立项。
3. 真手机实测手机麦通道（触摸/息屏仍【未验证】）。
4. 打磨期主要面基本扫完，可考虑转 v0.13 规划轮。

## 6. 清场记录

- speaktype.json / history.json 已从备份还原（theme=light、hold=120ms、cap=3、mute=False 逐项核对）
- SpeakType / Notepad / cmd / WordPad / 测试 Chrome 页全清，进程 0；无 .part
- 防火墙三 profile 保持 OFF（未执行任何开启命令）
- 未修改任何产品代码
