# 第 87 轮体验官审查报告 — #162 键盘无障碍回归 + 首启引导错误路径深挖 + 核心回归

- 基线：main @ `399a313`（含 #162/#163），`npm run pack:dir` 退出码 0，打包版实测
- 环境：Windows Server 2022；防火墙三 profile 全程 OFF；测毕清场（见文末）
- 口径：【实测】= 打包版运行实证；【源码】= 代码核对；【推测/未验证】= 如实标注

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

**零新立案。**#162 回归通过；首启引导含中断恢复路径整体优秀。

## ① #162 回归抽查【实测】

- 键盘删除→焦点直落 Undo 按钮（焦点环实拍）；随后改用鼠标点列表空白处——焦点自然离开、计时不受影响，~10s 后胶囊自然消失、删除定格；此后误按 Enter 无任何副作用（不误撤销、不误删下一条）。
- 拖放区获焦态：Tab 至拖放区焦点环清晰，Enter 打开系统文件选择器→选 wav→转写完成全程正常，获焦态不影响任何功能；真实 OS 级拖拽在获焦态下未做（自动化拖拽受限【未验证】），【源码】#162 仅加 tabIndex/onKeyDown，dragover/drop 处理器未动，无影响路径。

## ② 首启引导 onboarding 深挖（%APPDATA% 清空模拟首装）【实测】

黄金路径（第 81 轮已验优秀，本轮重点补错误/中断路径）：

1. **未下载模型就按 RightCtrl**：toast「Speech recognition not set up / Local model not downloaded yet」+「Open Settings」按钮；点按钮跨窗口拉起主窗并直落 Settings→Speech 页签（Status=Not configured + Download model 按钮就位）——新用户不会卡死在"按了没反应"。
2. **下载中途强杀应用**（模拟断电/崩溃）：重启后 Home 横幅变「**Resume download (97% done)**」——断点续传（.part + .part.json 记录进度【源码+实测】），点击后数秒补完，无需重下 660MB；完成后 .part/.part.json 自动清理，模型四文件就位。这是同类产品少见的第一流中断恢复体验。
3. 下载完成后首句听写即准确落 Notepad（「speak type」为 TTS 发音+空词典所致，非缺陷）。
4. 首启默认跟随系统：主题 dark（系统 dark）、界面英文、人设 Default、四步上手卡+手机当麦入口齐全。

- 观察（不立案）：无模型 toast 文案「open Settings to download」与按钮「Open Settings」略重复；模型就绪 toast 驻留过长为第 81 轮已记观察项，本轮未重复计。

## ③ 全局回归【实测】

- RightCtrl 中文「今天下午3点开会，预算是5200元」（sensevoice+ITN）+ Alt+Q 免按「我们明天去公园散步」识别准确并入历史（history.json UTF-8 逐字核对；当时前台为浏览器页面，落字目标非本轮验点，落字路径已由 ①/② 的 Notepad 实测覆盖）。

## 清场记录

- 首装测试目录整体删除、原 %APPDATA%\SpeakType（含 660MB 模型）原样还原；transcribe-last.json 已删；配置/历史从备份还原。
- SpeakType 进程 0；无 .part；43117 端口无监听；防火墙三 profile 保持 OFF。

## 下轮候选

1. 设置页 IA 方案 A 落地回归（若 v0.15 采纳）。
2. 长文本编辑体验/错误恢复路径（剩余未审候选）。
3. 云端成功路径补测（等 key）/ 真手机麦通道（挂账）。
