# 第 75 轮闭环记录（对 review/round75-report 的跟进）

- 体验官报告：`docs/reviews/round75.md`（review/round75-report），P0-P3 全零，2 条观察。
- 观察① 「运行中删除 model.onnx 后设置页仍显 Add-on ready」已按其建议修复合并：PR #140（punctuate 文件缺失路径 push downloaded:false，走既有 onPunctStatus 通道）。
- 打包回归 A-C 全绿（真实下载 281MB add-on → 运行中移走模型 → 设置页未重挂载即实时回退为下载按钮、落字规则断句无 crash；移回后模型标点即刻生效；中文/Alt+Q 核心回归）。证据见 PR #140 评论 + `C:\Users\Administrator\pr140-evidence.md`。
- 如实记录：恢复方向（文件回位后 ready 文案）仍需重挂载才刷新——成功路径不 push 为既有口径，可选对称优化，暂不立案。
- 观察②（punct worker 10 分钟空闲释放）与 ASR 侧同机制，本轮未挂机复验，挂账。
- 体验官另实测确认：#138 图片剪贴板回归通过；punct 模型标点英文效果显著优于规则兜底（"and, then" vs "and. Then"）；sensevoice 自带标点不被二次加工。
- 下轮候选：v0.14 规划轮或竞品对比轮（74-75 连续仅存量边界级问题，主要面多轮全绿）。
