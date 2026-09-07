# SpeakType 严格审查报告（审→改循环 · 第 27 轮）

- 审查日期：2026-08-14
- 对象：main@0456bdd（含 PR #77），本地 `npm run pack:dir` 全绿（签名通过），实测 `release\win-unpacked\SpeakType.exe`
- 环境：Windows Server 2022 / 1280×720 / 系统区域 en-US；VB-Cable + System.Speech TTS 驱动真实识别；F8 用仓库自带 `desktop/scripts/mock-rewrite-server.mjs`
- 截图：`C:\Users\Administrator\speaktype-review\round27\shots\`（01-32）
- 证据分级：【实测】真机复现 / 【源码】行号级推断 / 【未验证】
- **未开防火墙、未做任何网络阻断**；下载失败场景用 `icacls` 拒写模型目录复现（用完已 `/remove:d` 还原）
- 测试后已还原：UI 语言回 English、polish 配置清空、长名测试人设与规则已删（配置从 `.r27bak` 还原）、mock 进程已停、模型选回 parakeet

## 一、#77 三项回归

| 修复项 | 结果 | 证据 |
|---|---|---|
| F8 改写不显人设徽标 | ✅ 通过 | 【实测】同一台机、同一条 notepad→To my boss 规则：F8 改写录音时悬浮条**只有波形+取消**（shots/01）；普通 RightCtrl 听写时**徽标 "To my boss" 正常显示**（shots/02）。一正一反双向验证，非单侧观察 |
| Parakeet 下隐藏中文 ITN 开关 | ✅ 通过 | 【实测】Parakeet 选中时 Speech 页无 "Format spoken numbers (Chinese)"（shots/03）；切回 whisper tiny 后该开关重新出现（shots/05/07）。【源码】`itn.ts` 全文只有中文正则、`polish.ts:314` 是唯一调用点，主进程无任何英文数字规则——本轮实测英文 "round twenty seven"→"round 27" 是 **Parakeet 模型自带 ITN**，与该开关无关，故隐藏不损失任何英文能力（这条特意反查过，否则会误判成 P2） |
| mock 脚本 + 回归清单 F8 全链路节 | ✅ 通过 | 【实测】按清单原文照做：`node desktop/scripts/mock-rewrite-server.mjs` → 设置填 mock 三项 → 选中文本按 F8 口播 "Make this sentence formal, please." → 选区被替换为 `MOCK-REWRITE: ...`（shots/01 落字 + 剪贴板全文）。清单步骤可照抄执行，无缺步 |

**核心链路回归（本轮包实测）**：RightCtrl 长句 "Can you check the numbers before the meeting? We should invite Peter Johnson and I am testing round 27." —— 问号正确、Peter Johnson 不拆句、连词 "and I am" 不拆（历轮 P1 病灶零复发）；Alt+Q 免按两句连落（history 双条）。**0 回归。**

## 二、本轮新发现

### [P2-1] 本机写入失败被归类为「network error」，把用户排障方向带偏
- 【实测】仅用 `icacls models /deny Administrator:W` 拒写模型目录（**全程未动网络、未开防火墙**），点 Download model → 报错 `Download failed: network error — check your connection and try again.`（shots/07）。真实原因是本机权限/写入失败，与网络无关。
- 影响面不只权限：磁盘满（ENOSPC）、目录被安全软件锁定、OneDrive 同步占用都会落到同一分支，用户会去反复查网络/换源，永远查不到。这是历轮"人话文案"工作的漏网场景——文案很人话，但**归类错了**。
- 修复建议（~10 行 + 5 语言一条 key）：`downloadError` 归类在现有「网络类/校验类」之外增加第三类「本机存储类」，命中 `EACCES|EPERM|EBUSY|ENOSPC|EROFS` 或 rename/write 阶段异常时给出「无法写入模型目录 — 请检查磁盘空间与文件夹权限」。原则应是**按用户下一步该做什么分类，而不是按异常来源分类**。

### [P2-2] 窄窗口 + 长人设名时，历史卡片操作链接逐字竖排换行
- 【实测】窗口宽 700px、条目人设名较长时，卡片头部 Copy/Correct/Delete 三个链接被挤成每字一行（"복\n사"、"교\n정"、"삭\n제"，shots/28）；同页短人设名的条目正常单行——说明是挤压不是语言问题。
- 【源码】`History.tsx:140-146`：meta `<span>` 无 `min-w-0 truncate`、动作 `<span className="flex gap-3">` 无 `shrink-0`，flex 空间不足时全部压给动作区。
- 修复建议（2 个 class）：meta 加 `min-w-0 truncate`，动作容器加 `shrink-0`。同族的窄窗口挤压（Personas 卡 "복제하여 편집" 换行，shots/26）一并解决。

### [P3] 其余打磨
- ko 首页四步卡内 "유지" 被断成 "유\n지"（shots/24），是等宽小卡的常规换行，可给 4 个步骤卡加 `break-keep`/放宽卡宽，非阻塞。
- Add rule 新行人设默认 Default（第 26 轮遗留）：**重评维持 P3，不升级**。Default 只是占位，用户建规则后必然会选；更划算的是把它显示成 placeholder「选择人设」而非一个看起来已生效的合法值。
- 首页人设规则入口（第 24 轮遗留）：**重评结论：不做**。Personas 已在一级导航第三位，首页再加入口属重复入口；可发现性真要提升，应该是「第一次命中规则时悬浮条那枚徽标本身」承担教育职责（现已具备），而不是再加静态链接。没有新用户数据前不投入。

## 三、专项①：Speech 页下载错误切页后持久显示（历轮候选，本轮首次实测）
- 【实测通过】制造失败后：Speech → Home → Speech，红字错误仍在（shots/08）；Speech → General → Speech，红字仍在（shots/09）。#74 的 `lastError` 内存级持久化真机有效，此前"仅源码级通过"的挂账可以销掉。
- 重启后不保留：**产品上正确**，重启即重试语义清晰，不建议落盘。

## 四、专项②：五语言逐页走查（zh-TW / ja / ko 全量，en 复位）
- 【实测】zh-TW：Home/History/Personas/Dictionary/Settings 四 tab 全页（shots/14-18）——无未翻译 key、无溢出截断，警示条与"复制以编辑"等长文案排版正常。
- 【实测】ja：General/Speech 全量（shots/21-22）——「認識言語」「モデルのダウンロード」等新文案自然，无溢出。
- 【实测】ko：General/Home/Personas（shots/23-25）——警示条 "규칙은 AI 다듬기 모델이 설정된 경우에만 적용됩니다..." 两行内排完，Alt+1..9 徽标未挤压。
- 语言下拉里 `中文 Chinese / English` 这类保留原生名是刻意设计，不算未翻译。
- 唯一问题就是 P3 的 ko 四步卡换行；**五语无 P1/P2 级文案问题**。

## 五、专项③：窄窗口 / 长人设名布局
- 【实测】长人设名（66 字符）命中时悬浮条徽标截断为 "Extremely Long Per…"，**波形与取消按钮完整、面板不溢出**（shots/11）——`max-w-[120px] truncate` 有效。
- 【实测】主窗口缩到 700×560：侧栏/卡片/设置项全部自适应，无横向滚动条、无控件重叠（shots/26/27/29）；唯一缺陷是上面的 P2-2。
- 建议：把 700px 宽作为窄窗口回归基线写进清单（当前清单只按默认窗口走查）。

## 六、反问现有设计
1. **`rewriteTarget` 判空来区分模式**（#77 的做法）1 行奏效，但 `dictation.ts` 里已有 3 处隐式依赖它；上轮提的 `status.mode`（dictate/rewrite/handsfree）字段化仍是正确方向，属技术债 P3，等下次动到这块时顺手做。
2. **错误分类的第一原则应是「用户下一步动作」**（网络 / 校验 / 本机存储 / 配置），当前是"按异常来源猜"，P2-1 就是这个原则缺位的产物。
3. **F8 mock 已进仓库，下一步值得把它脚本化成 e2e**：本轮的按键+TTS 手法（`keybd_event` + System.Speech）可以固化成 `desktop/scripts/e2e-rewrite.ps1`，让 F8 全链路从"人工照清单点"变成一条命令，成本约半天。
4. 悬浮条信息优先级现在是「人设徽标 → 波形 → 取消」，长名场景下徽标最先挤压波形宽度。若未来再加信息（如引擎名），应给徽标 `max-w` 之外再加窗口窄时直接隐藏的规则，保住波形这一核心反馈。

## 七、问题清单与修复建议汇总
- **P0 = 0，P1 = 0**
- **P2-1** 本机写失败误报为网络错误 → 加「本机存储」错误类（~10 行 + 1 条 5 语文案）。
- **P2-2** 窄窗口历史卡操作链接逐字换行 → `min-w-0 truncate` + `shrink-0`（2 个 class）。
- **P3** ko 四步卡换行、Add rule 默认人设改 placeholder、`status.mode` 字段化、窄窗口基线入回归清单。

## 八、下轮优先级排序
1. P2-1 下载错误增加「本机存储」类（唯一会真实误导排障的问题）。
2. P2-2 历史卡窄窗口挤压（2 个 class，顺带 Personas 卡）。
3. F8 全链路 e2e 脚本化 + 窄窗口 700px 基线入回归清单。
4. （低优）`status.mode` 字段化、Add rule placeholder、ko 四步卡 `break-keep`。

## 九、未验证清单
- 真实 LLM 端点的改写质量（mock 只验链路不验质量）、真人麦、中文真人口播、APK、官网（本轮无相关变更）。
- 磁盘满（ENOSPC）真实触发（本轮用权限拒写代表本机写失败一类，同分支未逐个触发）。
- 非 en 欧洲语系系统（de/fr）的 #76 默认值分支（同一正则路径，仅 en-US 实测）。
- 小时级 soak 与多模型叠加内存（本轮未跑，历轮 ~1.1-1.26GB 无恶化）。
