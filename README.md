# SpeakType — 开源 AI 语音输入

开源（MIT）的 AI 语音输入，两种形态：**Windows 桌面版**（[`desktop/`](desktop/)，全局热键、任意程序落字、NSIS 安装包）与 **Chrome 浏览器扩展**。SpeakType 自身不提供任何云端服务：识别与润色都直连你自己配置的服务，配置与密钥只存本机。

以下为浏览器扩展部分。你说，我写。在任意网页的输入框里**按住 `Ctrl` 说话、松手落字**（也可按 `Alt+Q` 或点悬浮条按钮开/关），自动转写 + 按场景改写，直接落到光标处。

灵感来自智谱 AutoGLM 输入法的桌面端体验，但做成浏览器扩展，不需要装客户端、不用模拟 `Ctrl+V`。

## 现状

- Chrome MV3 扩展（WXT + React 19 + Tailwind 4），跟随焦点出现的 Shadow DOM 悬浮胶囊，不污染宿主页面样式。
- 麦克风采集在 offscreen 文档里完成：一次授权，全站可用，`16kHz / mono / PCM16`、200ms 一包。offscreen 弹不出权限气泡，所以授权走扩展内的 `permission.html` 页面，设置页与悬浮条上的错误提示都能一键跳过去。
- 设置页只有三项常用旋钮（按住的键 / 改写风格 / 语言）+ 顶部就绪状态卡（麦克风、豆包语音各带一键修复），引擎与各家凭证收进「高级设置」。
- 识别引擎可插拔：
  - `doubao`（默认）：复用豆包网页版同款流式识别（SAMI VoiceGenie），走用户自己已登录的 doubao.com 会话，不需要任何 API key。非官方接口，豆包改版可能失效，可一键切换到下面的官方引擎。
  - `webspeech`：浏览器内置，零配置兜底。
  - `volc`：火山引擎「豆包语音识别大模型」双向流式（与 doubao.com 网页版同一 bigasr 引擎），开启二遍识别，边说边上屏、结束再修正。
  - `zhipu`：智谱 `glm-asr-2512` 一次性转写（≤30s 短句）。
- 润色模型与识别引擎解耦：设置里填任意 OpenAI 兼容端点（DeepSeek / Kimi / 千问 / OpenAI / 本地 Ollama…）即可，留空则回退智谱 key 或中转，都没有就只做本地口语清理，识别照常可用。
- 按住说话：键位可在设置里录制，支持纯修饰键长按（`Ctrl`、`Ctrl+Alt`）与组合键（`F2`、`Ctrl+Space`）。纯修饰键要按住 250ms 才起录，按住期间敲了别的键就当普通快捷键放过并丢弃这次录音，因此不会和 `Ctrl+C` 之类抢键。
- 改写风格（persona）：默认 / 汇报老板 / 同事沟通 / 亲密对话 / 中英互译 / 写代码 / 写提示词，可在悬浮条一键切换。
- 落字兼容 `input`、`textarea`、`contenteditable`（富文本走 `insertText`，React 受控组件会收到 `input` 事件）。

## 目录

```
entrypoints/        扩展入口：background / content（悬浮 UI）/ offscreen（录音）/ popup（设置）/ permission（麦克风授权）/ doubao-bridge（豆包页内 WS 桥接）
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

## 豆包引擎怎么工作

VoiceGenie 的入口靠 doubao.com 的登录态 Cookie，跳站握手带不上，所以 WebSocket 必须开在 doubao.com 页面内：

```
offscreen(麦克风+帧组装) ──> background(维护后台 doubao 标签页) ──> doubao-bridge(页内 WebSocket)
                       <── ASRResponse 逐字回传 ──
```

桥接只按指令开连接、双向转发字节，不读也不外发 Cookie/token。入口需要的 `api_app_key` 不内置在仓库里，按三级顺序解析：① 设置里的手填值；② 扩展缓存 —— MAIN world 钩子（`entrypoints/doubao-hook.content.ts`）代理页面的 `WebSocket` 构造，豆包自己发起 `voicegenie` 连接时从 URL 参数截下 key 并缓存（所以在豆包页面用一次它自带的语音输入即可，脚本是懒加载的，静态扫描扫不到）；③ 兜底扫页面脚本。三级都空时提示用户手填。帧格式（protobuf 字段编号、事件名、StartSession 配置）见 `lib/asr/doubao/protocol.ts` 与 `docs/reverse-engineering-doubao-voice.md`。

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

`doubao` 引擎用的是未公开接口，依赖使用者自己的登录会话，不携带也不分发任何第三方凭证；它随豆包发版可能失效，对稳定性有要求的场景请用 `volc`（同一 bigasr 引擎的官方接口）。

## 开源与贡献

- 许可：[MIT](LICENSE)。
- 作者与维护：wookat & SpeakType contributors。
- 欢迎提 [Issue](https://github.com/wookat/speaktype/issues) 与 Pull Request。
- 隐私：不上传语音/文本到 SpeakType 的服务器（没有这样的服务器）；所有凭证只保存在本机，仓库里不内置任何第三方密钥。
