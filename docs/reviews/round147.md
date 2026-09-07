# 第 147 轮体验官审查：转录中强杀韧性 + 词典导入对抗矩阵

基线：main 不变（#230 skill 文档），win-unpacked 沿用（v0.15.0 packaged=true）。真实打包应用全 UI 实测并录屏；强杀/文件状态/hash 用脚本取证。

代码口径：`transcribe.ts` L215-217 仅**完成**时 `saveLastResult()`+`addHistory()`——中途强杀不应产生中间落盘；L48-69 重启 `loadLastResult()` 只加载完成结果，损坏 json 仅 warn。`Dictionary.tsx` L23-33 导入=粘贴+Save：trim、len≤20 过滤、Set 去重、300 上限（amber 提示）。

素材：r147_long.wav（20.9min，r139 内容 ×90 RIFF 拼接），测毕已删除。

## A 转录中强杀

### A2 ~94% 强杀（先执行，转录速度快于预期）——通过
20.9min 音频进度 30s 即达 94%，taskkill /f 落在完成瞬间**之后**：transcribe-last.json 可解析（67 段、finishedAt 在）、历史恰 1 条完整（无半截/无重复）；重启后 Transcribe 页显示完整 67 段结果+完成时间戳（7:17:08），无白屏。状态完全自洽。

### A1 22% 中途强杀——通过
- 强杀前后 transcribe-last.json **MD5 完全一致**（6A8079…16DA，仍为旧 67 段结果）——无半截落盘。
- history.json 无新增条目（r147_long 仍恰 1 条，为 A2 完成的那条）。
- 重启后 Transcribe 页显示**旧完成结果**（7:17:08 / 67 段），不显示 22% 假结果；无白屏。
- main.log 本轮时间窗零 error/uncaught。
- 重转短文件 r139_padded.wav 正常完成（1 段带时间戳，7:20:24）——引擎恢复正常。

## B 词典导入对抗矩阵（基线 3 词 R147A/B/C 预置）
1. 二进制垃圾 256 字节：通过（Save 后仍 3/300、垃圾行全被 len>20 过滤、不崩）。
2. 超长单行 100KB：通过（被过滤、词典不变、粘贴/保存无卡死）。
3. 混合 CRLF/LF+BOM：通过（bomword/crlfword/lfword 三词干净入词 6/300，脚本核验 hotwords 无 CR/TAB/BOM 残留）。
4. 重复词条 ×10：通过（去重只入 1 条 dupword，7/300）。
5. 非法分隔行：通过口径取证（空行/纯制表符行被滤掉；`===`/`---` 按 ≤20 字符文本入词——符合 L24-27 口径，记观察不立案）。
6. 350 词超限：通过（恰 300/300、amber 提示「limited to 300 — 60 word(s) were not added」数字精确（350 新+10 既有−300=60）、既有词不丢）。
7. 导入后立即听写：通过（RightCtrl 整句中文落字 Ln1 Col29——引擎不被 300 词污染）。

## C 回归——通过
- RightCtrl 中文（language=zh）：整句落字（与 B7 合并）。
- 免按 Alt+Q：3 段持续落字（Ln2 Col85）、悬浮条/字幕正常、退出即收。

## 立案
无新立案。中间态不落盘、重启状态自洽、词典解析口径全部符合设计。

## 观察（不立案）
- `===`/`---` 等分隔行会按普通词入词典（trim+len 过滤唯一口径），对听写无实际危害。
- transcribe-last.json 仅存最近一次完成结果；中途强杀丢弃进行中进度属设计取舍（进度不续传），用户重开需重转。

## 清场
bak147 还原：hist=43、stats 122/7089/1018238、lang=zh/theme=system/hold=RightCtrl/mwr=False/provider=local、hotwords=0；transcribe-last.json 删除（测前不存在）；r147_long.wav 删除；系统 mute=False；flag 无；failed-audio=0；进程 0；43117/43998/18099 无监听；防火墙三 False；VB-CABLE 保留；未改产品源码。
