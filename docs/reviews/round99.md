# 第 99 轮体验官审查报告 — #177 回归 + Home 再访体验 + 失败录音重试专项 + 核心回归

- 基线：main @ `d89455a`（含 #177/#178），`npm run pack:dir` 退出码 0，打包版实测
- 环境：Windows Server 2022；防火墙三 profile 全程 OFF；测毕清场（见文末）
- 口径：【实测】= 打包版运行实证；【源码】= 代码核对；【未验证/推测】= 如实标注

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 2 |

## ① #177 回归【实测】

- 词典 Clear 两步确认全过：首击变红「Clear all words? Click again」；不点第二次 4 秒自动复位为普通 Clear；连点两次真正清空（3 词→0/300 空态）。第 98 轮 P3-① 闭环。

## ② Home 页再访体验（「装了一周后再打开」视角）

- 保值项【实测】：hero 快捷键提示 + 四统计卡（Sessions/Words/时长/Time saved 40wpm 口径灰字）+ 当前人设卡（含 Alt+1..9 提示）——高频回访均有信息量；整页单屏无滚动。
- **P3-①：「First time? 4 quick steps」引导卡永驻**——321 会话老用户 Home 中部约 1/3 屏仍被首次引导占据【实测】；渲染无任何条件【源码 Home.tsx:97-105 无 sessions 判断】。修法 ~5 行：`statsSessions ≥ 10` 后折叠为一行「查看上手步骤」链接或隐藏；卡内的手机麦入口是长期有用项，隐藏时应外提保留。
- 升级横幅位置观察（不立案）：新版提示只在 设置→About，Home/托盘无任何入口，再访用户不主动点 About 则永远看不到升级；第 95 轮已论证不打扰原则，可在 Home 顶部出现一次性可关 pill 作为折中，供 v0.16 决策。

## ③ 失败录音重试专项

- 失败落盘【实测】：openai 兼容 provider 指向死端口 → 听写失败，历史条目红字人话错误（「Cannot reach the speech recognition service…」）+ wav 落盘 failed-audio（185KB/4s）。
- **20 段 / 7 天 / 50MB 淘汰边缘【实测】：P3-②——50MB 规则误伤仍在预算内的旧录音**。注入 22 段近期 + 1 段 8 天前 + 2 段 30MB 后触发新失败：8 天前的删除 ✓、第 21 段起删除 ✓，但**累计字节把「已被删除的超额文件」也计入**，一旦某文件越过 50MB 线，其后所有更旧文件全部连坐删除——实测最终只剩 2 个文件（30.1MB），22 段仅 2KB 的小录音本可保留却全被清掉【源码 dictation.ts:77-82，`bytes += item.size` 对被删项不回退】。真实触发需两段 ≥15 分钟的失败长录音，概率低故 P3；修法 ~2 行：仅对保留项累计 bytes。
- 重试成功清理【实测】：切回本地模型点 Retry → 条目原位变成功文本 + provider 更新 Local offline + toast「Retry succeeded — copied to clipboard」，对应 wav 即刻删除（目录核对）。
- 录音已被淘汰的条目点 Retry【实测】：行内红字「Audio no longer available (only the last 20 recordings are kept)」，不误报成功。

## ④ 核心回归【实测】

- RightCtrl 中文「今天下午3点开会，预算是5200元」（sensevoice+ITN）+ Alt+Q 免按「我们明天去公园散步」准确落字（history UTF-8 核对；另重试路径也产出同句成功）。

## 清场记录

- failed-audio 目录整体删除（含注入的 fixture 与 big wav）；配置/历史从备份还原（含 provider/密钥字段还原）；latest-release.json/transcribe-last.json 已删；词典测试词随备份还原。
- SpeakType 进程 0；无 .part；43117 无监听；防火墙三 profile 保持 OFF。

## 下轮候选

1. P3-②（prune 字节累计 ~2 行）+ P3-①（引导卡按会话数折叠 ~5 行）落地回归。
2. 长期未审面：Rewrite selection（F8 选中改写）专项 / 手机麦 QR 配对页面走查。
3. 云端成功路径补测（等 key）/ 真手机麦通道（挂账）。
