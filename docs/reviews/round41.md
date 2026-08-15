# SpeakType 第 41 轮严格审查报告 —— 真实新用户全新链路（官网→下载→安装→首启→第一句）

- 审查范围：线上官网 speaktype.zalize.com（英/中）→ GitHub Release v0.11.0 Setup 安装包 → 真实安装器安装（非 win-unpacked）→ 全新配置首启 → 模型下载 → 第一句落字 → 卸载残留检查
- 前置：本机 %APPDATA%\SpeakType 全量备份后移除，模拟全新机器（测毕已还原）
- 证据标注：【实测】真机证据；【源码】源码推断；【未验证】未执行

## 一、官网走查（英/中双页，全部通过）

【实测】
- 英文页与 /zh/ 中文页均正常渲染，顶部横幅正确显示 "v0.11.0 is out / v0.11.0 已发布 —— 越用越准的自动纠错学习（可撤销）"，与最新版本叙事同步。
- **三个下载链接双页全部指向 v0.11.0**（Setup / portable / apk，`releases/download/v0.11.0/...`，curl 抓取核对）。
- 零 key/本地端点/自动学词/手机麦等卖点文案与产品现状一致；对比表诚实（macOS 标注 In progress）；SmartScreen 提示语在下载区就位。
- 体积标注 "~98MB" 与实际 Setup 103,240,739 字节（=98.5 MiB）一致。

## 二、下载与安装（通过）

【实测】从中文页点「下载 Windows 版」→ Chrome 直接下载成功（约 100 秒）→ 双击运行安装器：
- 安装器检测到本机既有安装（第 38 轮升级链路验证遗留），提示先卸载旧版再装，流程无阻塞；per-user 安装免 UAC。
- 安装完成页勾选 Run SpeakType 自动首启成功。
- SmartScreen 在本测试机未弹出拦截【未验证】（官网已有应对文案，风险已覆盖）。

## 三、首启体验逐步挑刺（golden path 全通）

【实测】全新配置首启（日志 `no legacy userData to migrate`）：
1. **「下一步该干嘛」清楚**：Home 顶部显著横幅 "Download the offline speech model — One-time download (~660MB). After that everything runs on your machine — no network, no API key." + Download 按钮，指向明确；下方 "First time? 4 quick steps" 四步引导 + 手机麦入口链接齐备。
2. **默认判定合理**：系统 en locale → UI 英文、识别语言 en、默认模型 Parakeet（源码规则 CJK→SenseVoice / 其他→Parakeet，与第 26 轮 #76 决策一致）。
3. **模型下载**：点 Download 后按钮原位变成百分比进度（4%→…），约 2.5 分钟完成（660MB），日志 `local model parakeet-tdt-0.6b-v3 downloaded`；完成后横幅整体消失。
4. **第一句**：光标放 Notepad → RightCtrl 口述 → 落字 "This is my very first sentence with speak type version 11."——逐字准确 + ITN（eleven→11）生效；首句含 worker 懒启动仍流畅完成。
5. About 页版本 0.11.0 (3139104) 正确；启动 5 秒预拨日志 `latest release prefetched: v0.11.0`，同版本不显横幅，行为正确。

**挑刺（均为低优观察）**：
- 模型下载完成后横幅静默消失，没有一个"模型就绪，去说第一句吧"的完成确认（toast 或横幅变绿一拍再消失）。新用户盯着横幅等下载，完成瞬间缺少正反馈与行动指引（四步引导虽在下方兜底）。~10 行。
- 下载进度只有百分比数字，无剩余时间/速率；660MB 在慢网下用户无法预估等待时长。P3，做不做看性价比。

## 四、卸载检查（通过，1 个 P3）

【实测】运行 Uninstall SpeakType.exe：
- 程序目录（LOCALAPPDATA\Programs\SpeakType）删除干净；开始菜单快捷方式、HKCU Uninstall 注册表项、自启 Run 项全部清除，无报错。
- **P3（新）：卸载静默保留 %APPDATA%\SpeakType 全部用户数据（含 660MB 模型），无任何询问或提示**。保留配置是合理默认（重装免重配），但 660MB 模型对"想彻底清理"的用户是隐形占用。建议二选一：卸载器加"同时删除我的数据与模型"勾选（electron-builder `deleteAppDataOnUninstall` 相关能力/自定义 NSIS 宏），或至少在官网 FAQ 写明手动清理路径。

## 五、分级汇总与下轮候选

| 级别 | 问题 | 修复建议 |
|---|---|---|
| P0 | 无 | — |
| P1 | 无 | — |
| P2 | 无 | — |
| P3 | 卸载静默残留 660MB 模型与用户数据，无删除选项/说明 | 卸载勾选或 FAQ 说明手动清理路径 |
| P3 | 模型下载完成无就绪确认提示；进度无剩余时间 | 完成 toast/横幅确认（~10 行）；速率显示看性价比 |

**总评**：官网→下载→安装→首启→第一句的全新用户链路首次端到端实测，零阻塞零报错，「下载完模型就能说第一句」的官网承诺属实。

**下轮候选排序**：
1. 上述两个 P3 可与第 40 轮词典上限提示合并一个杂项 PR 清账。
2. 慢网/断网下模型下载中断与重试续传体验（本轮网络太快未覆盖，历轮仅验证过错误分类）。
3. v0.12 规划：打磨期两大遗留面——中文新用户（zh locale 默认 SenseVoice）全新链路对照抽查、真实云端 ASR/润色 provider（非 mock）实测。

## 测毕清场

已卸载安装版（程序目录/快捷方式/注册表零残留）；全新测试用 %APPDATA% 已删除并还原备份的原配置与模型；下载的 Setup 安装包已删除；SpeakType/notepad 进程无残留；防火墙三 profile 全 OFF、无网络阻断。未修改任何产品代码。
