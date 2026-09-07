# 第 105 轮体验官审查报告 — #186 回归 + ja/ko/zh-TW 三语深度一致性专项

- 基线：main @ `9c6a851`（含 #186/#187），`npm run pack:dir` 退出码 0，打包版实测
- 环境：Windows Server 2022，虚拟声卡
- 口径：【实测】/【源码】/【未验证】/【推测】

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

零新立案，观察 ×2。

## ① #186 回归【实测】过

- 只读态（attrib +R）：改 Hold threshold 120→200——弹 toast「Couldn't save settings — The config file couldn't be written (read-only or no permission). Changes will be lost after restart.」且 **UI 值即时回弹 120**（内存 store 未污染，行为比修复前更优）；磁盘未写入；main.log 无 uncaughtException。ja 下同场景 toast 全日文（「設定を保存できません…」）实拍。
- 解除后（attrib -R）：同一改动 UI 保持 200，磁盘即时落盘 `holdDelayMs=200` 核实。

## ② ja/ko/zh-TW 三语深度一致性专项

**源码级完整性**：五语 locale 各 355 键逐一对齐，无缺键；与 en 同值项仅 6 个技术名词（Base URL/Doubao/ChatGPT/`{{name}} (Alt+{{index}})`），属合理不译；renderer 全量 grep 无硬编码英文句。

**运行时实拍矩阵**（页面 × 语言，全部通过）：

| 页面 | ja | ko | zh-TW |
|---|---|---|---|
| Home（含折叠引导卡/人设卡/统计） | 过 | 过 | 过 |
| 设置·通用（全部滚查） | 过 | 过 | 过 |
| 设置·语音识别 | 过 | 过 | 过 |
| 设置·AI 润色（AI 文章調整/AI 다듬기/AI 潤色） | 过 | 过 | 过 |
| 设置·关于 | 过 | 过 | 过 |
| 历史（含删除→Undo toast） | 过（「エントリを削除しました/元に戻す」実拍） | 过 | 过 |
| 词典（含两步清空确认） | — | — | 过（「清空全部熱詞？再點一次」实拍） |
| 人设（含 #176 优先级 hint） | — | — | 过 |
| 转录页 | 过 | — | 过 |
| 托盘菜单 | 过（開く/音声認識を設定/終了） | — | — |
| saveFailed toast（#186 新文案） | 过（全日文） | — | — |

未见漏翻、未替换占位符（Alt+1..9、0/300、toast 插值均正常）、无溢出截断。近 20 轮新增文案（转录页、Undo、两步确认、折叠展开、saveFailed）三语抽样全就位。

观察①（不立案）：ja 侧栏「ファイル文字起こし」折两行显示——无截断可读性完好，若追求单行可缩短为「文字起こし」（文案级）。
观察②（不立案）：Home 引导卡折叠态右上按钮三语复用 history.expand（「展開全文」等），语义可通；如需更贴切可为卡片单设「展开」键（文案级）。

## ③ 核心回归【实测】过

RightCtrl 中文「今天下午3点开会，预算是5200元」含 ITN + Alt+Q「我们明天去公园散步」准确落字。

（测试摩擦记录：向 PowerShell 脚本以命令行参数传中文给 System.Speech 会因编码折损静音，改用 zh 语音文件驱动即稳；非产品问题。）

## 清场记录

- attrib -R 已解除核实；词典测试词清空且 dictionary.json 无残留；导出 txt 已删；配置/历史还原；latest-release.json/transcribe-last.json 删；进程 0；无 .part；43117 无监听；防火墙三 profile 保持 OFF。

## 下轮候选

1. 两条文案级观察（ja 侧栏短词 + 引导卡独立展开键）若采纳一并回归。
2. 度量脚本第三数据点随下个发版跑。
3. 真手机麦/云端 key 补账（挂账）。
