# SpeakType 严格审查报告（审→改循环 · 第 29 轮）

- 审查日期：2026-08-15
- 对象：main@ee49493（含 PR #79），本地 `npm run pack:dir` 全绿，实测 `release\win-unpacked\SpeakType.exe`
- 环境：Windows Server 2022 / 1280×720 / en-US；VB-Cable + System.Speech TTS 驱动真实识别
- 截图：`C:\Users\Administrator\speaktype-review\round29\shots\`（01-10）
- 证据分级：【实测】真机复现 / 【源码】行号级推断 / 【未验证】
- **未开防火墙、无网络阻断**；存储错误场景用 `icacls` 拒写模型目录复现（用完已 `/remove:d`，ACL 已验证无残留）；本轮为验证 P2-2 **真装了 Ollama**（qwen2.5:0.5b），测试后已停进程并移除自启动；mock 服务已停；润色配置已还原为关闭

## 一、#79 三项回归 —— 全部实测通过

| 修复项 | 结果 | 证据 |
|---|---|---|
| 存储错误 fail-fast + GH 源按资产存在性附加 | ✅ | 【实测】同样拒写场景下 whisper base 下载 → **"Download failed: cannot write to the models folder — check disk space and file permissions."**（shots/02，上轮此处报 network error）。日志只见 HF/镜像两源 EPERM 即抛出，**无 GH 404 记录**——两处修复（挑错误 + 不再拼不存在的 GH 资产）同时生效，报错还更快（fail-fast） |
| 润色/F8/测试连接 key 可选 | ✅ | 【实测】mock 端点 + **空 Key**：Test connection → "Connected: mock"（shots/06）；F8 全链路选区替换成功（shots/07）。**真实 Ollama 端到端**见下 |
| 润色降级 toast | ✅ | 【实测】润色指向死端口后听写：落字为原文（history 记录 raw==text）+ 弹 **"Polish service unavailable — Inserted the raw transcript without AI polish"**（shots/08）。降级不丢字、有提示，两个要求都达标 |

## 二、专项②：Ollama 真实端到端（P2-2 修复的真环境验收）

【实测】本机安装 Ollama + `qwen2.5:0.5b`（CPU 推理）：

- AI model 页：Base URL `http://127.0.0.1:11434/v1`、**API Key 留空**、模型 `qwen2.5:0.5b` → Test connection 显示 "Connected: qwen2.5:0.5b"（shots/10）；
- 真实口述（含语气词）：raw "Um so basically I think we should um move the meeting to Friday." → 落字 "I agree with your suggestion. Moving the meeting to Friday is a good idea."——语气词清除、句子成形、**应用人设规则（notepad→To my boss）照常命中**；
- 全程无 key、无网络出站，「识别+标点+润色全本地」链路第一次真机闭环。0.5b 小模型有轻度改写过度（补了句 "I agree with your suggestion"），属模型选择问题非产品问题，文档可建议 3b+。

## 三、专项①：两个 P3 升级评估

1. **切模型立即释放旧 worker：建议升级 P2**。第 28 轮实测数据即证据：切换后立刻听写峰值 2523MB（旧 SenseVoice worker 驻留），空闲释放要等 ~5 分钟；修复只需在 localModel 变更时停掉旧 worker（~5 行），把峰值压回 ~1.4GB。8GB 内存 + 浏览器的真实用户场景里 2.5GB 瞬时占用有实际挤压风险，修复成本又极低，ROI 明确。
2. **应用内更新提示：维持 P3，但给出最小方案**。竞品对照：Wispr Flow 有静默自动更新；Handy（Tauri）带 updater；CapsWriter 手动。SpeakType 目前只有 About 页 Releases 外链，用户几乎不会主动查。**不建议上 electron-updater 全量自动更新**（签名/回滚/差分包工程量大），建议轻量版：启动时拉一次 GitHub latest release tag（已有 GH 访问链路），有新版就在 About/首页给一行「新版本 vX.Y.Z 可用 → Releases」提示，~30 行、无自更新风险。何时做取决于发布节奏（当前一月多版，值得排上）。

## 四、③ 非英文文案走查

【实测】zh-CN 界面：AI 模型页 placeholder「API Key（Ollama 等本地端点可留空）」单行不溢出（shots/09）；【源码】ja/ko/zh-TW 的 modelApiKey/polishFallback 新 key 五语齐全、译文自然（ja 最长 21 字符，输入框宽度充裕）。零 P1/P2。

## 五、④ 新发现

### [P3] 模型目录只读（拒写）时已下载模型被误判「未配置」
- 【实测】拒写 ACL 生效时，**已完整下载的 Parakeet 在 Speech 页显示 "Not configured" + "Download model" 按钮**（shots/04）；解除 ACL 恢复 "Ready"（shots/03）。
- 【源码+实测定位】`modelReady()` 用 `existsSync` 判断（localasr.ts:76），而 Node 的 `existsSync`/`stat` 在该 deny-W ACL 下返回 false（同文件 PowerShell `Test-Path` 为 True，node 单测复现 false）——libuv stat 打开句柄的访问位受 deny 影响。
- 影响：安全软件/权限收紧场景下，用户会看到"模型丢了"并可能点下载（下载会正确报存储错误，不至于误导到网络方向）。低频边角，修法也不显然（需要区分 stat 失败原因），**记录在案不建议本轮投入**。

### 其余
核心链路本轮多次真机通过（RightCtrl 听写落字、F8 改写、人设规则命中、降级路径）；General/Speech/AI model/About 四 tab 复查无新 P1/P2。

## 六、问题清单汇总
- **P0 = 0，P1 = 0，P2 = 0（新发现）**
- 升级建议：**切模型立即释放旧 worker P3→P2**（第 28 轮实测 2.5GB 峰值为据，~5 行）
- P3：应用内更新轻量提示（~30 行最小方案已给）；只读模型目录误判未配置（记录在案）

## 七、下轮优先级建议
1. 切模型立即释放旧 worker（P2，~5 行 + 复测峰值）。
2. 应用内新版本提示（P3 最小方案，~30 行）。
3. 文档/官网跟进「全链路本地零 key」叙事（Ollama 配置指引 + 建议 3b+ 模型），这是对 Wispr Flow 的硬差异化卖点，本轮已真机验证可用。

## 八、未验证清单
- ENOSPC 磁盘满真实触发（存储类只验了 EPERM）；真人麦、中文真人口播、APK、官网（本轮无变更）；GH 第三源全量真实下载链路；Ollama 大模型（3b+）润色质量。
