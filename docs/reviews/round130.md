# 第 130 轮体验官审查报告 —— 语言不符轻提示设计论证 + 失败恢复/重试链路专项

- 审查日期：2026-08-17
- 基线：main@ab1e3fa（含 #209/#210，`npm run pack:dir` 全绿，打包实测）
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3×1，设计论证结论 ×1。**

## ① 129 轮观察①设计论证：语言不符轻提示（不立案，另荐更优方案）

- 现状【源码】：sensevoice 走 senseVoice.language=设定语言（localasr.ts worker），无 auto 选项、无输出脚本检测。
- 轻提示方案评估：按「设定 en 但输出多为 CJK」等脚本比例判定误报面大（中英混排、专名、粤语拼音等），且丢字场景下输出本身已残缺、检测信号不稳。**结论：轻提示不立案不推荐。**
- 更优候选【源码支持】：sherpa-onnx senseVoice 原生支持 `language:"auto"`——在识别语言下拉加「自动」并设为默认，比检测提示更根治、改动小（枚举 +1 与 UI 一键）。作为设计建议留给产品决策，不立案。

## ② 专项：失败恢复/重试链路（1 项立案）

选择理由：lastFailed 15s 热键重试窗口、失败态历史条目、跨 provider 恢复从未专审完整链路。方法：provider 设为 OpenAI 兼容 + 不可达 base URL 制造真实失败。

全过部分【实测】：
- 失败反馈清晰：悬浮条红色「Cannot reach the speech recognition service — check your network or switch provider in Settings · Recording kept — press the hotkey again to retry」（实拍）；历史生成 failed 条目（红字 + Retry 按钮 + Cloud API 标签），音频落盘 failed-audio。
- 设置页云端未验证态诚实显示「Configured (untested)」。
- **跨 provider 恢复**：切回本地 sensevoice 后，历史页 Retry 全部成功——条目原地更新为正确文本、provider 标签变 Local offline、toast「Retry succeeded — copied to clipboard」、剪贴板实测有文本、failed-audio 目录清空（3/3）。

**P3-① 立案：错误态热键重试失败后产生重复的失败条目与重复音频文件**——同一段话音：首次失败落一条 failed + 一个 wav；15s 内按热键 retryLast 再失败后**追加第二条 failed 条目 + 第二个字节级相同的 wav**（MD5 一致实证），后续对两条分别 Retry 成功得到两条相同文本的历史记录。与 retryHistory 的原地更新（resolveFailedEntry）口径不一致；用户多次重试会线性膨胀。修法：retryLast 复用既有 failed 条目 id 原地更新（仿 resolveFailedEntry，~几行）。

## ③ 核心回归（全过）

- 识别语言=zh（SOP #211）：RightCtrl 中文「我们明天去公园散步」全对；Alt+Q 免按英文全对【实测】。

## 测毕清场

- SpeakType/notepad/node 进程 0；43117/18099 无监听；无 .part；failed-audio 空
- config/history 由 round130-*.bak 整体还原（321 条）；伪 provider 配置随还原清除
- 防火墙三 profiles OFF；repo 回 main、工作区干净
