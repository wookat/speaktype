# 免责声明 / Disclaimer

## 中文

SpeakType 是一个独立的开源项目，与 OpenAI、字节跳动（豆包 / 火山引擎）、智谱或任何其他第三方服务提供商**没有任何关联、合作或授权关系**。项目中出现的第三方名称与商标仅用于说明兼容性。

### 关于「豆包」「ChatGPT 网页转写」这两个通道

这两个通道**复用用户自己在本机已有的登录态**去调用对应服务网页端自带的语音接口。请在使用前知悉：

- 它们调用的是**非公开、非官方文档化的内部接口**，随时可能变更或失效，我们不做任何可用性承诺；
- 这种访问方式**可能不符合对应服务的用户协议**，是否使用请自行判断；
- 由此产生的账号被限流、被封禁等后果，**由使用者自行承担**；
- 本项目**不收集、不传输、不代管任何账号凭证**。所有登录态只存在于用户本机，凭证不写入配置文件、不写入日志、不发送到任何第三方服务器；
- 项目维护者**不提供、不出售、不共享任何第三方服务账号**。

如果你对上述风险有顾虑，请使用以下不涉及第三方账号的通道：

- **内置离线识别**（whisper.cpp，完全本机运行，无需注册，无网络请求）；
- **任意 OpenAI 兼容的转写服务**（自带 API Key，走服务商的公开 API）。

### 权利人须知

如果你是相关服务的权利人，认为本项目的某项功能存在问题，请通过 GitHub Issue 联系我们，我们会认真对待并及时处理。

### 一般条款

本软件按「现状」提供，不附带任何明示或默示的担保。详见 [LICENSE](LICENSE)（MIT）。

---

## English

SpeakType is an independent open-source project. It is **not affiliated with, endorsed by, or authorized by** OpenAI, ByteDance (Doubao / Volcengine), Zhipu AI, or any other third-party service provider. Third-party names and trademarks are used solely to describe compatibility.

### About the "Doubao" and "ChatGPT web transcription" providers

These providers **reuse the user's own existing local login session** to call the speech endpoints built into those services' web clients. Before using them, please understand:

- They call **undocumented, non-public internal endpoints** that may change or break at any time. No availability guarantee is made;
- This form of access **may not comply with the respective service's terms of use**. Deciding whether to use it is entirely up to you;
- Any consequences, including rate limiting or account suspension, are **borne solely by the user**;
- This project **never collects, transmits, or holds any account credentials**. Session state stays on the user's machine; credentials are never written to config files or logs, and never sent to any third-party server;
- The maintainers **do not provide, sell, or share any third-party service accounts**.

If you are uncomfortable with these risks, use one of the providers that involves no third-party account:

- **Built-in offline recognition** (whisper.cpp, fully local, no signup, no network requests);
- **Any OpenAI-compatible transcription service** using your own API key via the provider's public API.

### Notice to rights holders

If you are a rights holder and believe a feature of this project is problematic, please open a GitHub Issue. We take such reports seriously and will respond promptly.

### General

This software is provided "as is", without warranty of any kind. See [LICENSE](LICENSE) (MIT).
