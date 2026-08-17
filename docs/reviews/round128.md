# 第 128 轮体验官审查报告 —— 托盘文案设计论证 + Personas 专项 + 模型切换态专项

- 审查日期：2026-08-17
- 基线：main@1875f06（含 #207/#208，`npm run pack:dir` 全绿，打包实测）
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3=0——零立案，设计论证结论 ×1，观察 ×1，并更正 127 轮一处测试基建结论。**

## ① 托盘「Set up speech recognition」文案设计论证（不立案，建议采纳微优化）

- 现状【源码】：`tray.activate` 为固定文案的设置页快捷入口（index.ts refreshTrayMenu），不感知配置状态；已配置用户看到「Set up …」可能误以为「还没设置好」。
- 论证：菜单点击行为无害（只是打开 设置→语音识别），不构成功能缺陷 → **不立案**。但改进成本低且收益明确：refreshTrayMenu 已在 uiLanguage 变化时重建，只需在模型就绪状态变化处补一次调用 + 按就绪态选键（就绪时用中性「语音识别设置 / Speech recognition settings」，五语 ×1 新键），~10 行。**结论：不立案，建议作为微优化随下次改动顺带落地。**

## ② 专项 a：Personas 人设页全链路（全过）

选择理由：人设 CRUD、Alt+1..9 切换、当前人设回退从未专审过完整链路。

- Alt+2 切换：当前人设卡即时更新 + 「Persona Auto translate (Alt+2)」toast【实测·实拍】。
- 新建：空名 Save 不生效（防呆）；填名+指令保存 → 列表出现 Custom 条目并自动分配 Alt+8，Alt+8 切换 toast 正常【实测】。
- 编辑改名保存即时生效，仍保持选中与 Alt+8【实测】。
- 删除：两步确认（「Delete? Click again」，超时自动还原防误删）；删除当前选中人设后**当前人设回退 Default**，无悬挂引用【实测】。
- App 规则区：未配润色模型时显示「Rules only take effect with an AI polish model configured」黄条防呆 + Set up AI polish 链接【实测】。
- 「Personas only affect the AI polish stage, never the recognition itself」口径与行为一致（polish 关时切人设不影响识别落字）【实测】。

## ③ 专项 b：本地模型切换态（全过）

- sensevoice→parakeet：worker 干净重启（log: stopped (model switched) → started），切完即听写英文准确落字【实测】。
- **切换窗口内听写**（worker stopped 与新 worker started 之间发起录音）：不崩不丢——录音帧独立缓冲，新 worker 就绪后正常 finalize 落字【实测，log 毫秒时间线为证】。
- parakeet→sensevoice 回切后中文正常【实测】。云端 provider 需真实 key，仍【未验证】挂账。
- 顺带验：General 页 #205/#207 新文案「Auto-exit on prolonged silence (hands-free)… Sentences are still typed as you pause either way」在位【实测·实拍】。

## ④ 核心回归（过）+ 127 轮基建结论更正

- RightCtrl 中文「我明天去公园散步」准确落字（zh-run3 全对）；Alt+... 免按英文准确落字（parakeet/sensevoice 双模型下各一次）【实测】。
- **更正**：127 轮称「zh 换 wav 后立即全对」系单次样本过度概括——本轮 wav 路径 4 次中 2 次仍丢字（voicedMs 1500-1660 波动），TTS 合成音源经系统回环的 zh 用例本身边缘，wav 只降低不消除抖动。仍属测试基建摩擦（en 用例 100% 稳定、zh 多次重试可全对），非产品立案；后续应制作语速更慢、停顿更清晰的 zh 固定音源。

## 测毕清场

- SpeakType/notepad/node 进程 0；43117/18099 无监听；无 .part
- 自建人设已删；config/history 由 round128-*.bak 整体还原（321 条、hold=RightCtrl、toggle=Alt+Q、vadAutoStop=true、模型 parakeet）
- 防火墙三 profiles OFF；repo 回 main、工作区干净
