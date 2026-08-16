# 第 100 轮体验官审查报告 — #179 回归 + F8 选中改写专项 + 手机麦 QR 配对走查 + 核心回归 + 百轮总评

- 基线：main @ `804f07d`（含 #179/#180），`npm run pack:dir` 退出码 0，打包版实测
- 环境：Windows Server 2022；防火墙三 profile 全程 OFF；测毕清场（见文末）
- 口径：【实测】= 打包版运行实证；【源码】= 代码核对；【未验证/推测】= 如实标注

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

零新立案；观察项 ×2（见下）。

## ① #179 回归【实测】

- Home 引导卡熟手折叠：sessions=321 时默认折叠为单行「First time? 4 quick steps + Show all」，手机麦入口外提保留在折叠行下；点 Show all 展开四步、Show less 收回；重启后仍保持折叠默认。第 99 轮 P3-① 闭环（P3-② 50MB 连坐修复由测试代理 A-C 验证，本轮未重复）。

## ② F8 选中改写专项（mock 润色端点法）【实测】

- 正常改写：记事本选中整句 → F8 口述「make it uppercase please」→ 选区被 mock 返回文本原位替换；指令 ASR 准确；改写中悬浮条显示波形 + 指令实时字幕，且**不显示人设徽标**（改写不走人设，源码 dictation.ts:307 一致）。
- 连续两次 F8：第二次口述「translate to chinese」再次替换成功，无状态残留。
- 未选中文字：F8 → toast「Nothing selected — Select the text first…」，不进入录音。
- 未配置润色：F8 → toast「Rewrite needs a polish model…」+ 自动拉起主窗直落 AI polish 页签，一次性可修好。观察①：toast 文案写「Settings → Polish model」，而页签自 #164 已更名「AI polish」，措辞未同步（文案级 ~5 处五语）。
- 改写失败（杀掉 mock 端点）：toast「Rewrite failed — …text was left unchanged」，**选区文字原样保留、选中态不丢**，可直接重试；失败不写历史（改写非转写，合理）。

## ③ 手机麦 QR 配对走查【实测】

- LAN 直连页：QR + https://172.16.7.2:43117/?t=… + 证书警告解释文案；Chrome 模拟手机接受自签证书后进入配对页「Connected to your PC / Hold to talk」，桌面端同步显示「1 device(s) connected」。
- #117 token 轮换回归：关-开「手机当麦克风」后 token 变化（890643…→a378ae…），旧链接刷新 → 「SpeakType: invalid link, rescan the QR code」明确拒绝。观察②：该拒绝页是纯文本英文，未本地化/无样式（低频边缘，不立案）。
- #112 模式切换回归：配对页连着时 LAN→公网中转 → 旧页即时变「Disconnected, reconnecting…」+ Hold to talk 置灰禁用，不会假装可用；切回 LAN 时 token 再次轮换（安全行为正确）。
- 中转模式 UI：中转地址 + 配对码 + QR 齐全；zh-CN 与 en 两语配对区块实拍文案排版正常。

## ④ 核心回归【实测】

- RightCtrl 中文「今天下午3点开会，预算是5200元」（sensevoice+ITN）+ Alt+Q 免按「我们明天去公园散步」准确落字（history UTF-8 核对）。

## 百轮总评（体验官视角）

**成熟度**：核心链路（按住说话→准确落字）在 100 轮、跨 0.7.2→0.15.0 的持续实测中未再出现 P0/P1 级回归；错误态全部有人话提示且可一步直达修复入口；破坏性操作（历史清空、单条删除、词典清空）均已有确认或 Undo；键盘无障碍、五语言、长文本、失败恢复、断点续传等边角在第 81-99 轮逐一闭环。近 10 轮立案全部为 P3 级打磨项且平均一轮内修复合并——**产品已达到可放心日常使用的生产质量，发布节奏与质量闭环（review→fix→retest）运转健康**。

**下阶段建议**（按价值排序）：
1. **真实设备与云端补账**：真手机麦（iOS/Android 实机 + 弱网）与云端 ASR/润色付费 key 成功路径是仅剩的两块长期【未验证】区域，建议安排一次实测专项。
2. **从"无缺陷"走向"更好用"**：立案已连续多轮见底，建议把审查重心从缺陷挖掘转向可用性度量（如首次成功听写耗时、纠错率随词典增长的变化）与竞品对照体验。
3. **保持既有约束**：本地优先/无上传的心智是最大差异化资产，后续加云端功能时延续「本地默认、云端显式可选」的现有原则。
4. 小额文案债：观察①（Polish model 措辞）与观察②（invalid link 页本地化）可随下个文案 PR 顺带清掉。

## 清场记录

- mock 润色 node 进程停（18099 无监听）；配置/历史从备份还原（polish/relay/token 字段随还原）；failed-audio、latest-release.json、transcribe-last.json 已删；rewrite.ps1 等 fixture 留在 review 工作区未入库。
- SpeakType 进程 0；无 .part；43117 无监听；防火墙三 profile 保持 OFF。
