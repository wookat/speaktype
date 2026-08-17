# 可用性度量一键脚本

第 101 轮体验官审查确立的四项可用性基线指标，固化为 `measure.ps1`，建议每次发版跑一轮与历史数据对照。

## 指标

| 指标 | 测法 |
|---|---|
| 冷启动 → ASR 就绪 | 启动进程 → 日志出现 `sherpa worker started`（模型已下载态） |
| 松手 → 落字延迟 zh/en | RightCtrl 松开 → 剪贴板出现结果文本，25ms 轮询，各 5 次取中位数 |
| F8 改写端到端 | F8 松开 → 剪贴板出现 mock 改写结果（mock 即答端点，≈管线开销） |
| 热词命中率（en 变体） | 词典预置 6 词，TTS 口述 5 句变体（"speak type"/"git hub"…），命中计数 |

## 前置条件

- Windows，已打包的 SpeakType.exe（`npm run pack:dir` 产物），模型已下载。
- `node` 在 PATH（F8 阶段起 mock 润色端点）。
- 系统有英文 TTS 语音（System.Speech）；zh 延迟项需自备中文短句音频文件。
- 打开着一个 `Untitled - Notepad` 窗口作为落字目标（脚本会自动启动）。
- 脚本会临时改写 `%APPDATA%\SpeakType\speaktype.json`（润色端点/热词），运行前自动备份、结束自动还原。

## 用法

```powershell
# 必须 -STA（剪贴板轮询需要）
powershell -STA -File docs/metrics/measure.ps1 `
  -AppExe "desktop\release\win-unpacked\SpeakType.exe" `
  -ZhAudio "C:\path\to\zh-sentence.mp3"    # 可选，缺省只测 en
```

## 注意

- 虚拟声卡/TTS 环境下延迟绝对值只作**同机相对对比**（轮次间趋势），不代表真实硬件体验。
- 热词命中率受 TTS 发音与 ASR 波动影响（同句不同轮可能漏音节），建议关注趋势而非单次绝对值。
- 历史数据点见 `docs/reviews/round101.md`（基线）与 `docs/reviews/round102.md` 起的对照表。
- **zh 样本必须跨轮固定同一文件**：zh 延迟中位数对样本长度/尾部静音极其敏感（第 157 轮实测同机 231ms vs 570ms 差异全部来自样本不同）。第 157 轮起 zh 基线以含 15.7s 尾音的 padded 样本三跑 570/580/625ms 为准（0.15.0 同日对照 717ms），与 101/102 轮的 ~230ms（短样本）不可直接比较。
