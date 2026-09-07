# 第 72 轮体验官审查报告

- 基线：main @ f9bd324（含 #133）win-unpacked 自打包
- 角度：词典导入边界、剪贴板双路径、手机麦 LAN #117 回归、20 分钟免按 soak + 空闲释放、核心回归
- 证据：`C:\Users\Administrator\round72-evidence.md`；修复回归证据 PR #134 评论 + `C:\Users\Administrator\pr134-evidence.md`

## 结论：审查全 🟢，1 项现状记录已转修复（PR #134）

| 项 | 结果 |
| --- | --- |
| 词典导入 303 行混合边界：去重/trim/全角空格/21 字超长丢弃 → 恰 300/300 + limitReached count=1；满库拒收 | 🟢 |
| Retry 成功后剪贴板 == 落库文本（byte 级比对 match True） | 🟢 |
| 手机麦 LAN（#117）：token 轮换后旧页 8 次重连即停 +「Pairing expired」；错 token 403 | 🟢 |
| 20 分钟免按 soak：21 finalize == 21 history 零丢句；内存 1416→1531MB（×1.08）稳定 | 🟢 |
| 10 分钟空闲释放（1531→297MB）+ 唤醒重建 worker 落字正常 | 🟢 |
| 核心回归：RightCtrl 中英 + Alt+Q | 🟢 |

## 现状记录 → 修复（PR #134，已合并并回归全绿）

无有效粘贴目标（焦点在桌面壳 Progman/WorkerW）时听写正常 finalize 但盲发 Ctrl+V 静默丢字、无提示。修复：`hasPasteTarget()` 保守判定（仅桌面壳/无前台判无目标），无目标时跳过粘贴 + 五语 toast「已存入历史」；文字照常入 History/统计。回归：桌面 toast 双语实拍、记事本/自身词典输入框/免按/F8 改写全不受影响。

## 遗留/边界（非本轮立案）

- muteWhileRecording 需真声卡；真手机麦需真机（本轮为本机浏览器模拟）。

## 清场

双模型 SHA 核对一致、配置/历史恢复原件、fixture/采样进程全清、无 .part、进程 0、防火墙三 profile OFF。
