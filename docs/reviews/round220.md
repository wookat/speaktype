# 第 220 轮严格体验官报告（NSIS 安装/升级/卸载 + 多语言后处理三叠加）

- 日期：2026-08-20
- 被测版本：main `fbed141`（产品代码基线 `5eff1fa`，含 PR #310）
- 打包方式：`npm run build && npx electron-builder --win nsis portable` → `SpeakType-Setup-0.15.1.exe` + `SpeakType-0.15.1-portable.exe`（另用临时改版本号 0.15.2 构建覆盖安装用新版安装包，测后删除、版本号已还原未提交）
- 环境：Windows Server 2022，无真实麦克风；fake-mic WAV + mock ASR 注入（本地 8899 OpenAI 兼容端点）；CDP 9333 观测
- 证据级别标注：【实测确认】【推测】【未测试】

## 1. 核心回归：RightCtrl 落字

安装版 0.15.1（`%LOCALAPPDATA%\Programs\SpeakType`）+ fake-mic：RightCtrl 按住→抬起，落字 `The MeetIng is scheduled for 3:30 pm tomorrow afternoon.`（热词 MeetIng 生效、ITN 时刻正常）【实测确认】。

## 2. 专项 a：覆盖安装 / portable 换名 / 卸载干净度

### 2.1 覆盖安装数据保留（旧版→新版）

流程：安装 0.15.1 → 造三件套（settings：hotwords `["MeetIng","SpeakType","张京"]` + `launchAtLogin:true`；history 1 条；词典即 hotwords）→ 静默覆盖安装临时构建的 0.15.2。

- 覆盖后 `speaktype.json` 三件套逐项保留：hotwords 3 条、launchAtLogin、history 原文完整【实测确认】。
- 注册表卸载项 DisplayVersion 更新为 0.15.2、安装目录 exe 替换、快捷方式不重复【实测确认】。
- 运行中升级（app 运行时直接跑安装包）【未测试】：本轮为退出后覆盖安装。

### 2.2 portable 换名升级与自启（#245 回归）

- portable 数据落在 exe 同级 `SpeakType-data`，与 `%APPDATA%\SpeakType` 隔离【实测确认】。
- 换名（`SpeakType-0.15.1-portable.exe` → `MyVoice.exe`）后启动：同级 `SpeakType-data` 数据（hotwords `["PortableMark"]`、launchAtLogin）完整保留【实测确认】。
- 自启注册表：换名启动后 HKCU Run 值更新指向 `MyVoice.exe` 新路径，未出现指向旧文件名的第二条残留【实测确认】。
- 删除旧 exe 后仅凭旧 Run 残留项开机自启失败路径的完整场景（旧值先残留、重启系统验证）【未测试】：本轮观测到 Run 值随启动即被改写为新路径，未构造出稳定残留态。

### 2.3 卸载干净度（#238 回归）

静默运行安装目录下 uninstaller：

- 程序文件目录、桌面/开始菜单快捷方式、注册表卸载项、HKCU Run 自启项（`build/uninstaller.nsh` 负责）全部移除【实测确认】。
- 用户数据 `%APPDATA%\SpeakType` 保留（settings/history/词典/模型不随卸载删除）——符合"卸载不删用户数据"惯例【实测确认】。

本专项无立案。

## 3. 专项 b：多语言长句「增强标点 + 热词 + ITN」三叠加（#294/#308/#310 叠加）

配置：`enhancedPunct:true`（punct-ct 模型下载后热态）+ `itn:true` + 热词族 `HotTerm000/012/099` + `MeetIng/SpeakType/张京/山田太郎`；mock ASR 注入无标点长句，走产品完整 `polish.ts` 链路（localCleanup → 模型标点 → applyItn → correctHotwords）。

| 语言 | 注入（无标点） | 落字结果 | 判定 |
|---|---|---|---|
| 中 | `然后我们下午三点半开会预算大概两千五百块请务必通知张静和hot term 12的负责人顺便把speaktyp的最新文档也带上另外涨幅是百分之三点五需要重新核算一下大家不要迟到` | `然后我们下午3:30开会预算大概2500块，请务必通知张京和HotTerm012的负责人顺便把SpeakType的最新文档也带上，另外涨幅是3.5%，需要重新核算一下，大家不要迟到` | 三点半→3:30、两千五百块→2500块、百分之三点五→3.5%、张静→张京、hot term 12→HotTerm012（不漂 099）、speaktyp→SpeakType、模型标点补逗号，全部叠加无互搏【实测确认】 |
| 英 | `well the meet ing will start at 3 30 pm and the budget review follows at 4.45 pm please make sure hot term 12 and the speaktyp team join on time...` | `Well, the MeetIng will start at 3:30 pm, and the budget review follows at 4:45 pm. Please make sure HotTerm012 and the SpeakType team join on time...` | `3 30 pm`/`4.45 pm` 两种变体均归一冒号时刻（#308）、首字母大写+标点、热词族不漂移（#310）【实测确认】 |
| 日 | `明日の午後の会議には山田太郎さんとhot term 12の担当者が参加しますのでspeaktypの資料を必ず準備しておいてください...` | `明日の午後の会議には山田太郎さんとHotTerm012の担当者が参加しますのでSpeakTypeの資料を必ず準備しておいてください...` | 热词正常；但**未添加任何日文标点（。、）**，见 P3-2201 |
| 英补充 | `...hot term 99 must review it with hot term 0 before 12 45 pm` | `...HotTerm099 must review it with hot term 0 before 12:45 pm.` | 99 命中正常；`hot term 0` 未纠为 HotTerm000（编辑距离 2，超出模糊阈值，属预期行为，观察项） |

处理顺序（标点→ITN→热词）在三语实测中无互搏：ITN 未破坏热词命中，热词纠错未破坏已合成时刻/金额，模型标点未拆散 `hot term 12` 片段【实测确认】。

## 4. 立案汇总

- **P3-2201（新）**：日文长句开启增强标点后完全不加标点（。、均无），中/英同链路正常。现象【实测确认】；根因【推测】为 punct-ct（CT-Transformer）模型仅覆盖中英，日文输入模型不产出标点且本地兜底规则未针对日文补句读。建议：日文场景回落本地 CJK 句读兜底，或在设置说明中标注增强标点语言范围。

观察项（不立案）：
- `hot term 0`→HotTerm000 编辑距离 2 不命中，是 #310 模糊阈值的预期语义。
- 英文大数词（one thousand two hundred）不做 ITN，中文规则不适用，属已知设计边界。
- 日文汉数词（両千五百）不转换；但日文句中出现的中文式表达（三点半/百分之三点五）会被中文 ITN 规则转换，本轮为合成语料，真实日文 ASR 输出（三時半）不会命中该规则【推测】。

## 5. 下轮 Top3 建议

1. P3-2201：日文增强标点兜底修复后回归；顺带补 ko 等其他 CJK 语言标点行为走查。
2. 运行中升级（app 运行时执行新版安装包）与升级后首启迁移逻辑；portable 旧 Run 残留项系统重启级验证。
3. 真机（真实麦克风/手机 remoteMic）端到端仍是最大证据缺口。

## 6. 清场

- 安装版已卸载、portable 测试目录（含 MyVoice.exe/SpeakType-data）删除、临时 0.15.2 安装包删除、`desktop/package.json` 版本号还原未提交。
- 设置恢复默认（asrProvider=local、endpoint/key 清空、enhancedPunct 关闭、itn 恢复、launchAtLogin 关闭）、测试热词与 history 清空、punct-ct 模型删除、HKCU Run 无 SpeakType 残留、mock ASR 与 app 进程退出、临时脚本删除。
