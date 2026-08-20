# 第 226 轮严格体验官报告

- 日期：2026-08-20
- 基线：main `5ff8436`（含 PR #317 繁体 ITN 字表修复）
- 测试对象：本机重新打包的 NSIS 安装版（`npm run build` + `npx electron-builder --win nsis`，产物 `SpeakType-Setup-0.15.1.exe`；另临时构建 `SpeakType-Setup-0.15.2.exe` 仅用于安装器测试，测试后删除、版本号还原）
- 手法：无真实麦克风，`--use-file-for-fake-audio-capture` fake-mic WAV + 本机 mock ASR（`/v1/audio/transcriptions`，端口 8899）注入文本 + CDP（9333）读取历史/设置；punct-ct 为真实模型（HF 下载，294,372,519 字节，热态测试）
- 证据级别：【实测确认】= 本轮打包版直接观测；【推测】= 由源码/行为推断；【未测试】= 本轮未覆盖

## 一、回归

### 1.1 #317 繁/简 ITN 回归 —【实测确认】通过

- 繁体：`明天下午三點半開會預算是兩千五百塊…提前十分鐘…` → `三點半→3:30`、`兩千五百塊→2500塊`、`十分鐘→10分鐘`，全部归一正确。
- 简体对照：`明天下午三点半开会预算是两千五百块请通知团队提前到场` → `明天下午3:30开会，预算是2500块，请通知团队提前到场`，无回归。

### 1.2 RightCtrl 核心落字 —【实测确认】通过

- 打包版按住 RightCtrl 口述（fake-mic WAV）→ 松开 → 文本落入 Notepad，历史正常累计；日志 `dictation finalize: durationMs=3871 maxPeak=32623 voicedMs=2920`。

## 二、专项 a：交互式安装器 Cancel 分支 + perMachine（all-users）路径

### 2.1 Cancel 分支（运行中取消安装）—【实测确认】通过，旧版完好

步骤：旧版 0.15.1（per-user）运行中（8 进程、历史 23 条）→ 交互式双击 `SpeakType-Setup-0.15.2.exe` → Options（默认 Only for me，提示 "There is already a per-user installation. Will reinstall/upgrade."）→ Next → Install → 进度中弹 "SpeakType is running. Click OK to close it." 对话框 → 点 **Cancel**。

结果：
- 安装器立即整体退出，无残留安装器进程；
- 旧版 app **未被杀**，8 进程照常运行，主窗/托盘正常；
- 程序目录逐文件时间戳与安装前一致（无半写入的 0.15.2 文件），`SpeakType.exe` 版本仍 0.15.1，HKCU Uninstall 注册表仍 `SpeakType 0.15.1`；
- 取消后立即口述一条落字成功（历史 23→24），设置/历史无损。

结论：Cancel 分支干净——NSIS 在关闭运行实例前不写程序文件，取消即全身而退，无立案。

### 2.2 perMachine / all-users 安装与升级路径 —【实测确认】支持

- `electron-builder.yml` 中 `nsis.perMachine: false` 只是默认值；assisted 安装器首页提供 "Anyone who uses this computer (all users)" / "Only for me" 单选（截图见 PR 评论），选 all users 后提示 "Fresh install for all users. (will prompt for admin credentials)"，目标目录自动变为 `C:\Program Files\SpeakType`。
- 实测（Administrator 账户，无 UAC 弹窗直接提权）：per-user 0.15.1 运行中执行 all-users 0.15.2 安装 → 安装完成：
  - `C:\Program Files\SpeakType\SpeakType.exe` = 0.15.2，HKLM Uninstall 出现 `SpeakType 0.15.2`；
  - 旧 per-user 安装目录 `%LOCALAPPDATA%\Programs\SpeakType` **被自动整体移除**，HKCU Uninstall 条目同步清除——per-user→per-machine 迁移不留双份；
  - 用户数据（`%APPDATA%\SpeakType` 设置/历史/词典）保留，升级后首启历史 24 条完整，口述落字成功（24→25），日志 `SpeakType 0.15.2 starting (packaged=true)`。
- 两处小瑕疵（见 P3-2261）：
  1. all-users 安装过程中旧运行实例被**静默终止**，未见 "SpeakType is running" 对话框（per-user 路径会弹）；对无保存状态的托盘应用影响有限，但与 per-user 路径行为不一致。
  2. HKLM Uninstall 条目 `InstallLocation` 为空字符串（HKCU 条目历轮为正常路径）。
