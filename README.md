# SpeakType — 网页内 AI 语音输入助手

你说，我写。在任意网页的输入框里按 `Alt+Space`（或长按悬浮条按钮）说话，自动转写 + 按场景改写，直接落到光标处。

灵感来自智谱 AutoGLM 输入法的桌面端体验，但做成浏览器扩展，不需要装客户端、不用模拟 `Ctrl+V`。

## 现状

- Chrome MV3 扩展（WXT + React 19 + Tailwind 4），跟随焦点出现的 Shadow DOM 悬浮胶囊，不污染宿主页面样式。
- 麦克风采集在 offscreen 文档里完成：一次授权，全站可用，`16kHz / mono / PCM16`、200ms 一包。
- 识别引擎可插拔：
  - `webspeech`：浏览器内置，零配置，用于没有 key 时先跑起来。
  - `volc`：火山引擎「豆包语音识别大模型」双向流式（与 doubao.com 网页版同一 bigasr 引擎），开启二遍识别，边说边上屏、结束再修正。
  - `zhipu`：智谱 `glm-asr-2512` 一次性转写（≤30s 短句）。
- 改写风格（persona）：默认 / 汇报老板 / 同事沟通 / 亲密对话 / 中英互译 / 写代码 / 写提示词，可在悬浮条一键切换。
- 落字兼容 `input`、`textarea`、`contenteditable`（富文本走 `insertText`，React 受控组件会收到 `input` 事件）。

## 目录

```
entrypoints/        扩展入口：background / content（悬浮 UI）/ offscreen（录音）/ popup（设置）
lib/                provider 层、录音与 PCM/WAV、润色、插入、设置
public/             AudioWorklet
worker/             Cloudflare Worker 中转（隐藏凭证 + 补火山鉴权头）
docs/               AutoGLM 与豆包网页版的接口反推记录
```

## 开发

```bash
npm install
npm run dev        # 起开发版，自动打开带扩展的 Chrome
npm run build      # 产出 .output/chrome-mv3
npm run compile    # 类型检查
```

手动加载：`chrome://extensions` → 打开开发者模式 → 「加载已解压的扩展程序」→ 选 `.output/chrome-mv3`。

## 中转（可选，但火山引擎必须）

浏览器 `WebSocket` 不能自定义请求头，而火山流式识别把鉴权放在 `X-Api-*` 头上，所以火山引擎必须经中转；中转同时避免把服务端 key 下发到浏览器。

```bash
cd worker
npm install
npx wrangler secret put VOLC_APP_KEY
npx wrangler secret put VOLC_ACCESS_KEY
npx wrangler secret put ZHIPU_API_KEY   # 转写与润色共用
npm run deploy
```

部署后把 Worker 地址填进扩展设置的「中转地址」。用户也可以在设置里填自己的凭证，此时中转只做透传。

## 自动化语音测试

不需要真人说话：用 Chrome 的假麦克风灌入一段 wav 即可跑通整条链路。

```bash
chrome --use-fake-ui-for-media-stream \
       --use-fake-device-for-media-stream \
       --use-file-for-fake-audio-capture=sample.wav   # 16kHz mono wav
```

## 说明

`docs/` 下的反推记录用于确认「同款体验」的工程参数（分包大小、VAD 判停、二遍识别、人格改写）。产品本身只调用官方公开接口，不复用任何私有网关或其网页端凭证。
