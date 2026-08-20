# 第 228 轮体验官报告（#319 回归 + P3-2261 复核与 NSIS 论证 + 配置导入导出/zh-TW UI 走查）

- 日期：2026-08-20
- 基线：main `b072762`（fix(punct): 繁体高占比输入跳过 punct-ct 走规则回退 + 规则断句补繁体连接词（第 226 轮 P3-2241②）(#319)）
- 方法：`npm run build` + `npx electron-builder --win nsis` 打 `SpeakType-Setup-0.15.1.exe`，fake-mic WAV + 本地 mock ASR（127.0.0.1:8899），CDP 断言，punct-ct 热态（模型 294,372,519 字节、ready 100%）。无真实麦克风/手机/标准用户账户，相关点标【未测试】。

## 1. 回归：PR #319 繁体门 + RightCtrl

| 用例 | 输入（mock ASR 原文） | 落字结果 | 结论 |
|---|---|---|---|
| 简体（走模型） | 明天下午三点半开会预算是两千五百块请通知团队提前到场 | `明天下午3:30开会，预算是2500块，请通知团队提前到场` | 模型逗号正常、ITN 正常【实测确认】 |
| 繁体（跳模型） | 明天下午三點半開會預算是兩千五百塊因為要趕進度所以請幫我把資料先準備好 | `明天下午3:30開會預算是2500塊，因為要趕進度，所以請幫我把資料先準備好` | 无词内逗号（R226 的 `預，算` 消失）、規則断句在繁体连接词「因為/所以」前生效、繁体 ITN（#317）无回归【实测确认】 |

RightCtrl 按住说话 → Notepad 落字正常【实测确认】。韩文/日文/英文本轮未重测（第 224/226 轮已覆盖）【未测试】。

**P3-2241② 关闭确认。**

## 2. 专项：P3-2261 复核 + electron-builder NSIS 调查

### 2.1 运行时复核【实测确认】

- app 运行中（8 进程）交互式启动安装器 → 选 all users → 目录 `C:\Program Files\SpeakType` → Install：安装页出现后 SpeakType 进程数直接归 0，**全程无 "SpeakType is running" 对话框**（per-user 路径在第 224 轮实测会弹）。
- 安装完成（Installation Complete），旧 per-user 安装被自动移除（HKCU uninstall 键消失）。
- 从 `C:\Program Files\SpeakType\SpeakType.exe` 启动 v0.15.1 正常，用户数据保留（协作次数 2 / 生成文字 53 与安装前一致），听写正常。
- 注册表复核（对 R226「HKLM InstallLocation 为空」修正）：
  - `HKLM\...\Uninstall\0b788229-...`：DisplayName/UninstallString(`/allusers`)/QuietUninstallString/DisplayVersion/DisplayIcon/Publisher/Comments/NoModify/NoRepair/EstimatedSize 齐全，**没有 InstallLocation 值**——electron-builder 默认就不往 Uninstall 键写 InstallLocation（上游行为）。
  - electron-builder 自己的内部键 `HKLM\Software\0b788229-...` 中 `InstallLocation = C:\Program Files\SpeakType` **有值**，卸载/升级识别用的是这里（`multiUser.nsh` 读该键）。
  - 结论：R226 的「HKLM InstallLocation 为空」实为「Uninstall 键下无该值」，功能上不影响卸载与升级，仅影响依赖 Uninstall\InstallLocation 的第三方清点工具。降级为记录在案，不立案。

### 2.2 静默终止根因（源码论证，node_modules/app-builder-lib/templates/nsis）

- `installSection.nsh`：`CHECK_APP_RUNNING`（含 "is running" MessageBox）只在 `${ifNot} ${UAC_IsInnerInstance}` 时插入。选 all users 后安装段在 **UAC 提权的 inner 实例**中执行，该检查被整体跳过。
- 随后 `uninstallOldVersion HKEY_CURRENT_USER` 以 `/S` 静默执行旧 per-user 卸载器；`uninstaller.nsh` 的 `un.onInit` 在 `${If} ${Silent}` 分支调用 `un.checkAppRunning` → MessageBox 带 `/SD IDOK`，静默模式下默认 OK → `KILL_PROCESS` 直接杀掉运行中的 SpeakType。
- 即：**杀进程的是旧版本的静默卸载器，而不是安装器本身**；per-user 安装无提权、安装段在同一实例执行，所以能弹对话框。此机制与两轮运行时观察完全吻合（现象【实测确认】，机制为源码级论证，未逐版本验证上游【推测】）。

### 2.3 最小修复方案论证

| 方案 | 做法 | 评估 |
|---|---|---|
| A. `customCheckAppRunning` 钩子 | 覆写 CHECK_APP_RUNNING 内部 | **不可行**：钩子仍在 `ifNot UAC_IsInnerInstance` 守卫内，inner 实例根本不会调用 |
| B. `customInit` 前置检查 | 在 `.onInit`（模式选择前）自行 FIND_PROCESS + MessageBox | 可行但要在项目 nsh 里复刻查进程/杀进程逻辑（~20 行），且提示时机早于模式选择，per-user 路径会出现双重询问，需再加状态位规避 |
| C. 不绕（推荐） | 记录在案，跟踪上游 | all-users 是非默认路径（`perMachine:false`），实测终止后**数据零丢失、安装成功、重启即用**，风险仅为「未保存的听写进行中被打断」；B 的复杂度与双询问回归风险高于收益 |

**推荐 C：论证为 electron-builder 上游行为，不值得项目侧绕。** 若上游后续把 CHECK_APP_RUNNING 下沉到 inner 实例可自动受益。

## 3. 自选专项：配置导入导出回归 + zh-TW UI 走查

### 3.1 配置导入导出（打包版，zh-TW UI）【实测确认】

- 导出：`speaktype-config-2026-08-20.json`（1179 字节），含 settings/personas/configVersion；**asrApiKey 不随文件导出**，与「API 金鑰…不隨檔案匯出」提示一致。
- 手改 JSON 后导入（4 个坏字段 + 1 个合法修改）：
  - `evilUnknownKey:"boom"`（未知键）→ 被跳过；
  - `asrApiKey:"sk-INJECTED"`（注入密钥）→ 被跳过，本机 key 保留（磁盘仍为 test-key）；
  - `holdDelayMs:"not-a-number"`（错类型）→ 被跳过，保持 120；
  - `localModel:"../../evil"`（白名单外，#301）→ 被跳过，保持 parakeet-tdt-0.6b-v3；
  - `captionLines: 2`（合法数字）→ 应用成功。
  - 横幅精确显示繁体文案：「設定已匯入並生效（跳過 4 個欄位：未知、型別不符或不隨檔案遷移）」，计数 4 精确。#295/#299/#301 均无回归。
- 新观察 **P3-2282**：`captionLines` 合法值域仅 {1,3,6}（下拉选项），导入的 2 被接受并持久化，但 UI 下拉回落显示「1 行」——存储值与显示值不一致。仅手改 JSON 才会触发（正常导出文件不会产生 2），影响极小。

### 3.2 zh-TW UI 走查【实测确认】

- 首頁/歷史記錄/人設/詞典/檔案轉錄/設定（通用/語音識別/AI 潤色/關於）全量繁体，无缺翻译、无布局破损；備份/重設区文案完整；历史条目繁简混排正常。
- **P3-2283**：設定→增強標點提示仍写「ct-transformer，**中英雙語**」且启用后显示「標點已升級」，但 #319 后繁体高占比输入一律跳过模型走规则——zh-TW 用户按提示下载 281MB 增强包，对其繁体输入实际不生效（仅规则断句），提示未说明繁体回退。建议 hint 补一句繁体走内建规则（5 语言 locale 各一行）。
- 历史页错误条目为「識別失敗: <英文原始 detail>」混排——httpErrorDetail 设计如此（第 214 轮已核），不重复立案。

## 4. 新立案

| 编号 | 级别 | 问题 | 证据 |
|---|---|---|---|
| P3-2281 | P3 | Add/Remove Programs 的 Uninstall 注册表 `Comments` 值乱码：package.json 中文 description 以 UTF-8 字节写入（读出为 `æŒ‰ä½å¿«æ·é"®...`），HKLM/HKCU 均如此，控制面板「注释」列显示乱码 | 注册表实读【实测确认】；根因（electron-builder 传 APP_DESCRIPTION 至 makensis 的编码处理）【推测】。规避：description 改英文或去除，一行改动 |
| P3-2282 | P3 | 配置导入接受值域外 `captionLines`（如 2），存储与 UI 下拉显示（1 行）不一致 | 3.1【实测确认】；仅手改 JSON 触发 |
| P3-2283 | P3 | zh-TW 下增強標點提示「中英雙語/標點已升級」与 #319 繁体跳模型的实际行为矛盾，281MB 下载对繁体输入无收益且无说明 | 3.2【实测确认】 |
| P3-2261 | 复核关闭 | all-users 静默终止 = 上游旧版静默卸载器 KILL_PROCESS（见 §2.2），推荐不绕（§2.3）；「HKLM InstallLocation 为空」修正为 Uninstall 键无此值、内部键有值，不立案 | §2【实测确认+源码论证】 |

## 5. 下轮 Top3 建议

1. 若采纳 P3-2283/P3-2281 小修（locale hint 一句话 + description 编码），打包回归 5 语言设置页与安装器注册表。
2. 未覆盖专项：长会话内存抽查（punct-ct 热态 + 繁体门混合输入 30 分钟级）。
3. 真机端到端（真实麦克风/手机 remoteMic）仍是长期缺口。

## 6. 清场

停止 SpeakType/mock ASR/Notepad；卸载 all-users 安装并重装 per-user 0.15.1；清空测试历史与设置（asrProvider 恢复 local、enhancedPunct/itn 关闭）；删除 punct-ct 模型、导出/导入 JSON、mock 文本与临时脚本；核查 Run 自启无残留；仓库工作区干净。
