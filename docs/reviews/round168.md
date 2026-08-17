# 第 168 轮体验官审查报告

- 日期：2026-08-17
- 基线：main@bd165bc（含 #258/#259/#260）
- 打包：`desktop/ npm ci`（0 vulnerabilities）+ `npm run pack:dir` 成功（speaktype-r168\pack.log），产物 win-unpacked 0.15.1 / Electron 43.3.0
- 证据分级：【实测】打包运行时直接证据；【源码】源码检视；【推测】推断；【未验证】未执行

## 结论：P0=0，P1=0，P2=0，P3=1（#130 文案建议，见 ③）

## ① 核心回归【实测】全过

- RightCtrl 中文（language=zh，sensevoice-small）：按住约 8s → 悬浮胶囊先出紫色波形（shots\10-caption-midhold-zh.png），随后字幕气泡「帮我跟老板。」实时上屏（shots\11-caption-latehold-zh.png）；释放后完整中文句子落入记事本光标处（ss_3bee1814.png），main.log 有对应 dictation finalize。
- 英文抽测（TTS 16k mono WAV）：RightCtrl 按住后释放，落字「Please schedule the design review for tomorrow morning and send the report to the whole team.」全对、大小写标点正确（ss_155c43b8.png）——zh 配置下英文语音仍正确输出英文，符合 sensevoice 多语种行为。
- Escape 中途取消：面板收起、无落字、历史无新条目。

## ② #258/#259/#260 回归【实测】全过

批量粘贴保存「スピークタイプ / 电话回执 / DevinBot / 24 字符超长行 / 纯空白行」（ss_610a82b2.png）：

- #260：琥珀提示「1 word(s) were not added (over the 300-hotword limit or longer than 20 characters)」——超长行不再静默过滤，正确计入未加入提示（第 167 轮观察①已修复）。
- #258：灰色提示「1 word(s) contain Japanese kana — saved, but auto-correction currently only supports Chinese and ASCII words.」——仅计含假名条目，且照常入库（3/300 实拍，空白行被跳过）。
- #259：随后单独保存纯中文「公司」→ 两条提示全部消失（ss_b74e9bd6.png），kanaAdded 仅统计本次新增、不残留。

## ③ #130「Resume download (0% done)」待拍板评价【实测】

复现：杀进程后仅移走 model.int8.onnx（tokens.txt 完好、无 .part）→ 重启进 Settings→Speech recognition：状态「Not configured」、按钮「Resume download (0% done)」（ss_a99ee9b1.png / ss_zoom_fe4e5f6e.png）。点击后正常重新下载并转 Ready（ss_5c75c179.png），功能无碍。

用户视角评价（P3，文案建议）：「Resume + 0% done」自相矛盾——用户从未开始过下载（或模型被外部删除），却被告知「继续」一个 0% 的下载，易误以为存在损坏的半成品。竞品参照：Wispr Flow / Handy 在模型缺失时一律显示普通「Download model (size)」，仅在有真实断点字节时才显示 Resume。建议：progress<1% 或无 .part 分片时显示普通「Download (234 MB)」，Resume (n%) 仅保留给 n≥1 且存在 .part 的真断点场景（判断分支约 2 行）。接受现状亦可用，但该文案对首次/重装用户是可避免的困惑点。

## ④ 专项 a：暗色模式全站走查【实测】全过

选择理由：主题从未做过打包版专项。

- Settings→Theme 下拉「Follow system / Light / Dark」齐备，切 Dark 立即生效、无需重启，hint 文案同步变化（ss_88f1fef1.png）。
- Home / History / Personas / Dictionary / Settings 深色下逐页走查：卡片、徽章（Built-in/Alt+n）、amber/灰提示条、输入框对比度均正常，无白底残留、无低对比文本（ss_54ecf4ae / ss_9fda41be / ss_41564fad.png）。
- 悬浮胶囊深色形态正常：深灰胶囊+紫波形+字幕气泡（ss_c177f147.png、shots\20-panel-altq-dark.png）。
- 切回 Follow system 正常还原。

## ⑤ 专项 b：Alt+Q 免提边界【实测】

- Alt+Q 进入免提：胶囊出波形+实时字幕，字幕区 3 行滚动显示、与 Caption height=3 lines 设置一致（ss_ec8d2e12.png）。
- 连续无停顿音频（fake capture 循环 WAV、无静音段）下，句子只在再次 Alt+Q 退出时一次性落字——与「typed as you pause」设计一致，属测试环境无静音的预期行为，不立案；退出时缓冲文本准确插入当前光标处（含中英混排光标中缝插入，ss_71981937.png）。
- 免提约 50s（voicedMs=36400）稳定无掉字幕、无崩溃；「listening stops by itself after about a minute of silence」的静音自停边界因 fake 音频无静音【未验证】。

## 环境限制

- 真手机麦端到端、云端 provider 真实 key、多显示器、系统深浅色联动（RDP 下系统主题切换受限）沿旧挂账【未验证】。

## 清场

- SpeakType/Notepad 进程停；模型文件已还原（model.int8.onnx + tokens.txt 在位，Ready），无 .part 残留。
- 词典 hotwords 清空、theme 还原 system；防火墙三 profile 保持 OFF（全程未动）。
- repo 回 main@bd165bc，git status 干净（仅新增本报告于 review/round168-report 分支）。
