# SpeakType 第 56 轮严格审查报告 —— 终端降格式回归 + 远程麦断线重连 + 历史页 500 条大数据 + 核心回归

- 审查对象：最新 main@e8643df（含 #114/#115/#116）pack:dir 打包实测
- 审查方式：【实测】= 真机验证；【源码】= 代码走查；【未验证】= 如实标注
- 环境：Windows Server 2022；配置/历史测毕已从备份还原

## 结论总览

| 级别 | 数量 | 内容 |
|------|------|------|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 0 | — |
| P3 | 1 | 配对页 token 失效后永远「正在重连」，不提示重新扫码（§2.2） |

## 1. 终端降格式回归（#114/#115）——全过【实测】

| 用例 | 结果 |
|------|------|
| cmd 口述 "echo hello world and goodbye" | 落 `echo hello world and goodbye`——句首小写、无尾句号 |
| PowerShell + 词典驼峰专名（词典加 SpeakType 后口述 "speak type status…"） | 落 `SpeakType status should be running now`——热词纠错成驼峰、#115 守卫生效句首 S 保留、无尾句号 |
| Notepad 对照组同句式 | 落 `This is a normal sentence for the control group.`——大写+句号完整保留，降格式未误伤普通目标 |

历史页存的是降格式后的文本，与实际落字一致，合理。

## 2. 远程麦断线重连【实测】

### 2.1 录音中硬断线——正确自愈（全过）
- LAN 直连模式，协议级模拟手机推 PCM 至一半时直接 destroy socket（无 close 帧、无 stop/cancel 消息）——桌面端正确取消本次录音：历史无半截条目、状态机无卡死；紧接着新连接立即被接受、完整链路成功落字入历史。对应源码 `remotemic.ts` ws close → `activeWs===ws` 时 `d.cancel()`【源码+实测双证】。
- 手机页断开表现正确：桌面关闭远程麦后页面显示「Disconnected, reconnecting…」+ 按钮禁用（#110 英文文案实拍，i18n 已生效）。

### 2.2 P3-①：token 轮换后旧配对页永远「正在重连」
- 复现：手机页已连接 → 桌面把开关关掉再打开（token 每次 start 都重新生成，实查旧 token 请求返回 403）→ 旧页面每 1.5 秒重试 `ws?t=旧token` 被拒，**持续显示「Disconnected, reconnecting…」无限循环，永远不会成功也不提示原因**（等待 15 秒+实拍确认）。
- 真实场景：用户在电脑上开关一次远程麦（或改模式），手里手机页面就永久卡在重连中，用户不知道需要重新扫码。
- 修法论证（~10 行，page() 内联 JS）：连续 N 次（如 5 次）open 前即被断开（onclose 且从未 onopen）→ 停止重试，改显示「连接已失效，请回到电脑上重新扫码」。浏览器 WS API 拿不到 403 状态码，但「反复瞬断且从未成功」即可判定 token 失效；也可服务端 403 前先完成 upgrade 再发一条 `{type:"expired"}` 后关闭，页面可精确区分。同步覆盖官方中转页。

## 3. 历史页 500 条大数据与搜索——全过【实测】

- 注入 500 条（上限即 `addHistory` slice(0,500)【源码】；中英混合、含关键词/金额）→ 打开历史页**即时渲染无卡顿**；分页每 50 条 +「Show more (450 remaining)」逐级加载，点击响应即时。
- 搜索：中文「猕猴桃」即时过滤只剩中文条目；`$49900`（第 500 条、最老）跨全量命中——搜索范围是全部 500 条而非仅已渲染部分；`number 499 raw` 命中仅存在于 raw 转写的关键词——text+raw 双字段检索正确【源码 History.tsx filter 与实测吻合】。
- 上限滚动淘汰实证：满 500 条后新落一句，总数仍 500、最老条目被移除。

## 4. 核心链路回归——全过【实测】

- RightCtrl 英文（parakeet）：`The core dictation path still works in round 56.` 含 ITN。
- RightCtrl 中文（sensevoice + 中文）：`今天下午3点开会，预算是5200元` 含 ITN；模型热切换（parakeet↔sensevoice）无重启即时生效。
- Alt+Q 免按：`Round 56 regression is complete now.` 正常进出。
- 观察（不立案）：模型为 sensevoice+中文时口述英文，识别质量明显下降（"complete"→"Comp."）——模型能力边界符合预期，设置页文案已说明 parakeet 才是英文首选。

## 5. 下一轮候选（按优先级）

1. P3-①（配对页 token 失效提示）落地回归。
2. 云端成功路径补测（继续等 key——唯一长期未覆盖面）。
3. 真手机实测手机麦通道（触摸/息屏仍【未验证】）。
4. 终端降格式在 Windows Terminal/wt.exe 真实环境抽查（本机无 wt，本轮 cmd/PowerShell 经典控制台已验，wt 进程名已在 TERMINAL_APPS 集合【源码】）。

## 6. 清场记录

- speaktype.json / history.json 已从备份还原（model=parakeet、remoteMic=False、历史 321 条原样）
- 注入的 500 条测试历史、词典测试词 SpeakType 均随还原清除
- SpeakType / Notepad / 测试终端全清，进程 0；无 .part；43117 端口已关
- 防火墙三 profile 保持 OFF（未执行任何开启命令）
- 未修改任何产品代码
