# 第 224 轮严格体验官报告（UX Acceptance Review）

- 日期：2026-08-20
- 基线：main `a77a45c`（含 PR #315 韩文跳过 punct-ct 修复）
- 构建：`npm run build` + `npx electron-builder --win nsis`（0.15.1 正式包 + 临时 0.15.2 升级包，测试后已删除并还原版本号）
- 环境：Windows Server 2022，无真实麦克风（fake-mic WAV + mock ASR + CDP），punct-ct 模型真实下载后实测
- 证据级别标注：【实测确认】/【推测】/【未测试】

## 1. 回归：#315（ko/ja/zh/en 四语）+ RightCtrl 核心落字

全部通过【实测确认】（mock ASR 注入 + RightCtrl 触发，enhancedPunct+ITN+热词开启，punct-ct 已下载热态）：

| 语言 | 输入（无标点） | 输出 | 结论 |
|---|---|---|---|
| ko | 내일 오후 세시 반에 회의가 있으니 … 연락해 주세요 | 词间空格全部保留，原样落字 | P2-2221 修复生效，不再吞空格 |
| ja | 明日の午後三時に会議がありますので資料を準備してください よろしくお願いします | … so資料を準備してください。 …（ので 不误断，ください 后补 。） | #313 无回归 |
| zh | 明天下午三点半开会预算是两千五百块请通知山田太郎提前到场 | 明天下午3:30开会，预算是2500块，请通知山田太郎提前到场 | 标点+ITN+热词无回归 |
| en | the meeting with hot term 12 … three thirty pm … speaktype team … | The meeting with HotTerm012 … the SpeakType team …（句首大写+句号+热词） | 无回归 |

RightCtrl 核心落字（Notepad 焦点回填）全程正常【实测确认】。

## 2. 专项 a：交互式（非静默）NSIS 安装器在 app 运行中的路径

流程：安装 0.15.1（/S）→ 启动 app（4 条历史 + hotwords 含 R224Marker + mock 设置）→ 双击 0.15.2 安装包走完整交互向导。全绿【实测确认】：

1. 「Choose Installation Options」页正确预选 Only for me，并明确提示 *"There is already a per-user installation… Will reinstall/upgrade."*
2. 「Choose Install Location」正确预填现有目录 `AppData\Local\Programs\SpeakType`。
3. Install 后弹出 **"SpeakType is running. Click OK to close it."** 对话框；点 OK 后运行中的 7 个 SpeakType 进程被全部终止（无卡死、无强杀残留、无双实例），安装继续完成。
4. Finish 页勾选 Run SpeakType 首启成功，UI 显示 v0.15.2、Sessions=4。
5. 数据完整性：`speaktype.json` 设置（hotwords 4 条含 R224Marker、asrBaseUrl）与 `history.json`（4 条 + stats words=133/sessions=4）全部保留；开始菜单快捷方式存在。
6. 升级后立即再做一次 mock 听写，正常落字并入库（第 5 条，热词命中）【实测确认】。

未测试：Cancel 该对话框后的安装器行为分支、all-users（perMachine）安装路径【未测试】。

## 3. 专项 b：zh-TW 繁体中文后处理行为

mock 注入繁体长句（enhancedPunct+ITN 开启）【实测确认】：

- 输入 A：`明天下午三點半開會預算是兩千五百塊請大家準備相關資料並且提前十分鐘到達會議室謝謝配合`
- 输出 A：`明天下午，三點半開會預，算是兩千五百塊，請大家準備相關資料，並且提前十分鐘到達會議室，謝謝配合`
  - **逗号插进「預算」词中间**（開會預，算是）→ 语义破坏
  - `三點半` 未转 3:30、`兩千五百塊` 未转 2500塊（简体等价句均转换成功）
- 输入 B：`會議改到明天下午三點半預算增加到三千塊另外時間是4.45 pm結束`
- 输出 B：`會議改到明天下午三點半預算增加到3000塊。另外，時間是4:45 pm結束`
  - `三千`→3000 转换成功、`4.45 pm`→`4:45 pm`（#308）正常；但 `三點半` 仍不转换
- 对照组（enhancedPunct 关）：文本原样保留、无标点破坏【实测确认】。

**立案 P3-2241**：繁体中文后处理支持不完整——① ITN 数词/时刻映射缺繁体变体（`兩`、`點` 不识别，`三千` 可转说明仅部分字表缺失）；② punct-ct 对繁体输入会把逗号插入词内（預算 被拆），可读性受损。根因判断为字表/训练语料以简体为主【推测】。建议：ITN 映射补繁体字表（兩→两、點→点 等价归一后处理），繁体占比高时对模型标点结果做保守校验或回退规则句读。

## 4. 立案汇总

| 编号 | 级别 | 描述 | 证据 |
|---|---|---|---|
| P3-2241 | P3 | zh-TW 繁体：ITN 缺繁体数词/时刻字表（兩/點），punct-ct 逗号拆词（預算） | 实测确认（根因推测） |

P2-2221（ko 吞空格）本轮验证修复关闭。零 P0/P1/P2 新立案。

## 5. 下轮 Top3 建议

1. 修 P3-2241（繁体字表归一 + 繁体标点保守化）后 zh-TW 回归。
2. 交互式安装器 Cancel 分支与 all-users（perMachine）安装/升级路径。
3. 真实麦克风/手机远程麦真机端到端（硬件到位时）。

## 6. 清场

已完成【实测确认】：卸载 0.15.2（/S）+ 删除 %APPDATA%\SpeakType（含 punct-ct 模型）、临时 0.15.2 安装包删除、package.json 版本还原（工作区干净）、mock ASR 进程与 mock 文本删除、测试历史/设置清空、HKCU Run 无 SpeakType 项、Notepad 关闭。

## 7. 未测试区域（诚实声明）

- 真实麦克风、手机、外接设备。
- 系统级重启验证。
- 交互式安装器 Cancel/中途退出分支、perMachine 安装。
- doubao/chatgpt 真实登录态云通道。
