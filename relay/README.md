# SpeakType 公网中转（自部署）

手机与电脑不在同一 Wi-Fi 时，用这个 Cloudflare Worker 做音频中转：手机页面由 Worker 托管，音频经房间直通到你的电脑，**不落盘、不解析、不存储**。部署在你自己的 Cloudflare 账号里，SpeakType 官方不经手任何数据。

## 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/wookat/speaktype/tree/main/relay)

或本地部署：

```bash
cd relay
npx wrangler deploy
```

部署完成后得到形如 `https://speaktype-relay.<你的子域>.workers.dev` 的地址。自部署前请先删掉 `wrangler.toml` 里的 `routes` 段（那是官方域名的绑定）。

不想自部署可直接用官方中转：`https://speaktype.zalize.com/relay`（国内可直连）。

## 使用

1. 桌面端 SpeakType：设置 → 麦克风与音频 → 手机当麦克风 → 连接方式选「公网中转」，填入上面的地址；
2. 用手机扫设置页出现的二维码（任何网络都可以）；
3. 按住圆钮说话、松手，文字落到电脑光标处。

## 安全说明

- 每次开启生成随机 12 位十六进制房间号，二维码链接仅本次有效；
- 单房间同一时刻只允许一台电脑 + 一台手机；
- Worker 只做 WebSocket 转发（Durable Object 内存中直通），无任何持久化。
