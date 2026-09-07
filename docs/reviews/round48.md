# SpeakType 第 48 轮严格审查报告 —— v0.11→v0.12 覆盖升级独立复核 + 免按回归 + 长文本挑刺

- 审查对象：Release Setup v0.11.0 → v0.12.0 覆盖安装（真实安装器）；最新 main@b5d9fa2（含 #100/#101/#102）pack:dir
- 审查方式：【实测】= 真机验证；【源码】= 代码走查；【未验证】= 如实标注
- 环境：Windows Server 2022；原 %APPDATA%\SpeakType 备份移出，测毕整体还原

## 结论总览

| 级别 | 数量 | 内容 |
|------|------|------|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 0 | — |
| P3 | 1 | 英文场景「Words generated / Time saved」统计按字符数计，虚高约 5 倍 |

## 1. v0.11.0 → v0.12.0 覆盖升级独立复核 —— 全绿

【实测】流程：装 Release v0.11.0 Setup（103,240,739 字节）→ 造数据（词典 2 词 Zalize/SpeakType、历史 1 条、Theme 显式设为 Dark）→ 应用保持运行状态直接跑 v0.12.0 Setup 覆盖装：

- 安装器正确检测旧装：「There is already a per-user installation… Will reinstall/upgrade.」；检测到应用运行弹「SpeakType is running. Click OK to close it.」，点 OK 自动关闭继续，全程无报错。
- 升级后首启：版本 0.12.0（About「SpeakType 0.12.0 (a0f2e5d)」，无新版横幅——预拨 v0.12.0 同版本不显示，正确）。
- 数据保留逐项核对：词典 2/300 hotwords 原样；历史 1 条「Upgrade test data sentence.」原样（时间/时长/通道齐全）；`speaktype.json` `theme=dark` 保留且 UI 深色；统计卡数字延续。
- 升级后落字正常：RightCtrl 口述「Dictation still works after upgrade.」逐字准确。

**新 P3：英文统计语义虚高**。【实测+源码】造数据阶段口述 1 句 4 个英文单词（27 字符），Home 显示「Words generated 27 / Time saved 56s」。源码 dictation.ts:688 `addStats(text.length, …)` 按**字符数**入账，Home.tsx:23 `saved = round(words/40)*60000 - duration` 又按「40 词/分钟」换算——中文字符≈词没问题，英文字符≈5 倍词数，导致英文用户两项指标虚高约 5 倍（实拍 4 词句显示 27 词、省 56 秒，与公式复算逐位吻合）。修法：入账处按内容分流——拉丁文本 `text.split(/\s+/).length`、CJK 按字符，混排两者相加（~6 行，只改 addStats 调用处的计数函数，无迁移问题；历史累计值无法追溯修正，可如实保留）。

## 2. 免按回归（main pack:dir，含 #100/#101）—— 全过

- 【实测】Alt+Q 进免按：两句连续口述「Hands free first sentence lands here. And the second one follows.」——两句全落、句间自动补空格、再按 Alt+Q 正常退出。
- 【实测】双击 RightCtrl 进免按：双击进入 → 口述「Double tap entry works fine.」落字准确 → 双击退出正常。
- 测试插曲（非产品缺陷，如实记录）：自动化脚本首次在 SpeakType 自身窗口前台时触发免按，落字被主窗口吞掉且录到静音（maxPeak=0 日志），聚焦 Notepad 后全部正常——属测试端焦点管理问题。

## 3. 自由挑刺：长文本（>500 字符）单句听写 + 历史展示 —— 表现优秀

- 【实测】659 字符英文长段（含数字/百分比/专有结构）单次 hold 口述约 42 秒：落字 631 字符**近逐字**，ITN 三处全对（forty percent→40%、two hundred→200、eighty seven→87），无丢句无乱序，长按全程稳定。
- 【实测】历史页长条目完整换行展示、不截断不破版，时间/时长（42s）/通道标注正常；Copy/Correct/Delete 按钮不被长文本挤压。
- 观察（不立案，测试端诱发）：自动学词学入垃圾映射（"one"→"fine"，由脚本整段替换诱发）后，后续句子的识别被 hotword 偏置带偏（「second one follows」被写成「the works fine follows」）——真实用户若误学垃圾词同样会反噬识别质量，Undo/词典删除是现有救济；第 38 轮已立案的失焦快照竞态修复（BLUR 前重读）落地后此类误学频率会进一步下降，无需新立案。
- 【未验证】长文本口述期间字幕悬浮条滚动行为（脚本模式无法同步观察，可下轮专项）。

## 4. 下一轮候选（按优先级）

1. P3 英文统计计数修正（~6 行）落地回归。
2. 云端成功路径补测（继续等有余额的 key）。
3. 长文本字幕悬浮条滚动/CPU 专项（口述期间实时观察）。

## 5. 清场记录

- 测试安装（0.12.0 升级版）已静默卸载：Programs 目录不存在、卸载注册表 0 条
- %APPDATA%\SpeakType 已从备份整体还原（含模型 5 项，配置为原配置），无 .part
- 两个 Setup 包已删除；SpeakType/Notepad 进程 0
- 防火墙三 profile 保持 OFF（未执行任何开启命令）
- 未修改任何产品代码
