# 第 136 轮体验官审查报告 —— #217 静音修复回归 + 音频设备切换态（VB-CABLE 首测）+ Correct 编辑框细节

- 审查日期：2026-08-17
- 基线：main@514a6d0（含 #217/#218，`npm run pack:dir` 全绿，打包实测）
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3=0——零立案，观察 ×2。**

## ① #217 回归（全过）

探针先自验：CoreAudio SetMute/GetMute 往返 set1→True、set0→False 一致后才取证【实测】。

1. 常规链路：未静音 → 录音中 muted=True → 落字后 muted=False，恢复干净。
2. **已静音不再反转**（135 轮 P3 表现①消除）：手动 muted=True 后录音，录音中/结束后均保持 True，系统状态全程未被触碰。
3. **强杀残留兜底恢复**（表现②消除）：录音中强杀进程后 muted=True 且 muted-by-recording 标志落盘在位；重启应用后 muted=False、标志清除——启动兜底路径运行时实证。

## ② 专项 a：音频设备切换态（VB-CABLE 首测，全过）

选择理由：VB-CABLE 到位后首次具备多输入设备条件，设置页麦克风枚举/切换/E2E 从未可测。

- 麦克风下拉正确枚举「Auto detect (system default)」+「CABLE Output (VB-Audio Virtual Cable)」【实测】。
- 选 CABLE Output 后点 Test：向 CABLE 渲染端播放语音，级别条实时响应；ffmpeg 从 CABLE Output 采样 mean -20.4dB/max -0.2dB 确认链路含真实话音【实测】。
- E2E：CABLE Output 为麦、话音经虚拟声卡推入 → RightCtrl 听写「我们明天去公园散步」全对（maxPeak=32767, voicedMs=1600）【实测】——micDeviceId 选择在打包运行时真实生效。
- 录音中拔出/禁用设备的健壮性本轮未构造【未验证】。
- 取证更正：一度怀疑 Test 级别条不响应，实为播放脚本内联 $ 转义丢失导致根本没在放音；改脚本文件重放后级别条正常响应，非产品问题。

## ③ 专项 b：Correct 编辑框交互细节（全过，观察 ×2）

选择理由：Correct 的多行/空文本/按键行为从未专审。

- 空文本 Save：编辑框关闭、原文完好、history.json 未变——`trim` 后空值明确拒改【实测+源码】。
- 多行编辑（Shift+Enter 换行 + 追加行）Save：按 `\n` 完整持久化，Copy/导出不丢换行【实测】。
- 观察①（不立案）：Esc 在编辑框内不关闭编辑态（有 Cancel 按钮，键盘路径缺失，习惯性微瑕）。
- 观察②（不立案）：列表展示对含 `\n` 的文本折行合并显示（div 无 whitespace-pre-wrap），数据无损（存储/复制均含换行），仅展示态压平；随他改可加 `whitespace-pre-wrap`。

## ④ 核心回归（全过）

- language=zh：RightCtrl 中文「我们明天去公园散步」全对（经 VB-CABLE 链路）；Alt+Q 免按英文「The review and the report are done today.」全对【实测】。

## 环境说明

- 本机渲染端点仅 VB-CABLE 两个（Speakers/CABLE In 16ch），无其他扬声器设备，默认输出保持 VB-CABLE 不需还原。

## 测毕清场

- SpeakType/notepad 进程 0；43117/18099 无监听；无 .part；failed-audio 空；muted=False
- config/history 由 round136-*.bak 整体还原（micDeviceId/language/muteWhileRecording 测试改动随还原清除；321 条历史复原，多行编辑测试条目清除）
- 防火墙三 profiles OFF；repo 回 main、工作区干净
