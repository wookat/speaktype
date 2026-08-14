# SpeakType 严格审查报告（审→改循环 · 第 19 轮）

- 审查日期：2026-08-14
- 对象：main@5dd1c05（含 PR #71、#72），本地 `npm ci && npm run pack:dir` 全绿（两命令退出码均 0，signtool 签名步骤通过），实测 `release\win-unpacked\SpeakType.exe`
- 环境：Windows Server 2022（1280×720），VB-Cable + System.Speech TTS 驱动真实识别链
- 截图：`C:\Users\Administrator\speaktype-review\round19\shots\`（01-31）
- 屏蔽类测试按要求使用 netsh ipsec static 按 IP 阻断（未动防火墙），测试后已删除策略并验证 huggingface.co 恢复 200、无 r19 残留
- 证据分级：【实测】真机复现；【源码】行号推断；【未验证】环境限制

## 一、#71 / #72 修复回归结论

| 修复项 | 结果 | 证据 |
|---|---|---|
| 已下满 .part 零网络本地收尾（防 416 整包重下） | ✅ 通过 | 【实测】构造 encoder.int8.onnx.part（652,184,281B = meta.total，etag=已知 sha256）→ 点击按钮 → 28.1s 内本地 hash+改名完成，日志仅 "local model parakeet-tdt-0.6b-v3 downloaded"，**无任何 HTTP 416、无 download source failed 换源日志**，模型文件就位（对比第 16 轮 P2-1：同场景整包重下 652MB） |
| GH 第三源显式 sha256 清单 | ✅ 源码确认+间接实测 | 【源码】download.ts GH_ASSET_SHA256 六条与 HF LFS oid 一致（encoder acfc2b44… 与第 16 轮实测 oid 相符）；knownSha256 在 X-Linked-ETag 缺失时兜底 expected。【实测】本地收尾路径正确采信清单 etag 完成校验。【未验证】GH 源真实完整下载链路（未走完第三源全量下载） |
| 下载失败人话文案 | ✅ 通过 | 【实测】netsh ipsec 阻断 HF/mirror/GH 全部 IP → 点击 Resume → 首页红字 "Download failed: network error — check your connection and try again."（shots/05），日志逐源三条 source failed；失败后按钮保持 "Resume download (40% done)" 可重试，.part 保留 |
| 「继续下载（已完成 x%）」按钮 | ✅ 通过 | 【实测】base-q5_1 40% 残片：设置→Speech 按钮 "Resume download (40% done)"（shots/03）、首页横幅同步显示（shots/04）；parakeet 已下满残片显示 99% 上限（shots/01）；失败后保留显示 ✓ |
| Theme 三档 hint | ✅ 通过 | 【实测】Light 选中时五语 hint 均为「始终浅色、不随 Windows」语义（en/zh-CN/zh-TW/ja/ko，shots/07/12/18/24），不再固定写"跟随系统" |
| Parakeet 选中隐藏简体开关 | ✅ 通过 | 【实测】parakeet 选中无 Force Simplified Chinese（shots/28）；切回 whisper base 恢复显示（shots/03），条件渲染正确 |
| asrLocalHint 提及 parakeet 实时字幕 | ✅ 通过 | 【实测】"The sensevoice and parakeet models show live captions…"（shots/01）；zh-CN "sensevoice / parakeet 模型录音中实时显示字幕"（shots/11） |

## 二、五语文案走查（en / zh-CN / zh-TW / ja / ko）

全部五语逐一切换实测（shots/01/03-05、07-11、12-14、18-19、24-25）：

- Resume 文案：en "Resume download (40% done)" / zh-CN「继续下载（已完成 40%）」/ zh-TW「繼續下載（已完成 40%）」/ ja「ダウンロードを再開（40% 完了）」/ ko「다운로드 이어받기 (40% 완료)」——均自然、无截断、无溢出（首页横幅按钮与设置页按钮双处验证）。
- Theme 三档 hint 五语均自然（ja「Windows の設定に関わらず、常にライト外観を使用します。」、ko「Windows 설정과 관계없이 항상 라이트 테마를 사용합니다.」）。
- 网络错误文案 en 实测显示正常（zh 等四语【源码】确认存在同 key，未逐语触发失败）。
- 无发现布局破坏；界面语言切换即时生效（uiLanguageHint 属实）。

## 三、核心链路例行回归（0 回归）

- 【实测】RightCtrl→实时字幕→落字（Parakeet）：口播 "The quarterly report is ready and I will share it with the team on Monday morning. Can you review the budget numbers before our meeting?" → Notepad 落字逐字精确、句号/问号/大写全对（shots/29 + 剪贴板全文比对）。
- 【实测】Alt+Q 免按连续听写：两句先后口播 → "This is the first hands free sentence. And here comes the second sentence to confirm continuous mode." 两句连落、句间空格正确，再按 Alt+Q 退出正常。
- 【实测】F8 改写入口：按 F8 触发录音会话（日志 dictation finalize），静音路径正常结束无副作用；【未验证】完整改写链路（本机 AI 通道状态未重置，未走完改写全流程）。
- 【实测】Parakeet worker 活跃时进程组工作集 1109MB，与第 12/16 轮（~1.26GB 峰值）同量级无恶化。

## 四、本轮新发现问题

### P0 / P1：无

### P2-1 首页横幅文案与所选模型脱节（体积与措辞双重失真）
- 【实测】选中 base-q5_1（60MB）时首页横幅仍写 "One-time download (~234MB)"（shots/04）；ja/ko/zh 同样固定 234MB（shots/16/25）。
- 【源码】`home.model.desc` 五语硬编码 234MB（sensevoice 体积）；而 localasr.ts 已有各模型 size 表（234MB/660MB/32MB/60MB/190MB），横幅只需插值 `{{size}}`。
- 影响：选 parakeet 的用户按提示预期 234MB 实际下 660MB（差 2.8 倍）。修复约 10 行。

### P2-2 「incomplete」类失败仍透出原始异常串
- 【源码】download.ts 抛 `incomplete: ${got}/${total} bytes (host)`，而 downloadError.ts 归类正则只匹配 `incomplete download`——该错误既不中校验类也不中网络类，会原样透出 "incomplete: 123/456 bytes (huggingface.co)"。改正则为 `/sha256 mismatch|incomplete/i` 即可（1 行）。
- 【未验证】未真机触发该分支（需服务端提前断流）。

### P2-3 多文件进度按文件个数均分（第 16 轮 P2-6b 遗留，本轮专项评估：值得做，成本极低）
- 【源码】downloadFiles 以 `(index + got/total) / files.length` 计算——parakeet 四文件中 encoder 占字节 97.2%（652MB/670MB），但只占进度段的 25%：encoder 段每 1% 走 26MB，其余段每 1% 走 0.7MB，观感严重非线性。
- 评估结论：**值得做**。无需 HEAD 预检：GH_ASSET_SHA256 清单已硬编码，同处维护一张字节数表（或复用 localasr.ts size 表精确化为字节）即可按字节加权，~20 行；顺带可给横幅提供动态体积（与 P2-1 同 PR）。

### 设计反问与专项答复

1. **失败提示旁是否需要显式「重试」按钮？——不需要。** 实测失败后原下载按钮就地变回 "Resume download (40% done)"，按钮本身即重试入口且带进度语义，另加"重试"按钮反而重复。建议保持现状。
2. **设置页信息架构（4 tab：General/Speech/AI model/About）**：当前规模合理，不建议增删 tab。小改进：Speech tab 的 Status「Not configured」在模型未下载但已选好引擎时含义模糊（用户已"配置"只是没下载），可改为「模型未下载」；General 页 App behavior 区块 7 项略长，可把「字幕高度」并入未来的"悬浮条"分组，非本轮必做。
3. **首页信息密度**：合适。横幅→统计→4 步上手→当前人设的层级清晰；新用户 5 分钟零文档上手在本轮 ko/ja 语境下自查通过（4 步文案自解释、RightCtrl 徽标醒目）。唯一断点是 P2-1 的体积失真。
4. **竞品对照更新**（基于此前各轮已核实的功能面，本轮未重新联网核查竞品最新版本，下述定位为【源码/历史实测推断】）：Wispr Flow 的「按前台应用自动切 persona/语气」仍是我们差距最大且现有 UIA 能力可低成本复用的一项，维持第 12 轮建议为下一个最高价值功能；其次是历史搜索增强（当前仅线性分页，无关键词高亮/日期过滤）与历史导出（txt/md）。可发现性上，Alt+1..9 切人设已有提示，建议在历史页加一次性空态引导。

## 五、下一轮优先级建议

1. P2-1 + P2-3 合并一个 PR：横幅体积插值 + 字节加权进度（同一张字节表）。
2. P2-2 一行正则补漏。
3. 功能面启动「按应用自动切 persona」设计论证（先出方案再写码）。
4. 历史搜索/导出小步改进。

## 六、未验证清单（如实声明）

- GH Releases 第三源全量真实下载与其 sha256 校验失败路径。
- incomplete 分支真机触发。
- F8 完整改写链路、真人麦克风、中文真人口播、小时级 soak、Android APK、官网本轮未走查（无相关变更）。
