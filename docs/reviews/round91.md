# 第 91 轮体验官审查报告 — 错误恢复路径专项 + 长条目折叠设计论证 + 核心回归

- 基线：main @ `280fcb4`（含 #166/#167），`npm run pack:dir` 退出码 0，打包版实测
- 环境：Windows Server 2022；防火墙三 profile 全程 OFF（网络失败用 hosts 指 127.0.0.1 法，测毕还原）；测毕清场（见文末）
- 口径：【实测】= 打包版运行实证；【源码】= 代码核对；【推测/未验证】= 如实标注

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

**零新立案。**五条错误恢复链路全部闭环，另实测坐实一项此前只有源码证据的亮点（模型下载多源回退）。

## ① 错误恢复路径专项【实测】

### A. 听写失败 → Retry（含连续多次失败）
- 云端 ASR 指向死端口（127.0.0.1:43998 无监听）→ 口述失败：toast「fetch failed · Recording kept — press the hotkey again to retry」，wav 落 failed-audio，历史生成可重试红条。
- **连续失败 ×2**：端点仍死时点 Retry → 行内红字「fetch failed」就地显示，条目保持可重试态、不丢不重复；再次 Retry 同样稳定。
- 切换 Provider 为本地后点 Retry → 就地更新为识别文本 + toast「Retry succeeded — copied to clipboard」+ provider 徽标变 Local offline，failed-audio 清空。链路闭环。
- 观察（不立案）：失败 toast/行内错误直接暴露原始错误串「fetch failed」，开发者行话，建议映射为「无法连接识别服务」类人话（~5 行）。

### B. 模型下载失败 → 引导闭环（hosts 法断网）
- 仅封 github.com 系时下载**仍成功**——【实测坐实源码设计】download.ts 三源回退（huggingface.co → hf-mirror.com → GitHub Releases 自托管）真实生效，单源被封用户无感。
- 三源全封后点下载 → 按钮旁红字「Download failed: network error — check your connection and try again」，按钮保持可点；恢复网络后再点 → 数十秒完成、Status 变 Ready + 就绪 toast。失败-修复-重试一次闭环，无残留 .part 半途态引发的坏状态。

### C. 转录中途取消 → 重试
- 10 分钟 wav 转录至 ~28% 点 Cancel → 部分 14 段结果保留、可复制/导出，拖放区立即恢复可用；重新选同一文件 → 从 0 重新开始、旧部分结果被新进度自然替换；再次取消后 transcribe-last.json 不落盘（Cancel 不持久化，与 #151 口径一致）。

### D. 润色服务不可用
- 润色指向本机 500 服务 → 口述后**原文照常落字**（零数据丢失）+ toast「Polish service unavailable — Inserted the raw transcript without AI polish」。用户下一步顺：文字已到手，无需立即处理；toast 未链设置，因兜底已成功属可接受（观察，不立案）。

### E. 配置错误 → 直达设置一次修好
- 无模型按热键（第 87 轮已验「Open Settings」直落 Speech 页签）本轮不重复；云端失败场景下 Settings→Speech 一屏内完成 Provider 切换回本地，Retry 即成功——一次进设置修好，无需二跳。

## ② 长条目默认折叠设计论证（第 89 轮观察项，供下轮决策，不改代码）

- 方案：正文 div 默认加 `line-clamp-8`（Tailwind 内置），超过时尾部给「展开/收起」小按钮；`expandedIds: Set<string>` 状态控制。
- 兼容性核对【源码】：
  - 搜索过滤：过滤在 `item.text/raw/personaName` 字符串层做，与 CSS 截断无关，命中不受影响；命中但被折叠的内容用户点「展开」即见（无高亮功能，无高亮冲突）。
  - 编辑：Correct 打开的是 textarea（#166 已自适应行数），与折叠态互斥展示，无冲突；建议进入编辑时自动视为展开。
  - 复制/导出：均取 `item.text` 全文，与显示截断无关。
  - diff（Show raw transcript）：该块本就独立条件渲染，折叠只作用于正文 div。
  - Undo/删除/焦点（#158/#162）：不触碰。
- 判断是否需要折叠：`text.split("\n").length > 8 || text.length > ~600` 近似即可（clamp 由 CSS 兜底，判断只决定是否显示按钮）。
- 估算 ~15 行（状态 1 行 + 类名条件 2 行 + 按钮 6 行 + 判断/i18n 键 6 行）；五语言补「展开/收起」两键。风险低，建议 v0.15 顺手做。

## ③ 全局回归【实测】

- RightCtrl 中文「今天下午3点开会，预算是5200元」（sensevoice+ITN）+ Alt+Q 免按「我们明天去公园散步」均准确落 Notepad（实拍）。

## 清场记录

- hosts 还原（github/huggingface/hf-mirror 封锁项 0）；本轮下载的 ggml-small-q5_1.bin 已删（还原基线模型集）；mock 500 服务已停；failed-audio 清空；transcribe-last.json 无；配置/历史从备份还原。
- SpeakType 进程 0；无 .part；43117/43999 无监听；防火墙三 profile 保持 OFF。

## 下轮候选

1. 长条目折叠 ~15 行落地回归（若采纳）。
2. 「fetch failed」错误串人话化（~5 行，随手修）。
3. 云端成功路径补测（等 key）/ 真手机麦通道（挂账）。
