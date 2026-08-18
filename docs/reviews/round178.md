# 第 178 轮体验官审查报告

- 基线：`main@f64e1c0`（fix(hotkey): WH_KEYBOARD_LL 低级钩子录音期间吞掉 Esc——Ctrl+Esc 开始菜单真拦截（第 177 轮 P2 跟进）(#266)）
- 测试方式：`npm ci` + electron-builder 打包 `release/win-unpacked/SpeakType.exe`，Windows Server 2022 实机运行；假麦克风（`--use-file-for-fake-audio-capture`）注入 edge-tts 生成的 16kHz 单声道 WAV（中/英各一条）；落字目标为记事本。本轮为省时将 sensevoice-small 模型文件（字节数与官方一致：model.int8.onnx 239,233,841 / tokens.txt 315,894）预置到 `userData\models`，应用内下载流程未重测（第 170/177 轮已覆盖）。
- 证据等级：【实测】打包应用实机验证；【源码】读代码确认；【推测】合理推断未直接验证；【未验证】本轮未覆盖。

## 一、#266 回归（本轮重点，全部通过）

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 1 | 录音中按 Esc 取消 ×5 连测：开始菜单不弹出 | ✅ 5/5 | 【实测】记事本按住 RightCtrl 录音 2s 后按 Esc（SendInput 注入，对系统即 Ctrl+Esc）：5 次全部无开始菜单、无落字、记事本焦点保持（光标仍在编辑区、标题栏无变化） |
| 2 | 取消生效：松键不落字、不计入统计 | ✅ | 【实测】5 次取消后记事本内容为空；主页统计仍为 Sessions 1 / Words 32（仅计成功听写），主日志无对应 `dictation finalize` 条目 |
| 3 | 空闲时钩子已卸载：Ctrl+Esc 恢复系统行为 | ✅ | 【实测】非录音状态按 Ctrl+Esc，开始菜单正常弹出——低级钩子仅录音会话期间安装，不影响其他应用【源码】`escblock.ts` install/uninstall 随会话起止 |
| 4 | 免按模式（Alt+Q）中 Esc 取消（第 177 轮遗留未验证项） | ✅ | 【实测】Alt+Q 进入免按模式（波形胶囊 + 实时字幕「Please schedule.」出现），按 Esc：胶囊与字幕立即消失、无落字、无开始菜单、焦点保持 |

## 二、核心听写回归（全部通过）

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 5 | 中文核心链路：记事本按住 RightCtrl 7s→松手落字 | ✅ | 【实测】落字「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复，帮我跟老板说」（尾部重复为假麦 WAV 循环所致，环境限制非缺陷）；标点自动补全；history.json 同步入库 |
| 6 | 英文链路：设置页识别语言切 English→重启→英文 WAV 落字 | ✅ | 【实测】落字 "Please schedule a meeting with the design team tomorrow afternoon. Please schedule." 大小写/标点完整；语言设置经 UI 修改后跨重启持久化 |

## 三、专项深挖 1：Transcribe 文件转写页（近轮未覆盖）

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 7 | 选择 zh.mp3（5.6s）离线转写 | ✅ | 【实测】约 0.3s 完成（日志 `file transcribe done (1 segments)`），文本「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复。」与音频完全一致，带时间戳 0:00 |
| 8 | SRT 导出 | ✅ | 【实测】另存为 zh.srt：UTF-8 带 BOM，序号/时间轴 `00:00:00,000 --> 00:00:05,592`/中文文本格式全部正确 |
| 9 | 转写结果入历史 | ✅ | 【实测】历史页出现独立条目，来源标注为文件名「zh.mp3」，与听写条目（标注 Default·Local offline）可区分 |

【未验证】TXT 导出、Copy all、长音频（分钟级）分段与进度反馈、mp3 以外格式（wav/m4a/ogg/flac）。

## 四、专项深挖 2：Dictionary 热词页（近轮未覆盖）

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 10 | 批量添加热词（英文 ×2 + 中文 ×1）并保存 | ✅ | 【实测】文本框每行一词输入 SpeakType/SenseVoice/答复→Save：计数器变 3/300，下方以 chip 形式展示且各带删除 × |
| 11 | 热词持久化 | ✅ | 【实测】`speaktype.json` 的 `settings.hotwords` 数组为 `["SpeakType","SenseVoice","答复"]`，中文无乱码 |

【未验证】热词对识别结果的实际纠偏效果（需构造易错词对照实验）、300 上限行为、「Learn from your corrections」自动学词链路。

## 五、其他实测覆盖

- 【实测】设置页 Speech 标签：Provider/Status(Ready)/Local model(Model ready)/Force Simplified Chinese/Recognition language（6 选项下拉）/Enhanced punctuation/Format spoken numbers 渲染与交互正常。
- 【实测】历史页三条记录（中文听写、文件转写、英文听写）时间/时长/来源元数据齐全，Copy/Correct/Delete 按钮就位。
- 【实测】主页统计随成功听写更新（Sessions/Words/Voice input 时长），取消的会话不计入。

## 六、新立案问题

本轮未发现新的 P0/P1/P2/P3 缺陷。

## 七、产品设计思考（建议，不立案）

- 【推测】Esc 取消目前唯一反馈是录音胶囊消失，无「已取消」轻提示；误触 Esc 时用户无法区分「取消了」与「识别失败」。可参考 Wispr Flow 在取消时给 0.5s 级轻量视觉确认。
- 【推测】Transcribe 页单文件入口，会议/播客场景常见多文件批量需求（CapsWriter 支持目录批量）；可考虑多选/拖入多文件排队转写。
- 【推测】文件转写结果与听写混在同一历史流，量大后可能互相淹没；可在历史页加来源筛选（听写/文件/改写）。

## 八、本轮未验证（如实声明）

- 【未验证】parakeet/whisper 模型、云端 ASR 通道、电话麦克风、多显示器窗口记忆、五语言 UI 全量走查、F8 改写链路（第 177 轮已全绿，本轮未重测）、应用内模型下载/续传 UI（模型为预置）。

## 九、结论

PR #266 的 WH_KEYBOARD_LL 低级钩子修复在打包应用中 5/5 实测通过：录音中 Esc/Ctrl+Esc 不再弹出开始菜单、焦点不丢，空闲时钩子卸载不影响系统；免按模式 Esc 取消同样无副作用（补上第 177 轮遗留未验证项）。中/英核心听写、Transcribe 文件转写、Dictionary 热词两个新专项全部通过，本轮零新立案。

统计：P0 × 0，P1 × 0，P2 × 0，P3 × 0。