- 非 Administrator 标准用户下的 UAC 凭据弹窗路径【未测试】（本机仅 Administrator 账户）。

## 三、专项 b：P3-2241②（punct-ct 繁体词内插逗号）设计调研

### 3.1 量化实测 —【实测确认】

方法：真实 punct-ct 热态（模型加载后连续测试），`itn+enhancedPunct` 开启，10 组内容对应的繁/简长句对 + 第 224 轮原句，共 **11 对**，经 mock ASR→打包版全后处理链路，取历史输出对照。

判定标准（严格）：
- **词内拆断**：逗号插入词典词内部（如 `預算→預，算`）；
- **搭配拆断**：逗号插入不可分的「动+宾/代」紧邻搭配之间（如 `請幫，我`）；
- 仅「该断未断/断句位置生硬但语法成立」不计破坏。

结果：

| 组 | 繁体样本破坏 | 简体对照 |
|---|---|---|
| 词内拆断 | 1/11（`預算是兩千五百塊→預，算是2500塊`） | 0/11 |
| 搭配拆断 | 3/11（`請幫，我把`、`麻煩，你確認`、`明天下午，3:30開會`） | 0/11 |
| 合计破坏率 | **4/11 ≈ 36%** | **0/11** |

另观测：繁体样本漏标点也更多（如 `新版本屆時需要`、`市場分析競爭對手動態` 未断），简体对照断句自然。代表性完整输出对照见 PR 评论。对照组（enhancedPunct 关）繁体输出无任何词内破坏（第 224 轮已证，本轮沿用结论）。

根因【推测】：punct-ct（zh-en vocab272727）训练语料以简体为主，繁体字对模型近似 OOV，token 边界判断退化，逗号落点随机化。

### 3.2 三选一论证

| 方案 | 评估 |
|---|---|
| (i) 繁体占比高 → 跳模型走规则回退（同 Hangul 门） | **推荐**。实现小（`applyModelPunctuation` 一个繁体字符集占比门，先例 #315 Hangul 门已验证）；消除 36% 破坏率的词内/搭配错标；代价是繁体标点密度下降（回退规则只按停顿/长度断句），但「少标点」优于「错标点破坏语义」 |
| (ii) 简繁转换→模型→换回 | 不推荐现阶段做。需引入 OpenCC 级转换依赖；简繁一对多（发/髮、后/後、面/麵…）换回有错字风险，等于用「标点破坏」换「错别字破坏」；字符数不变的前提脆弱（词汇级转换会变长度），对位换回工程量与风险都高 |
| (iii) 保持现状 | 不推荐。36% 破坏率是用户可见的语义损伤（`預，算`），且繁体用户开增强标点即中招，无自救手段（除手动关闭） |

**推荐：(i)**——判定门建议用「繁体特征字符（仅繁体用字集）占 CJK 字符比例 > 阈值（如 20%）则跳过模型」，与 Hangul 门共用回退路径；简体/混排文本不受影响（本轮简体 11/11 零破坏）。以上为设计推断【推测】，量化证据为实测。

## 四、立案

| 编号 | 级别 | 内容 | 证据 |
|---|---|---|---|
| P3-2241② | P3（维持） | punct-ct 繁体词内/搭配插逗号，破坏率 4/11≈36%（词内 1 + 搭配 3），简体对照 0/11；推荐方案 (i) 繁体门跳模型走规则回退 | 【实测确认】量化 +【推测】根因/方案 |
| P3-2261 | P3（新） | all-users 安装路径两处不一致：① 运行中实例被静默终止，无 per-user 路径的 "SpeakType is running" 确认对话框；② HKLM Uninstall `InstallLocation` 为空 | 【实测确认】 |

## 五、下轮 Top3 建议

1. 实施 P3-2241② 方案 (i)（繁体门），用本轮 11 对句子做修复后回归（预期繁体破坏 0、简体不变）。
2. P3-2261：all-users 路径运行实例提示一致性 + InstallLocation 补全；顺带补标准用户 UAC 凭据路径（如可建测试账户）。
3. 真机端到端（真实麦克风/手机 remoteMic）仍为长期欠账【未测试】。

## 六、清场

- 停 app/mock/Notepad；卸载 all-users 0.15.2 并清 HKLM 条目；删除 punct-ct 模型、临时 0.15.2 安装包、`tw226.ps1`、`mock_asr_text.txt`；历史/设置重置；`desktop/package.json` 版本还原 0.15.1；仓库工作区干净（详见 PR 评论清单）。
