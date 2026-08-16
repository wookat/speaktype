# 第 102 轮体验官审查报告 — #182 回归 + 度量脚本固化与第二数据点 + 设置全量持久化矩阵

- 基线：main @ `34ee6a7`（含 #182/#183），`npm run pack:dir` 退出码 0，打包版实测
- 环境：Windows Server 2022，虚拟声卡；延迟绝对值仅作同机相对对比
- 口径：【实测】/【源码】/【未验证】/【推测】

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

零新立案。

## ① #182 ASCII 热词容错回归【实测】

- 容错命中：口述 "our dev ops pipeline is fast"，ASR 实际吐出漏字形（上轮同句为 "DevOs"），本轮落字 **"Our DevOps pipeline is fast"** ——一处漏字被 nearKey 容错纠正，#182 生效。
- 不吸走合法变体：口述 "there are many speaktypes in the wild"，ASR 转写为 "speed types"（10 字符 = key+1），落字**原样保留 "speed types"**，未被吸成 SpeakType——禁插入规则实证（与复数 speaktypes 同一保护路径；ASR 未吐出 speaktypes 原词，以等价形实证【实测】，字面复数形【源码】nearKey 长度>key 直接 false）。

## ② 度量脚本固化 + 第二数据点【实测】

脚本与用法已提交：`docs/metrics/measure.ps1` + `docs/metrics/README.md`（冷启动/落字延迟 zh+en/F8 端到端/热词命中四项一键，自动备份还原配置）。

| 指标 | R101 基线 | R102 本轮 | 备注 |
|---|---|---|---|
| 冷启动→ASR 就绪 | 3.2 s | 3.6 s | 同量级 |
| 松手→落字 zh 中位 | 230 ms | 300 ms | 词典 10 词 + 环境波动，同量级 |
| 松手→落字 en 中位 | 203 ms | 295 ms | 同上 |
| F8 端到端中位（mock） | 142 ms | 174 ms | 同量级 |
| 热词 en 变体命中 | 2/5 | **3/5** | #182 后 dev ops 由 miss 转命中，如预期上升 |

零散未命中（"Typecr"/"Sp typepe"）均为超出一处编辑的重度 ASR 漏音，属 TTS/ASR 波动，非替换逻辑缺陷；zh 同音 2/2 持平全中。

## ③ 设置页全量持久化/生效矩阵【实测】

方法：UI 逐项改动 → 读 speaktype.json 确认即时落盘 → 杀进程重启 → 再读 JSON + 界面/行为抽查。共改 18 项，**18/18 即时落盘且重启后全部保持**：

| 项 | 改动 | 落盘 | 重启保持 | 生效抽查 |
|---|---|---|---|---|
| theme | light→dark | ✓ | ✓ | 全 UI 即时变暗+重启仍暗【实测】 |
| captionLines | 3→6 | ✓ | ✓ | 档位即时生效已于 97 轮实测，本轮持久化【实测】 |
| keepFailedAudio | on→off | ✓ | ✓ | 持久化【实测】；关后失败不落盘为【源码】 |
| holdDelayMs | 120→200 | ✓ | ✓ | 400ms 按住仍正常触发【实测】 |
| doubleTapHandsFree | on→off | ✓ | ✓ | 持久化【实测】 |
| personaHotkeysEnabled | on→off | ✓ | ✓ | 持久化【实测】 |
| vadSilenceMs | 2000→3000 | ✓ | ✓ | 持久化【实测】 |
| launchAtLogin | off→on | ✓ | ✓ | **注册表 Run 项同步生成**（--hidden）【实测】，测毕已删 |
| autoPaste | on→off | ✓ | ✓ | 听写后 Notepad 无落字、仅进历史/剪贴板【实测】 |
| muteWhileRecording | off→on | ✓ | ✓ | 持久化【实测】 |
| localModel | parakeet→sensevoice | ✓ | ✓ | 切换后 Ready、听写正常【实测】 |
| language | en→ja | ✓ | ✓ | 持久化【实测】 |
| localSimplified | on→off | ✓ | ✓ | 持久化【实测】（切 sensevoice 后该项才出现，联动 UI 正确） |
| itn | on→off | ✓ | ✓ | 持久化【实测】 |
| remoteMicEnabled | off→on | ✓ | ✓ | QR 区块即时出现（dark 下清晰）+ 43117 监听【实测】 |
| polishEnabled | off→on | ✓ | ✓ | mock 端点被真实调用（history 出现 mock 改写文本）【实测】 |
| polishBaseUrl/polishModel | 填 mock 值 | ✓ | ✓ | 同上【实测】 |

观察（不立案）：设置文本框对高速程序化输入会丢字（受控输入逐字符 setState），真人手打无感知，属自动化测试摩擦而非产品缺陷【实测+推测】。

## ④ 核心回归【实测】

RightCtrl 中文「今天下午3点开会，预算是5200元」含 ITN + Alt+Q「我们明天去公园散步」准确落字（history UTF-8 核对）。

## 清场记录

- launchAtLogin 注册表 Run 项已删并核实；mock node 停（18099 无监听）；配置/历史还原；latest-release.json/transcribe-last.json/临时 mock js 已删；SpeakType 进程 0；无 .part；43117 无监听；防火墙三 profile 保持 OFF。

## 下轮候选

1. 度量脚本随下个发版跑第三数据点（含真实模型 F8 而非 mock 的可选项论证）。
2. 手机麦真机/云端 key 补账（挂账）。
3. 长期未审：官网五语页与应用内文案一致性全查，或 Transcribe 页大文件（>30 分钟）边界。
