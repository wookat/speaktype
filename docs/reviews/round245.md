# 第 245 轮体验官报告（user-experience-officer + QA 交叉视角）

- 日期：2026-08-20
- 基线：main @ `c849f3f`（含 PR #336 文件转录停顿切片 + 句号恢复，P2-2394 修复）
- 版本：SpeakType 0.15.1（本地打包 win-unpacked 实测）
- 环境：Windows Server 2022 / Node v20.19.0 / electron-builder（`npx electron-builder --dir`）
- 方法：fake microphone WAV（msedge-tts 生成 16k 单声道中/英/日语料）+ 应用内下载本地 sensevoice-small 模型 + Notepad 真实落字（SendInput 注入 RightCtrl / Alt+Q）+ Playwright(CDP 9333) 驱动 Transcribe 页上传
- 证据口径：全文区分【实测确认】【源码论证】【推测】【未测试】

## 执行摘要

1. 构建链路全绿【实测确认】：`npm install`（仍有 EBADENGINE 警告，P3-2396 未变）→ `npm run typecheck` ✅ → `npm run build` ✅ → `npx electron-builder --dir` ✅。typecheck/build 过程输出一条 `Cannot find base config file "./.wxt/tsconfig.json"` 警告，不影响结果。
2. **#336 回归通过**【实测确认】：0.6s 句间停顿的 3 句中文 WAV 被正确切成 3 个子段（4.05s / 7.45s 切点），3 处句号全部恢复（242 轮同款语料 s01 为 0/2 保留），ITN（3点、300万元）正确；单句含逗号语料未被误切；英文输出无中文句号；日文（含假名）输出无中文句号追加。P2-2394 在文件转录链路判定修复。
3. 核心闭环通过【实测确认】：RightCtrl 按住 9s 释放，Notepad 正确落字「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复，谢谢」（尾句号被 Default persona 去除，与 242 轮口径一致）。
4. 自选深挖（免按真实分段，>2s 停顿多 finalize）基本通过【实测确认】：2.6s 句间停顿触发逐句 finalize（日志 6 次 `dictation finalize`），Notepad 落字逐段以句号结尾、拼接无丢失无重复；但其中一段出现中英混杂退化「这个项的预算 is300。」（是→is、目字丢失、万元丢失）→ 新立案 P3-2397。
5. 立案更新：P2-2394 文件转录链路修复确认可关闭（免按实时链路句号由 finalize 边界兜底，另路径）；P3-2395/P3-2396 维持；新增 P3-2397（免按会话偶发中英混杂/ITN 退化）。

## 一、构建与打包【实测确认】

| 步骤 | 结果 |
| --- | --- |
| `npm install`（desktop/） | 完成、0 vulnerabilities；EBADENGINE 警告仍在（Node >=22.12.0 要求 vs 当前 v20.19.0，P3-2396） |
| `npm run typecheck` | ✅ 通过（含 `.wxt/tsconfig.json` 缺失警告，非错误） |
| `npm run build` | ✅ 通过（main/preload/renderer 三产物） |
| `npx electron-builder --dir` | ✅ 产出 `desktop/release/win-unpacked/SpeakType.exe` |

模型走应用内下载：sensevoice-small 下载成功，日志 `local model sensevoice-small downloaded`（21:47:00）。

## 二、#336 文件转录回归【实测确认】

方法：Playwright(CDP) 驱动 Transcribe 页上传 WAV，结果取自 `%APPDATA%\SpeakType\transcribe-last.json`（UTF-8 直读，避免控制台乱码误判）。

| 用例 | 语料 | 预期 | 结果 |
| --- | --- | --- | --- |
| 停顿切片+句号恢复 | s01_245.wav（3 句中文，句间静音 0.6s，11.2s） | 按停顿切 3 段、句界句号恢复 | ✅ 3 段（0–4.05 / 4.05–7.45 / 7.45–11.2s），每段句尾均为「。」；242 轮同款语料句界保留率 0/2 → 本轮 2/2 |
| ITN | 同上 | 数字规范化 | ✅ 「今天下午3点开会」「预算是300万元」 |
| 逗号不误切 | g01_245.wav（单句含 3 个逗号，6.8s） | 单段、逗号保留 | ✅ 1 段，逗号全保留，句尾补「。」 |
| 英文不加中文句号 | en_245.wav（2 句英文，5.7s） | 英文句号、无「。」 | ✅ 2 段（英文句间自然停顿 >0.5s 触发切片），均以英文句号结尾，无「。」追加 |
| 日文（假名）不加中文句号 | ja_245.wav（含假名，6.6s） | kana 检测跳过补「。」 | ✅ 1 段，句尾「ください。」为模型自带，无额外追加；注：ITN 输出「午後 3 時」数字两侧带 ASCII 空格（轻微观感问题） |
| 长音频多段 | long_245.wav（同句 ×5、0.2s 插入间隔，32.7s） | 切片+每段句号 | ✅ 5 段（6.3/12.85/19.45/26.05s 切点），每段句尾「。」，文本 5 次一致 |

日志均为 `file transcribe done (N segments)`，切片与解码无报错。

