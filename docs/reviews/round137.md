# 第 137 轮体验官审查报告 —— #219 回归 + 录音中拔出/禁用设备健壮性（VB-CABLE 构造）+ Transcribe 设备解耦

- 审查日期：2026-08-17
- 基线：main@dc45b50（含 #219/#220，`npm run pack:dir` 全绿，打包实测）
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3=0——零立案。**

## ① #219 回归（全过）

- Correct 编辑框输入改动后按 Esc：编辑态关闭、原文完好、history.json 无泄漏改动【实测】。
- 多行编辑（Shift+Enter）Save 后列表展示按换行分两行显示（whitespace-pre-wrap 生效），存储 `\n` 完整【实测】——136 轮两条观察均消除。

## ② 专项 a：录音中禁用/恢复输入设备健壮性（全过）

选择理由：136 轮挂账项，本机 VB-CABLE 可用 Disable-PnpDevice 构造真实「设备中途消失」。

- 选定 CABLE Output 为麦克风、话音经虚拟声卡推入、按住 RightCtrl 录音 3 秒后禁用该 AudioEndpoint：**应用不崩**、录音会话继续、松键正常 finalize，已捕获的前段话音正确转写落字（首句「The overall architecture of this project includes the front end interface.」），禁用后音频停止流入（voicedMs 只计禁用前）【实测】。
- 设备重新启用后**无需重启应用**直接听写恢复全对【实测】。
- 设备处于禁用态时发起新录音：不崩溃、仍成功捕获并转写全对——话音继续流入【实测】；机制【推测】为 Chromium getUserMedia 对失效 deviceId 回退默认设备且底层 MEDIA 设备（ROOT\MEDIA\0000）未禁用，仅端点隐藏；对用户表现为无感降级，无缺陷。
- 物理 USB 拔出（连电气断开）与本构造仍有差异【未验证】。

## ③ 专项 b：Transcribe × 设备解耦（全过）

- 输入设备禁用期间转录 25 秒长音频：全文完整出段（含 ITN：35,000/October 15/3 pm），TXT 导出与展示一致——文件转录不依赖录音设备【实测】。

## ④ 核心回归（全过）

- language=zh：RightCtrl 中文「我们明天去公园散步」全对（设备恢复后链路）；Alt+Q 免按英文「The review and the report are done today.」全对【实测】。

## 测毕清场

- CABLE Output 端点已重新启用（Status OK）；SpeakType/notepad 进程 0；43117/18099 无监听；无 .part；failed-audio 空
- config/history 由 round137-*.bak 整体还原（micDeviceId/language 测试改动随还原清除，编辑测试条目清除）；导出测试文件 Downloads\longen.txt 删除
- 防火墙三 profiles OFF；repo 回 main、工作区干净
