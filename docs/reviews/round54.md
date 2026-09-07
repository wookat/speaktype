# SpeakType 第 54 轮严格审查报告 —— 手机麦克风通道首次全链路实测 + 周期性回归

- 审查对象：最新 main@43d712f（含 #109）pack:dir 打包实测
- 审查方式：【实测】= 真机验证；【源码】= 代码走查；【未验证】= 如实标注
- 手机端模拟：本机 Chrome 打开配对页（视觉/权限路径）+ Node ws 客户端按协议实时推 16kHz PCM（音频路径）；真手机/真麦克风不可得，如实标注

## 结论总览

| 级别 | 数量 | 内容 |
|------|------|------|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 0 | — |
| P3 | 2 | ① 手机配对页硬编码中文，不跟随应用五语言设置；② 中转不可达时零可见反馈（UI 仍摆二维码"等手机连接"，仅日志每 2 秒重试） |

## 1. 手机麦克风通道全链路——两种模式音频链路全绿

### 1.1 局域网直连模式【实测】
- 开启开关 → 二维码 + `https://172.16.17.2:43117/?t=<token>` 即时展示，说明文案清晰（同 Wi-Fi、首次信任自签证书）。
- 配对页浏览器打开正常：深色手机页、「按住说话」大按钮、状态行「已连接电脑」。
- **音频→落字全链路**：模拟手机端 ws 推 16k PCM（真实语音 wav）→ 手机端实时收到 partial 字幕回传（逐句增长）→ 状态流转 recording→transcribing→polishing→idle → **文字准确落到电脑 Notepad 光标处** + 历史入库。
- 负路径全部可读：错 token HTTP → 403「SpeakType: invalid link, rescan the QR code」；错 token WS → 连接直接拒绝；手机麦克风权限拒绝 → 页面显示「麦克风权限被拒绝」。
- 关闭开关 → 43117 端口实测立即关闭（Test-NetConnection False），服务真停。

### 1.2 公网中转模式【实测】
- 切到 Internet relay：官方 `https://speaktype.zalize.com/relay` 预填，二维码 + 配对码 + 手机页 URL 展示；Worker 托管的手机页 HTTP 200。
- **中转全链路同样全绿**：模拟手机连 Worker 房间（role=phone）→ peer 通知 → 推 PCM → partial 回传 → 文字落 Notepad + 历史入库——官方中转真实可用。
- **P3-②：中转不可达零可见反馈**——把 relay URL 换成不存在域名：UI 照常显示二维码 + 配对码 +「Waiting for a phone to connect…」，与正常态无任何区别；实际桌面端每 2 秒 `getaddrinfo ENOTFOUND` 重试（仅日志可见）。用户扫码只会得到打不开的页面，永远等不到连接也不知道为何。「降级必须可见」守则第六次同族命中。修法论证：connectRelay 连续 N 次失败（如 5 次/10 秒）后把 info 加 error 字段推给设置页，显示「无法连接中转服务器，请检查地址/网络」（~15 行）；自动重连保留。

### 1.3 P3-①：手机配对页硬编码中文
- remotemic.ts `page()` 内 `lang="zh"`、「按住说话/已连接电脑/松手结束/麦克风权限被拒绝」等全部中文写死；应用本体是五语言（第 53 轮实测切换即时生效），英文/日文用户扫码见到整页中文。中转模式手机页由 Worker 托管，同样问题需同步修。修法：页面文案抽成 zh/en 两份、按桌面端 uiLanguage 注入（~20 行）；至少补英文兜底。

## 2. 周期性回归——全过

- 五页面深色模式走查：Home/History/Personas/Dictionary/Settings 全部深色渲染正常、无破版、无白块（实拍）。
- RightCtrl 英文：「Please schedule the meeting for 330 tomorrow.」逐字落字。观察（不立案，上游 ITN）："three thirty" 被转成 `330` 而非 `3:30`，与第 47 轮货币空格同族的 sherpa ITN 精度问题，出现频率低。
- RightCtrl 中文（sensevoice-small + 中文）：「今天下午3点开会，预算是5200元」逐字准确含 ITN（3点/5200元）。
- Alt+Q 免按：「Hands free mode still works in round 54.」正常落字含 ITN。

## 3. 自由挑刺：模型热切换——全过

- 【实测】parakeet→sensevoice-small 下拉切换：无需重启即时生效（Status 保持 Ready、Model ready），随即中文口述成功；语言下拉五选项（中/英/日/韩/粤）联动出现「Force Simplified Chinese」开关，层级合理。
- 【实测】英文语音打到 parakeet（不支持中文）时中文语料产出空结果不落字不入历史——设置页文案已明确说明 parakeet 无中文，且切换引导清楚，不立案。

## 4. 下一轮候选（按优先级）

1. 两个 P3（配对页多语言 + 中转失败可见提示）一个 PR 落地回归。
2. 云端成功路径补测（继续等 key）。
3. 真手机实测手机麦通道（真 iOS/Android 浏览器 + 真麦克风；本轮为协议级模拟，触摸交互/息屏行为【未验证】）。

## 5. 清场记录

- speaktype.json / history.json 已从备份还原（model=parakeet、lang=en、theme=light、remoteMic=False、relay URL 官方默认）
- 43117 端口关闭实查；SpeakType / Notepad 进程 0；无 .part
- 防火墙三 profile 保持 OFF（未执行任何开启命令）
- 未修改任何产品代码
