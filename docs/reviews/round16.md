# SpeakType 严格审查报告（审→改循环 · 第 16 轮）

- 审查日期：2026-08-14
- 对象：main@2172895（PR #66-#70 合并后），本地 `npm ci && npm run pack:dir` 全绿（退出码均 0，signtool 签名步骤通过），实测 `release\win-unpacked\SpeakType.exe`
- 环境：Windows Server 2022（1280×720），VB-Cable + System.Speech 英文 TTS 驱动真实识别链路；全新 userData 模拟新用户（原数据备份为 SpeakType-r16backup）
- 截图：`C:\Users\Administrator\speaktype-review\round16\shots\`（01-14）
- 证据分级：【实测】真机复现；【源码】行号推断；【未验证】环境限制

## 一、第 13-15 轮修复回归结论

| 修复项 | 结果 | 证据 |
|---|---|---|
| #68 断点续传（Range + .part.json） | ✅ 通过 | 【实测】Parakeet encoder 下到 29.6MB/622MB 时强杀进程 → .part 与 .part.json（url/etag/total）完整保留 → 重启点击下载 16s 完成（对照全量约 30s），日志无新增 source failed，落字实测正常 |
| #68 sha256 完整性校验 | ✅ 通过 | 【实测】.part.json 中 etag=acfc2b44…（64 位 hex，与 HF LFS oid 一致）；下载完成即改名，无 mismatch。【源码】download.ts:148-155 校验失败删残片抛错逻辑正确 |
| #69 期望 sha256 取 302 X-Linked-ETag | ✅ 通过 | 【源码】download.ts:51-77 手动跟随重定向沿途捕获，只认 64 位 hex；【实测】HF 直连下载校验通过未误报 |
| #69 首页下载失败可见报错 | ✅ 通过 | 【实测】hosts 三源全断后点 Download → 横幅红字报错 + Download 按钮恢复可重试（shots/08）；不再静默 |
| #70 GitHub Releases 第三源 + 换源失败日志 | ✅ 通过 | 【实测】三源逐一落 `download source failed: <url>` warn（huggingface.co → hf-mirror.com → github.com/…/models-v1/…），最终 `download failed` 汇总（main.log 14:44:56） |
| #66 Parakeet 语言下拉联动 | ✅ 通过 | 【实测】选中 Parakeet 后识别语言下拉禁用（灰显），提示"Parakeet auto-detects English and 25 European languages — no Chinese/Japanese/Korean/Cantonese. For those, switch the model to sensevoice-small."浅色/深色都正确（shots/04、14） |
| #64/#65 暗色遗留复核 | ✅ 保持 | 【实测】全新首启深色主内容区正确深底（shots/01）、原生 select 弹层深底浅字（shots/03）、设置 tab 选中态 indigo 高亮（shots/09）、主题下拉即时切换浅色（shots/12、13） |
| 核心链路 | ✅ 无回归 | 【实测】RightCtrl 长按 → Parakeet 实时字幕 → 落字逐字精确："We should invite Peter Johnson to the quarterly review meeting on Friday and prepare the slides before Thursday evening."（标点大写全对，Notepad 剪贴板取证） |

**P0 = 0，P1 = 0。**

## 二、问题清单

### 1. [P2] 已完整下载的 .part 重启续传时被误判"源失败"，整包 652MB 重下一遍
- 【实测】encoder 下满（.part=652,184,281 字节 == meta.total）但进程在 hash/改名前被杀 → 重启点下载 → Range `bytes=652184281-` → HF 返回 416 → 该源记 `source failed …HTTP 416 (huggingface.co)` warn（main.log 14:40:43）→ 回退 hf-mirror 从零重下整包（本机 27s 内完成，普通宽带用户要再等几分钟）。
- 【源码】download.ts:113-114：416 不属 3xx，`!res.ok` 直接抛错；没有"offset 已达 total"的分支。
- 建议：`downloadFromUrl` 开头若 `meta && offset >= meta.total && meta.total > 0`，跳过网络直接 hash 校验 + 改名；或把 416 视为"可能已完成"走校验路径。约 6 行。

### 2. [P2] 下载失败报错文案是原始异常串，不面向用户
- 【实测】三源全断时首页横幅显示 "**fetch failed**"（shots/08）——这是 Node fetch 的原始 TypeError message，用户不知道该干什么。
- 建议：错误分类映射为人话（网络不通/磁盘不足/校验失败），附"检查网络后重试"指引；报错行加重试按钮语义（现在 Download 按钮虽会恢复，但与红字并排含义不明）。

### 3. [P2] 增强标点英文边界句问题（第 12 轮 P2-3）未处理，原样复现
- 【实测】函数级复测（同一 ct-transformer 模型）："can you check the numbers before the meeting I met Sarah this morning she said the roadmap is ready we can start next week" → "…before the meeting**？**I met Sarah this morning**，**she said…"——问号仍错位在句中，"she said，"冗余逗号仍在。新句 "what time is the meeting tomorrow and who is joining**。**" 疑问句收句号也错。
- #66-#70 未涉及标点逻辑（【源码】punct.ts / polish.ts 本轮 diff 无改动），属已知遗留而非回归。
- 建议：a) 模型级限制，后处理规则难救语义——把这批句子收进 docs/regression-checklist.md 固化基线即可，不建议再投工程去修模型；b) 文案校准见下条。

### 4. [P2] 设置页文案三处与现状不符（文案校准）
- 【实测】Speech 页简介仍是 "The **sensevoice** model shows live captions while you talk; **whisper** models transcribe the whole utterance at once."——漏了 Parakeet（第 12 轮实测 Parakeet 也有实时字幕），新用户会以为选 Parakeet 没字幕。
- 【实测】选 Parakeet（不支持中文）时 "Force Simplified Chinese" 开关仍显示可切（其描述自限 whisper，但控件本身应随引擎隐藏/禁用，与 #66 语言联动同理）。
- 【实测】Theme 描述固定为 "Follow system switches with the Windows light/dark setting."，选了 Light/Dark 后描述不变，语义错位（shots/12）。
- 增强标点描述 "much better than the built-in rules" 总体成立（中文/常规英文实测确实好），保留可以，但建议补一句"长段连读的复杂句界仍可能出错"管理预期。

### 5. [P2] 第三下载源（GitHub Releases）没有 sha256 校验
- 【源码】期望 sha256 只来自 HF 302 的 X-Linked-ETag（download.ts:51-54）；GH Releases 直链无此头 → `expected=""` → download.ts:148 整段校验跳过。第三源恰恰是前两源都失败的兜底场景，反而无完整性保护。
- 建议：在 models-v1 release 附一份 sha256 清单资产（或直接把各文件 sha256 硬编码进 ghAssetSource 映射），第三源下载后照常校验。

### 6. [P2·设计反问] 中断后的恢复体验：重启不自动续传、按钮无"继续下载"状态；多文件进度按个数均分
- 【实测】下载中退出应用重启后，Speech 页回到 "Download model" 初始按钮——已有 29.6MB 残片这一事实用户不可见，也不自动恢复；用户若不再点一次就永远停在 Not configured。
- 【源码】downloadFiles（download.ts:186-188）进度按文件个数均分：Parakeet 的 encoder（652MB）与 tokens（几百 KB）各占一档，观感是进度条在某一档内爬完 90% 时间——按字节加权更真实。
- 建议：a) 存在 .part 时按钮文案改 "继续下载（已完成 x%）"；b) 启动时检测半途 .part 可选自动恢复；c) 进度按 total 字节加权。

## 三、性能取样

- 【实测】Parakeet worker 活跃时进程组工作集 1256.7MB（与第 12 轮 ~1.26GB 一致，无恶化）；worker 空闲释放机制沿用（本轮未等 10 分钟复测，源码未动）。
- 【实测】断点续传本机 HF 直连吞吐约 26MB/s；SenseVoice 全量 ~30s、Parakeet 全量 ~90s（第 12 轮）量级不变。

## 四、总评与下一轮优先级建议

第 14-15 轮下载专项的方向和实现质量都是对的：**.part + 元数据 + Range + X-Linked-ETag sha256 是业界标准做法，实测续传/校验/换源/可见报错全部工作**。本轮 0 P0 / 0 P1，剩余全是打磨级 P2。

下一轮建议顺序（如无异议将按此提交给开发方）：
1. **416/完成态 .part 处理**（问题 1，~6 行，避免最贵的 652MB 白下）+ **第三源 sha256 清单**（问题 5，同一专项收尾）。
2. **失败文案人话化 + 继续下载按钮状态**（问题 2、6a，同一处 UI，一起做）。
3. **设置页文案三处校准**（问题 4，纯文案，半小时）。
4. 增强标点边界句收进回归清单固化基线（问题 3，不投模型工程）。
5. 进度字节加权（问题 6c，可选）。

## 五、未验证项（如实声明）

- 真人麦克风、中文真人口播（VM 无中文 TTS）、云端三通道、Android APK 实机、portable 包、小时级 soak、hf-mirror 实际链路质量（本轮 mirror 只在 416 回退和 hosts 断源两个场景被动触发）、GH 第三源真实下载（仅日志证实其被尝试；models-v1 资产是否齐全未逐一核对）。
