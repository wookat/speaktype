# 豆包网页版（doubao.com/chat）语音输入接口反推记录

调研目的：为 SpeakType（浏览器端 AI 语音输入助手）评估「豆包同款 ASR」作为 provider 的可行性，并确定最终应采用的正式接口。

调研环境：
- 出口：通过 Tailscale 连接节点 `xu-1`（江西南昌，中国联通 AS4837），本地 `ssh -D` 建立 SOCKS5，Chrome 走该代理，保证国内可访问。
- 麦克风：Chrome 以 `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=sample.wav` 启动，注入一段中文 TTS 语音（16 kHz/mono/PCM16），实现可复现的"说话"输入。
- 抓包方式：**不能用 CDP**。doubao.com 带反调试逻辑，一旦有 CDP 会话开启 `Runtime`/`Network` 域，页面会在数秒内变为「该页面暂时不可用」。改为加载一个本地 unpacked 扩展，在 `world: "MAIN"` 的 content script 里 hook `WebSocket`/`fetch`/`XHR`/`getUserMedia`，把帧 base64 后经 service worker POST 到本地日志服务。页面无任何异常。

## 1. 语音输入入口

- 未登录状态：输入框右侧无麦克风按钮。
- 登录后：输入框 placeholder 变为「发消息或按住空格说话...」，右侧出现「语音输入」麦克风按钮，**按住空格**即开始识别（与 AutoGLM 的 hold-to-talk 一致）。

## 2. WebSocket 端点

```
wss://frontier-audio-web-ws.doubao.com/api/v2/sami/voicegenie
  ?api_app_key=<web 端公开 appkey>
  &namespace=VoiceGenie
  &version_code=20800
  &language=zh
  &device_platform=web&pkg_type=release_version&pc_version=3.31.0
  &region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1
  &aid=497858&real_aid=497858
  &device_id=<设备 id>&web_id=<web id>&tea_uuid=<web id>
  &web_platform=browser&web_tab_id=<uuid>
```

- 这是字节 **SAMI VoiceGenie** 网关（SAMI = 语音 AI 中台），底层识别模型为 `bigasr-acllm-*` 系列（即火山引擎「豆包语音识别大模型」）。
- 鉴权：URL 上的 `api_app_key` + 登录态 Cookie（`use-olympus-account=1`）。未登录拿不到入口。
- 监控上报走 `https://mon.zijieapi.com/monitor_browser/collect/batch/?biz_id=speechfe_doubao_sdk`，前端 SDK 名 `speechfe_doubao_sdk`，release `1.3.0`。

## 3. 帧格式：protobuf（不是火山公开的二进制 ASR 协议）

每个 WS 帧是一个 protobuf 消息，字段编号如下（实测）。

客户端 → 服务端：

| field | 含义 |
| --- | --- |
| 2 | `api_app_key` |
| 3 | namespace，固定 `VoiceGenie` |
| 5 | event 名：`StartTask` / `StartSession` / `TaskRequest` / `Ping` |
| 6 | payload JSON 字符串（`StartSession` 时是完整会话配置，其余多为 `{}`） |
| 7 | 音频负载（`TaskRequest` 帧）：**裸 PCM16LE**，每帧 640 字节 = 16 kHz 单声道 20 ms |
| 8 | session/task id（后续 `Ping` 会带上） |

服务端 → 客户端：

| field | 含义 |
| --- | --- |
| 1 | connect id |
| 2 | message id |
| 3 | `VoiceGenie` |
| 4 | event 名：`TaskStarted` / `SessionStarted` / `ASRResponse` / `Pong` |
| 5 | status code，正常为 `20000000` |
| 6 | status message，正常为 `OK` |
| 7 | payload JSON（`ASRResponse` 的识别结果） |
| 9 | 递增序号 |
| 11 | logid |

握手顺序：`StartTask` → `TaskStarted` → `StartSession` → `SessionStarted` → 持续 `TaskRequest`(音频) → 持续 `ASRResponse`，期间每几秒一次 `Ping`/`Pong`。

## 4. ASRResponse 结果结构

```json
{
  "results": [
    {
      "text": "帮我跟老板说那个方案需要再改一下明天上午之前给他答复",
      "alternatives": [
        { "text": "...", "start_time": 0, "end_time": 1.5, "oi_decoding_info": { "oi_former_word_num": 0, "oi_latter_word_num": 0 } }
      ],
      "is_interim": true
    }
  ],
  "extra": {
    "stream_model_version": "BigASR-BigStream-Mediumv1.0.0",
    "stream_source": "bigasr-acllm-release-streaming-grpc-4",
    "nonstream_source": "bigasr-acllm-release-grpc-main",
    "vad_start": true,
    "logid": "..."
  }
}
```

