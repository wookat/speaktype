# 第 141 轮体验官审查：各录音入口的 muteWhileRecording 静音语义（main @ be22f6e）

背景：#223 改变了 muteWhileRecording 的解除时机（免按会话内跨句保持）。本轮覆盖此前从未做过静音取证的其余入口：手机麦（LAN）、历史 Retry、文件 Transcribe、F8 改写，并对 #223/#221/RightCtrl 做回归。全部用真实打包应用（win-unpacked，pack:dir @ 05:16）+ 修正后 CoreAudio 探针（11-filler，测前 SetMute 往返自验通过）+ 后台采样循环（~2s 粒度）实测。

## 结论总览：全部通过，无新立案

| 用例 | 结果 |
| --- | --- |
| A1 手机麦（LAN）按住说话：按住期间 mute=True flag=True → 松开落字后 False/False 恰好一次 | PASS |
| A1b 预先手动静音 + 手机麦：全程 15 采样 True、flag 从未创建、松开后仍 True 不反转 | PASS |
| A2 历史 Retry（负向）：Retry 成功条目原地升级，全程 13 采样 mute=False flag=False | PASS |
| A3 文件 Transcribe（负向）：转录完成出中文分段，全程 23 采样 mute=False flag=False | PASS |
| A4 F8 改写：按住期间 True/flag=True → 完成后 False；选区替换为改写文本 | PASS |
| B1 回归 #223：免按 4 段会话内 20 采样全 True 无闪烁，退出解除一次 | PASS |
| B2 回归 RightCtrl：中文整句正常落字 Notepad | PASS |
| B3 回归 #221：「明天␣」尾随空格命中多条（含 raw 字段命中） | PASS |
| C 视觉抽查：配对页「已连接电脑/录音中」状态、Retry 条目升级、Transcribe 分段/时间戳 | PASS |

## 测法与证据要点

- 手机麦 LAN 模拟：Settings 开 Phone mic（LAN direct）→ 43117 自签 HTTPS 配对页用 Edge 打开（`--no-proxy-server --ignore-certificate-errors --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<wav>`），鼠标按住「Hold to talk」推流，走 `dictation.start("hold", remote=true)` 同一静音状态机。
- 手机麦探针序列：05:22:46-56 True/True（按住）→ 05:22:58 起持续 False/False（松开后恰好一次解除）；转写「帮我跟老板说…答复」落历史。
- Retry 构造：openai + 死端口 18099 → 失败条目 → UI 切回 Built-in SenseVoice → Retry 成功原地升级；Retry 窗口探针全 False（retryHistory L504-527 不含 mute 调用的运行时负向证据）。
- Transcribe：r139_padded.wav 转出 1 段中文带时间戳；窗口探针 23 采样全 False。
- F8 改写：polish 指向本机 mock（8098，返回 MOCK_REWRITE_OK）；选中一行按住 F8 口述 → 选区被替换；探针 05:30:10-16 True/True → 05:30:18 起 False。
- B1：免按会话 05:31:21-58 全 True 无闪烁；05:32:00 一个 `mute=True flag=False` 为退出解除的过渡采样（flag 先删、SetMute 后至），非缺陷。

## 测试者备注（非产品缺陷）

- 全局开 AI polish 指向 mock 后，B1 免按段落被润色为「MOCK_REWRITE_OK 已按指令改写」——测试环境效应，静音断言不受影响；B2 前已关 AI polish 并实测真实中文落字。
- Edge 首开走系统代理导致 ERR_PROXY_CONNECTION_FAILED，需 `--no-proxy-server`。

## 清场核验

配置/历史/stats 还原（hist=43、stats 122/7089/1018238、mwr=False、polish 空、remoteMic=False）；flag 删；系统 mute=False；failed-audio=0；transcribe-last.json 删；进程 0（SpeakType/notepad/node/msedge）；43117/43998/18099/8098 无 LISTENING；防火墙三 profile OFF；VB-CABLE 保留。
