# 第 66 轮体验官审查（main @ 6f03641，含已合并 PR #126，win-unpacked 本机 pack:dir 实测）

日期：2026-08-15。测试机：Windows 10，假麦 + rkey.ps1 按键注入。

## 结论总览

- PR #126 回归抽查 🟢（存量 Alt+Space 显示/生效为 Alt+Q，文件不改写）
- 深挖 A：Parakeet 模型损坏注入 🟢（#125 guard 的 parakeet 通道实证：不闪退+引导+SHA 还原后 prewarm 正常）
- 深挖 B：Persona 热键 Alt+数字 🟢（toast 含名称+序号，Home 卡片同步）
- 核心回归 🟢（RightCtrl 英 parakeet/中 sensevoice + Alt+Q 一轮）
- 新增 P0-P2：无。观察项 1 条（见下）

## 1 PR #126 回归抽查（Regression）🟢

- 基线 speaktype.json hotkeyToggle="Alt+Space"（node 核对）→ 启动 → Home 副标题实拍 "tap **Alt+Q** for hands-free mode"（zoom ss_zoom_5bd41da2）；运行中读文件仍为 Alt+Space（读取时迁移不改写，行为与 #126 实测一致）。

## 2 深挖 A：Parakeet 损坏注入（#125 guard parakeet 通道，round65 候选）🟢

- joiner.int8.onnx（SHA 3164C13F…48B3，6355277 字节）换 34 字节垃圾 + localModel=parakeet → 启动：
  - 进程存活 ≥30s（旧版原生 abort 静默闪退）；log 无 `sherpa worker started (parakeet…)`；
  - Home 实拍「Download the offline speech model (~660MB)」引导条（parakeet 体积文案正确区分于 sensevoice 的 ~234MB）（ss_8522e972）。
- 还原备份 SHA 核对 True → 重启 → log `sherpa worker started (parakeet-tdt-0.6b-v3)`、进程存活；RightCtrl 英文落字 Col 108（ss_f6d70868）。
- 判定：#125 的 size 校验对 parakeet 四文件通道同样生效，round65 候选闭环。

## 3 深挖 B：Persona 热键 Alt+数字（hotkey.ts:274-277 / index.ts:192-198）🟢

- Alt+2 注入 → toast「**Persona Auto translate (Alt+2)**」实拍 + Home Current persona 卡片 To my boss→Auto translate（ss_dc197270）。
- Alt+1 → toast「**Persona Default (Alt+1)**」+ 卡片变 Default（ss_03059e70）。
- 切换即写 settings.personaId，重启前后一致（清场时从备份还原原值 boss）。

## 4 核心回归 🟢

- RightCtrl 英（parakeet 还原后）："Please open speak type and start dictation now.…" Col 108，finalize 7879ms。
- RightCtrl 中（sensevoice/zh）：落「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」，finalize 7880ms。
- Alt+Q 免按一轮：进/退干净（finalize 9811/3264ms），累计落字 Col 174（ss_04f987ef）。

## 观察项

1. ⚪ 损坏 parakeet 状态下 Home 引导条直接给 Download 按钮（≈660MB 全量），未提示「仅 joiner 一件损坏、可增量重下 6MB」——#125 的 downloadFiles 实际只会重下大小不符的那一件（sensevoice 实测已证删坏重下逻辑按文件粒度），文案层面无感知差异，属可选优化非缺陷。

## 下轮候选

- Alt+Space 真实键盘复核（round65 遗留，需真机；产品侧已用 #126 规避）。
- muteWhileRecording（仍需带真实声卡机器）。
- 损坏态点 Download 的 parakeet 增量重下实测（预计仅重下 joiner 6MB，可视进度验证）。
- 真手机麦克风 relay 实测（缺真机）。
- 安装包 Setup/升级链路周期性复验。