- `is_interim: true` 为中间结果，逐字增长（首帧空串 + `vad_start`，随后 `帮` → `帮我跟` → …）。
- 实测：注入的 TTS 语句被完整、正确识别，含 ITN 与标点处理（配置里 `use_bigasr_itn` / `use_bigasr_punc`）。
- 本次会话共收到 191 个 `ASRResponse`，说明是高频流式增量返回，延迟表现足以支撑「边说边出字」。

## 5. StartSession 配置（关键项，完整体见调研日志）

```json
{
  "business": 1, "enable_audio_input": true, "query_mode": 2, "request_type": 3,
  "chat": { "bot_id": "7234781073513644036", "uid": "<redacted>", "conversation_id": "local_..." },
  "asr": {
    "model": "bigasr-acllm-release-grpc-main",
    "lang": "zh",
    "enable_vad": true, "enable_punctuation": true, "enable_itn": true, "enable_disfluency": true,
    "hot_word_version": 3, "audio_src": 1,
    "audio_info": { "channel": 1, "format": "pcm", "sample_rate": 16000 },
    "extra": {
      "enable_asr_twopass": true,
      "stream_model": "bigasr-acllm-release-streaming-grpc-4",
      "nonstream_model": "bigasr-acllm-release-grpc-main",
      "bigasr_config": { "vad_config": { "model": "v2", "voice_max_seconds": 5 }, "max_vad_accumulate_duration_ms": 15000 },
      "voice_max_seconds": 25, "force_to_speech_ms": 10000,
      "begin_smooth_window_ms": 500, "end_smooth_window_ms": 800, "end_smooth_silence_proportion": 0.9,
      "sa_session_config": { "session_config": { "additional_params": { "req": { "workflow": "audio_in,resample,vad,fe,decode,itn,ddc,punc" } } } },
      "enable_text_post_process": true, "asr_text_post_process_type": "last_post_process",
      "enable_trim_punctuation": true, "enable_context_hotword": true
    }
  }
}
```

值得复刻到 SpeakType 的工程参数：
- 音频：16 kHz / mono / PCM16 裸流，**20 ms 一帧（640 B）**，不做压缩。
- VAD：起始平滑窗 500 ms、结束平滑窗 800 ms、静音占比阈值 0.9；单段语音上限 25 s、VAD 累积上限 15 s。
- 双通道识别：流式模型出中间结果 + 非流式模型做最终修正（`enable_asr_twopass`），最终文本再走一次文本后处理（顺滑/标点/ITN/热词）。这与 AutoGLM 的 `partial` → `final` + polish 两段式思路一致。

## 6. 结论与选型

不采用该私有接口，理由：
1. 入口依赖 doubao.com 登录 Cookie 与其 web `api_app_key`，第三方产品复用属于滥用其网页服务，违反其服务条款。
2. protobuf 字段编号、`bot_id`、模型名等随发版变动，无任何兼容承诺。
3. 站点存在反调试与风控，工程上不可靠。

采用的方案（provider 可插拔，接口层与上面实测的流式语义保持一致）：
- **首选**：火山引擎「豆包语音识别大模型」流式接口（bigasr，与网页版同一识别引擎，官方文档 + AppID/AccessToken 计费），拿到即可获得与网页版同等质量。
- 备选：智谱 `glm-asr-2512`（`POST /paas/v4/audio/transcriptions`，单段 ≤30 s、≤25 MB），与 AutoGLM 同源。
- 降级：浏览器 Web Speech API，无 key 也能跑。

需要老板提供的资源（一次性）：火山引擎语音技术的 AppID + Access Token（或智谱 API key）。缺口期间用 Web Speech 降级，不阻塞开发。

## 7. 可复用的调研工具（本次沉淀）

- `xu-1` 中转代理：Tailscale userspace 模式 + 本地 SOCKS 中继 + `ssh -D` 动态转发，得到国内出口的 `socks5://127.0.0.1:1080`。
- 假麦克风：Chrome `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<16k wav>`，把 TTS 语音当真人说话，语音链路可自动化回归测试（SpeakType 自身的 E2E 测试也用它）。
- 反反调试抓包：unpacked 扩展 + `world: "MAIN"` hook `WebSocket`，替代 CDP/DevTools。