限制说明：
- fast_245.wav（插入间隔 0.35s，低于 PAUSE_S=0.5s）仍被切成 3 段——TTS 语料每段自带首尾自然静音，叠加后有效静音 >0.5s，**「低于阈值不切」的回退路径本轮未能用 TTS 语料构造出来，仅有源码论证**（splitByPauses 要求静音连续帧 ≥0.5s 且两侧子段 ≥1.5s）【源码论证】。
- 同理 long_245 的有效停顿 >0.5s 已被停顿切片消化，**MAX_SEG_S=28s 整段无停顿的 capLongSegment 路径未独立实测**【源码论证】。
- 热词纠错、简繁转换本轮未在文件转录链路重复实测（242 轮已覆盖词典链路）【未测试】。

结论：#336 在实测语料上达成设计目标，P2-2394 文件转录链路修复确认。

## 三、核心闭环抽查：RightCtrl 本地落字【实测确认】

方法：打包应用以 `--use-file-for-fake-audio-capture=hold_245.wav`（g01 语音 6.8s + 4s 静音尾）启动，Notepad 聚焦后 SendInput 注入 RightCtrl 按住 9s 释放。

- Notepad 实际落字正确：「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复，谢谢」（尾句号被 Default persona 去除，与 242 轮一致，非回退）。
- 日志 `dictation finalize: durationMs=8876 maxPeak=32767 voicedMs=4360`，worker 正常启动，无错误。

## 四、自选深挖：免按真实分段（>2s 停顿多 finalize）【实测确认】

方法：hf_245.wav（3 句中文、句间静音 2.6s，fake capture 循环播放）启动，强制前台 Notepad 后 Alt+Q 开启免按 25s 再 Alt+Q 结束。242 轮 Top3 建议 #2 的补测。

- VAD 分段生效：日志 6 次 `dictation finalize`（durationMs 3.2–6.2s，与 2s vadSilenceMs 阈值+2.6s 停顿吻合），不再是 242 轮的 50s 单段。
- Notepad 落字（UTF-8 存证 r245_hf.txt）：

  > 今天下午3点开会，请大家准时参加。会议地点在二楼会议室。这个项的预算 is300。今天下午3点开会，请大家准时参加。会议地点二楼会议室。

- ✅ 每次 finalize 落字以「。」结尾，段间拼接无丢字、无重复、无粘连（242 轮「参加+会议地点」5/5 连排问题在多 finalize 路径不复现）。
- ❌ 第 3 段退化：「这个项目的预算是300万元」→「这个项的预算 is300」（「目」丢失、「是」识别为英文 is、「万元」丢失）；第 5 段「会议地点在二楼」丢「在」。同音频文件转录链路 5/5 次全对（见 long_245），**仅免按实时链路（逐段短音频解码）出现**→ 立案 P3-2397。
- 测试插曲（非产品问题）：SpeakType 主窗口启动后置前台，SendInput 需 AttachThreadInput 强制切换 Notepad 前台后落字才进入 Notepad；真实用户手动点击目标窗口无此问题【推测】。

## 五、立案清单

| 编号 | 级别 | 标题 | 状态 |
| --- | --- | --- | --- |
| P2-2394 | P2 | 文件转录中文句界句号大面积降级 | ✅ #336 修复实测确认，建议关闭（免按实时链路由 finalize 边界句号兜底，本轮实测正常） |
| P3-2395 | P3 | 免按同会话 ITN 数字格式不一致 | 维持（本轮未复现 3点/三点漂移，但见 P3-2397 同源退化） |
| P3-2396 | P3 | Node 20 下 npm install EBADENGINE 警告 | 维持，本轮复现 |
| P3-2397 | P3 | 免按实时链路偶发中英混杂/字丢失（「预算是300万元」→「预算 is300」），同音频文件转录 5/5 全对 | 新立案。复现：hf_245.wav 循环免按；证据：r245_hf.txt、history.json、main.log 21:52–21:53。推测为逐段短音频（<2s voiced）解码上下文不足【推测】 |

## 六、Top3 下一轮建议

1. **P3-2397 量化**：构造 10+ 段短语音（voiced 1–3s）免按语料，量化中英混杂/丢字率，并对比文件转录同语料基线，确认是否与音频段长相关。
2. **capLongSegment 独立回归**：用真实连续朗读（无 >0.5s 停顿）的 >28s 语料（或人工拼接去除边缘静音）覆盖 MAX_SEG_S/MIN_CUT_S 路径与 fast（<0.5s 停顿不切）回退路径。
3. **F8 改写多语言**（242 轮遗留）：以 OpenAI-compatible mock 验证 F8 改写在中英日语料下的行为与错误处理。

## 七、未测试与限制

- 「停顿 <0.5s 不切片」回退与「>28s 无停顿强切」路径仅源码论证（TTS 语料自带边缘静音，无法构造纯 <0.5s 有效停顿）。
- 热词纠错、简繁转换、云端 ASR、F8 改写、SRT 导出本轮未测试。
- 静音其他应用（mute-other-apps）行为：VM 无音频输出设备，未测试。
- P3-2395（3点/三点漂移）本轮循环次数少（2 轮循环），未复现不代表已消失。

## 八、清理

- 已结束 SpeakType 与 Notepad 进程（不保存）；测试用户数据位于 `%APPDATA%\SpeakType`（模型 ~230MB 保留供后续轮次复用，历史/日志为测试数据）。
- 测试脚本与 WAV 语料位于仓库外 `C:\Users\Administrator\tts`（gen245.mjs/gen245b.mjs/upload.mjs/rkey.ps1 等），未向仓库提交任何产品代码改动；本 PR 仅含本报告文件。
