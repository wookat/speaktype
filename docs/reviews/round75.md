# SpeakType 第 75 轮严格体验官审查报告

- 基线：main @ `e8c0f44`（含 #138 图片剪贴板条件还原、#139 经验沉淀），`npm run pack:dir` 全绿，win-unpacked 打包实测
- 环境：Windows Server 2022；防火墙三 profile 全程 OFF（测前测后核验）
- 结论：**P0=0，P1=0，P2=0，P3=0——零新立案**；2 条观察不立案
- 证据分级：【实测】打包运行时直接观察；【源码】代码核对；【未验证】如实标注

---

## 一、#138 图片剪贴板回归（【实测】）

- SetImage 放入 32×32 位图（`ContainsImage()=True`）→ RightCtrl 口述落字 Notepad → 落字后 **`hasImage=True text=[]`**——图片原样还原，识别文本未残留剪贴板。上轮同法 `hasImage=False`（图片永久丢失），#138 修复坐实。
- 【源码】paste.ts 三分支条件还原与推荐修法一致：`prevText ? null : clipboard.readImage()` 快照 + `readText() !== text` 先行放弃 + 文本/图片分支还原。

## 二、增强标点（punct-ct）通道专项

### 就绪/开关（【实测】）
- 模型已在 models\punct-ct（281MB，日志 `punct model downloaded` 2026-08-15 00:43）；开关打开即显「Add-on ready — punctuation upgraded」，无重复下载。
- 未下载态 UI：临时移走 model.onnx 后重启应用 → 开关下正确显示「Download add-on (~281MB)」+「Rule-based punctuation is used until the download finishes」实拍。下载按钮本身未点击重下（281MB 网络成本，历史日志已证下载路径可用）【未验证-本轮未重跑下载】。

### 英文效果对比（parakeet，同一句长口语，【实测】）
- 模型标点开：raw 无标点 → `…the numbers look fine, but we still need to update the summary section before the meeting and then send it to the team for review.`（逗号断在 but 前，语义正确；日志同刻 `punct worker started`）。
- 模型标点关（规则兜底）：同句 → `…look fine. But we still need to update the summary section before the meeting and. Then send it to the team for review.`——规则在 "and. Then" 处硬拆句，明显劣于模型。**「much better than the built-in rules」的宣传与实测相符。**

### 与自带标点的兜底关系（【实测】+【源码】）
- sensevoice 中文 + 模型标点开：输出 `今天下午3点开会，预算是5200元`（全角逗号 U+FF0C，逐码点核验），与关闭时完全一致——**自带标点通道不被二次加工**。【源码】polish.ts `needsPunctuation` 门槛（英文句末标点 >词数/10、中文标点 >字数/25 即跳过）与 applyModelPunctuation 仅在 `!useLlm && enhancedPunct` 时调用；AI 润色开启时整段交 LLM，模型标点让位（UI 文案「Skipped when AI polish is enabled」与实现一致）。
- 模型文件缺失时运行中回退（【实测】）：移走 model.onnx 后不重启直接口述 → 纯规则输出（"fine. But … and. Then"），无报错无卡顿，`punctuate()` 返回 null 静默降级【源码】punct.ts L146。

### 观察（不立案）
1. **运行中删除模型文件后设置页状态不刷新**：model.onnx 被外部删除后，设置页仍显「Add-on ready」（EnhancedPunct 仅挂载时查询 punctStatus），实际已回退规则；重启后 UI 自纠为下载按钮。触发条件苛刻（用户手动删模型文件且不重启），重启自愈 → 不立案；若顺手修，可在 punctuate 返回 null 时 push 一次 status（~3 行）。
2. worker 空闲 10 分钟自动释放（punct.ts WORKER_IDLE_MS）与 sensevoice 同模式【源码】，本轮未挂机复验（第 53 轮已验 ASR 侧同机制）【未验证】。

## 三、核心链路回归（【实测】）

- RightCtrl 英文（parakeet）：多句逐字落 Notepad（含第二节长句）。
- RightCtrl 中文（sensevoice）：`今天下午3点开会，预算是5200元` 含 ITN 全对。

## 四、清场

- model.onnx 复位（281MB 原样）；speaktype.json / history.json 从 round75 备份还原；Notepad/SpeakType 进程 0；无 .part；防火墙三 profile 保持 OFF。

## 五、下轮候选

1. punct-ct 真实下载路径重验（网络允许时点一次 Download 走完进度条）。
2. 云端成功路径补测（等 key，长期挂账）；真手机麦通道（挂账）。
3. 主要面已多轮全绿（74-75 连续仅存量边界 P3），建议转 v0.14 规划轮或竞品对比轮。
