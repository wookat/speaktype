# SpeakType 严格审查报告（审→改循环 · 第 28 轮）

- 审查日期：2026-08-14/15
- 对象：main@54e9d9f（含 PR #78），本地 `npm run pack:dir` 全绿，实测 `release\win-unpacked\SpeakType.exe`
- 环境：Windows Server 2022 / 1280×720 / en-US；VB-Cable + System.Speech TTS 驱动真实识别
- 截图：`C:\Users\Administrator\speaktype-review\round28\shots\`（01-11）；soak 日志 `round28\soak.log`
- 证据分级：【实测】真机复现 / 【源码】行号级推断 / 【未验证】
- **未开防火墙、无网络阻断**；存储错误场景用 `icacls` 拒写模型目录复现（用完已 `/remove:d`，模型目录/配置/人设/增强标点开关全部还原）

## 一、#78 三项回归

| 修复项 | 结果 | 证据 |
|---|---|---|
| 下载错误增「本机存储」类 | ⚠️ **部分通过（见 P2-1）** | 【实测】拒写模型目录后下载 Parakeet → 正确显示 "cannot write to the models folder — check disk space and file permissions"（shots/03）。**但同一拒写下下载 whisper base → 仍显示 "network error"**（shots/05），修复未覆盖 whisper 系模型，根因见 P2-1 |
| 窄窗口卡片按钮不换行 | ✅ 通过 | 【实测】700px 窗口 + 66 字符长人设名：历史卡 meta 以 "…" 截断、Copy/Correct/Delete 稳定单行（shots/06）；Personas 卡 "Duplicate & edit"/"Edit Delete" 单行（shots/07）。上轮逐字竖排问题消失 |
| 700px 窄窗基线入回归清单 | ✅ 通过 | 【源码】清单新增窄窗条目；本轮即按该基线走查 |

**测试员问题答复（人设卡长名换行 vs 截断）**：**维持换行，不要加 truncate**。人设卡是用户辨认/挑选人设的地方，名字相近时区分信息恰恰在尾部；卡片高度本就随 prompt 行数浮动，换行零成本。截断只该用在单行寸土寸金的位置（悬浮条徽标、历史 meta），这两处已做对。

## 二、专项①：60 分钟 soak（真机连续听写）

【实测】自动化脚本连续跑 60 分钟：RightCtrl 长按听写为主、每 10 轮插一次 Alt+Q 免按两句，共 **235 轮、落字 258 句（history 19→277 条）**：

- **0 崩溃、0 失败条目**（history 无 status=failed），进程全程存活；
- **内存无泄漏**：起点 1212MB（含前轮驻留），首轮峰值 1382MB，此后稳定在 **1070-1130MB** 区间震荡直至结束（1080MB），60 分钟斜率为零（soak.log 全程记录）；
- 落字质量稳定：结束时最新条目 "Round 28 Soak iteration continues without any problem." 逐字正确；
- 长时间使用（Wispr Flow 用户日均数百句）这一档可以放心，长稳挂账（历轮"未验证：小时级 soak"）**销掉**。

## 三、专项②：多模型叠加内存峰值

【实测】增强标点包（281MB）从 UI 下载 ~90s 完成、"Add-on ready" 就绪：

| 场景 | 内存 |
|---|---|
| 冷启动（模型未加载） | 693MB |
| Parakeet + 增强标点听写后 | 1381MB |
| SenseVoice + 增强标点听写后（重启后） | 1065MB |
| **切回 Parakeet 立刻听写（SenseVoice worker 仍驻留）** | **2523MB（峰值）** |
| 空闲 ~5.5 分钟后 | **435MB**（空闲释放全部生效） |

结论：叠加峰值 2.5GB 只出现在「切换模型后立刻听写」的窗口期，且空闲释放机制 5 分钟内回到 435MB，无泄漏。**改进建议（P3，~5 行）**：切换 localModel 时立即停掉旧模型 worker，而不是等空闲计时器——切换本身就是明确的"不再用旧模型"信号，可把峰值从 2.5GB 压回 ~1.4GB，8GB 内存+浏览器场景更稳。

## 四、本轮新发现

### [P2-1] 「最后一个源的错误」覆盖真实错误：whisper 系模型的存储失败仍报「network error」
- 【实测铁证】同一拒写状态下：Parakeet 下载 → 存储类文案（shots/03）；whisper base 下载 → **network error**（shots/05）。日志给出根因：
  - Parakeet 需建子目录，三个源全部 `EPERM ... mkdir`，最后错误=EPERM → 存储类 ✅；
  - whisper 写模型根目录（已存在，mkdir 不报错），HF/镜像两源在写 `.part.json` 时 `EPERM`，**但 GitHub 第三源对 whisper 没有资产、先 404**（`HTTP 404 (github.com)`），`downloadFile` 抛「最后一个错误」→ 404 → 网络类 ❌。
- 【源码】`download.ts:206-216`：顺序尝试、`throw lastError`；`GH_ASSET_SHA256`（download.ts:16-23）只含 sensevoice+parakeet 六个资产，whisper/VAD/增强标点在 models-v1 里**根本没有资产**，`hfSources` 却照样拼上 GH URL（注释自认"不存在的资产 404 后正常报错"）——这个 404 恒定发生并恒定成为「最后错误」，把前两源的真实错误（无论存储还是网络）全部覆盖。
- 修复建议（两处小改，合并 ~10 行）：
  1. `hfSources` 只在 `GH_ASSET_SHA256` 里有对应资产时才附加第三源（1 行判断），顺带消掉每次 whisper 下载必产生的 404 噪声日志；
  2. `downloadFile` 挑错误时按「可操作性」优先：任一源出现存储类错误即优先抛它（存储错误重试其他源毫无意义，还可以直接 fail-fast 省去两次无效尝试）。
- 这条是第 27 轮 P2 的**未闭合部分**，不是新引入回归；#78 的归类正则本身是对的。

### [P2-2] AI 润色强制要求 API Key，本地无鉴权端点（Ollama / LM Studio）被挡死
- 【源码】`polish.ts:311` `useLlm` 要求 `polishApiKey` 非空、`rewriteSelection`（polish.ts:270）同样、ModelTab Test 按钮 `disabled={!s.polishApiKey}`（ModelTab.tsx:73）。本地 Ollama/LM Studio 默认无鉴权是最常见的免费润色方案（也是隐私卖点的自然延伸：识别已全本地，润色本地化顺理成章），现在必须手填一个假 key 才能用，且界面零提示。
- 修复建议（~4 行）：key 改为可选——仅在非空时带 `Authorization` 头；`useLlm`/`rewriteSelection`/Test 按钮的判断只要求 baseUrl+model；API Key 输入框 placeholder 注明"本地端点可留空"。
- 【未验证】未实际装 Ollama 验证端到端，但拦截逻辑是纯源码可判定的。

### [P2-3] 普通听写润色失败静默回退，无任何提示
- 【源码】`polish.ts:346/350-351`：LLM 非 200 或异常时 `return cleaned`，落字继续但**无 toast、无历史标记**，历史条目照记人设名——用户以为"To my boss"生效了，实际落的是未润色原文。F8 改写路径是对的（失败→专属 toast+选区不动，dictation.ts:565-573），普通听写却静默。与历轮"自愈不告知"同族（第 5 轮 history 重建、第 21 轮规则静默失效都是此类）。
- 修复建议（~6 行）：回退时发一次轻量 toast（"润色服务不可用，已按原文落字"），并考虑该条历史 personaName 标记为 Default 或加注记。降级落字本身是对的，不要改成失败。

### P3 打磨
- 模型切换不立即释放旧 worker（见专项②，~5 行）。
- About 页只有 Releases 外链，无「检查更新」——竞品（Wispr Flow/Handy）均有应用内更新提示；可先做轻量版：启动时比对 GitHub latest release tag，有新版在 About/首页给一行提示（不做自动更新）。
- General 页反问走查其余项（快捷键录制、静音其他应用、手机麦克风二维码、麦克风测试电平条）源码级无发现，交互与文案一致。

## 五、设计反问
1. **多源回退的错误语义**：当前"谁最后失败听谁的"在源之间错误类型不同时必然失真。正确语义是"报最可操作的错误"（存储 > 校验 > 网络），P2-1 即此原则的实例。
2. **降级要不要出声**：本产品已多次在"静默自愈/静默降级"上翻车（P2-3 是第三次同族问题）。建议立一条产品守则进回归清单：**任何降级路径必须有一次性用户可见信号**（toast 或状态条），静默只允许用于无损重试。
3. **本地优先叙事的最后一块**：识别、标点、VAD 已全本地，润色仍默认云端 key。P2-2 修掉后，「全链路本地、零 key 零上传」即成为对 Wispr Flow（强制云端）的硬差异化卖点，建议官网跟进这个叙事。

## 六、问题清单汇总
- **P0 = 0，P1 = 0**
- **P2-1** whisper 系存储错误被 GH 404 覆盖仍报网络错误（#78 未闭合部分；两处 ~10 行）
- **P2-2** 润色强制 API Key，挡死本地无鉴权端点（~4 行）
- **P2-3** 普通听写润色失败静默回退无提示（~6 行）
- **P3** 切模型立即释放旧 worker；应用内更新提示；（上轮遗留维持不变）

## 七、下轮优先级建议
1. P2-1 错误挑选 + GH 源按资产存在性附加（彻底闭合下载错误人话化）。
2. P2-2 本地端点免 key（解锁全本地润色叙事）。
3. P2-3 润色降级 toast（+把"降级必须可见"写进回归清单）。
4. 低优：切模型释放旧 worker、应用内更新提示。

## 八、未验证清单
- Ollama/LM Studio 真实端到端（P2-2 为源码级判定）；ENOSPC 磁盘满真实触发；真人麦、中文真人口播、APK、官网（本轮无变更）；GH 第三源全量真实下载链路。
