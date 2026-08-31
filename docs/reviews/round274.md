# 第 274 轮体验官报告（user-experience-officer + qa-engineer）

- 日期：2026-08-31
- 被测版本：main @ 6a0f1f0（v0.17.0，含 #366），打包版 `npm run pack:dir` → `desktop/release/win-unpacked/SpeakType.exe`
- 环境：Windows Server 2022 全新 VM，无真实麦克风（Chrome fake-mic WAV 循环）、无音频输出设备；热键用 SendInput 合成（rkey.ps1 重建）
- 构建验证：`npm install` / `npm run typecheck` / `npm run build` / `npm run pack:dir` 全部通过（0 错误）

## 结论

核心链路（RightCtrl 落字、Alt+Q 免按多句自动分段、Esc 取消）全部通过；#366 可行动报错 zh-CN/en 双语实测通过、恢复无回归；专项 4 项（①设置导入导出、②按应用人设规则、④F8 选中改写 mock 链路、③5 语言 UI 走查）全部通过。**本轮无 P0/P1/P2 立案**；1 个 P3 观察项经源码核对已解释为非缺陷。

## 立案项

### 274-1（P3 → 复核后撤销立案：非缺陷，观察项）Esc 取消后 main.log 仍出现 `dictation finalize` 日志

- 现象（实测）：按住 RightCtrl 约 3s 后按 Esc，UI 正确（取消 toast、Notepad 无落字、History 无条目），但 main.log 随后仍打出 `dictation finalize: durationMs=5650 maxPeak=32763 voicedMs=4040`。
- 复核（源码推断，`desktop/src/main/dictation.ts`）：该日志行在 `finalize()` 入口处无条件打印（L824–826）。合成热键序列中 Esc 落在 RightCtrl 松键之后，松键已触发 `finalize()` 进入转写阶段；此时 Esc 走 `cancel()` → `finishCancelled=true; finishing.cancel()`（L633–636），`session.finish()` 抛出后由 `abortFinish()` 收尾（L846–849）：丢弃结果、停麦、回 idle、取消 toast。日志只是 finalize 入口标记，不代表落字。
- 结论：行为符合设计（转写阶段取消路径），无用户可见影响，不立案。若希望日志更可读，可在 abortFinish 处补一条 `finalize aborted by cancel` 日志（可选优化，非必须）。
- 证据：`ss_4231b956.png`（取消 toast + Notepad 无落字）+ main.log 时间线。

## 测试明细（全部为打包版实测，除标注外）

| 项 | 结果 | 证据 |
|---|---|---|
| 回归：RightCtrl 按住说话 → 中文整句落入 Notepad，log finalize，History 显示本地离线 | 通过 | ss_ba94b692.png |
| 回归：Alt+Q 免按多句，WAV 循环 ≥2 句自动分段分别落字，退出后胶囊消失 | 通过 | ss_b65af3d2.png |
| 回归：Esc 取消 → 无落字 + 取消 toast | 通过 | ss_4231b956.png |
| #366 zh-CN：改名 `resources\app.asar.unpacked\node_modules\sherpa-onnx-node` 后按住说话 → toast「识别引擎文件缺失或损坏：重启 SpeakType 可自动修复；若仍失败请重新安装」，未泄漏原始 `Cannot find module`（原始错误仅在 log） | 通过 | ss_e90a59a0.png / ss_zoom_c3796ebe.png |
| #366 en：uiLanguage=en → "Speech engine files are missing or damaged — restart SpeakType to repair; reinstall if it persists" | 通过 | ss_1afb6302.png / ss_zoom_a46612f2.png |
| #366 恢复：目录改回后冷启动 `sherpa worker started (sensevoice-small)`，中文听写恢复，无回归 | 通过 | ss_c3b619e6.png |
| ① 导出：`speaktype-config-2026-08-31.json` 含 app/configVersion/settings/personas，不含 polishApiKey/asrApiKey/doubaoAppKey/micDeviceId 等敏感字段 | 通过 | 导出文件内容核对 |
| ① 旧版导入：含未知字段/错类型/非法 localModel/非法 captionLines/凭据字段的构造文件导入成功，提示「跳过 5 个字段」；theme=dark 即时生效；非法值未入库；hotkeyToggle=Alt+Space 入库但 UI 回退显示 Alt+Q；再导入本轮导出文件完整还原 | 通过 | ss_6326b8f9.png / ss_7554ee56.png |
| ② 按应用人设：规则 notepad→「面对老板」，Notepad 前台听写 history.personaName=面对老板；反例（SpeakType 前台）personaName=全局人设「语感编程」，规则未误命中 | 通过 | history.json 核对 |
| ④ F8 选中改写：本地 mock OpenAI 端点（127.0.0.1:8975）连接测试成功，选中文本被替换为 `[REWRITTEN-BY-MOCK]`，mock 日志收到含原选中文本的 /v1/chat/completions 请求 | 通过 | ss_1079c6b7.png / mock_chat.log |
| ③ 5 语言走查（ja/ko/zh-TW × Home/设置-语音/通用/历史）：切换即时生效，未见截断/溢出 | 通过 | ss_75051804.png / ss_b73f6097.png / ss_17ea17fb.png / ss_b1acfbac.png |

## 未测试项（如实声明）

- 真实麦克风/真实音频设备路径：本 VM 无音频设备，全程 fake mic，标 untested。
- 「录音时静音其他应用」开关：无音频输出设备，无可观察效果，untested（历史轮同）。
- 免按 30 分钟级长会话稳定性（专项⑤）：本轮未选做。
- 备注（非缺陷）：zh-TW 下人设名等历史数据字段不随 UI 语言翻译——数据即所存值，属预期。

## 环境清理

sherpa-onnx-node 已改回（无 .bak 残留，实测恢复听写）；appPersonas 测试规则已删；全局人设/uiLanguage/theme/polishEnabled 均还原；SpeakType/Notepad/mock node 进程已全部关闭；测试临时目录已清理。

## 证据归档（测试机本地）

- 录屏：`C:\Users\Administrator\screencasts\rec-dfc94fc6-3d47-4e77-8972-ce36f8739809\rec-dfc94fc6-3d47-4e77-8972-ce36f8739809-edited.mp4`
- 截图：`C:\Users\Administrator\screenshots\`（编号见上表）
- 测试资产：`C:\Users\Administrator\tts\r274\`（test_plan_274.md、legacy_import.json、mock_chat.log）
