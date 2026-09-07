# 第 167 轮体验官审查报告

- 日期：2026-08-17
- 基线：main@047f2a1（含 #258/#259）
- 打包：`npm run pack:dir` 成功（round167\pack.log），产物 0.15.1
- 证据分级：【实测】打包运行时直接证据；【源码】源码检视；【推测】推断；【未验证】未执行

## 结论：P0=0，P1=0，P2=0，P3=0——零立案，观察 ×1

## ① #258 回归【实测】全过

- 混合保存「スピークタイプ / 电话 / Devin」→ 灰色提示「1 word(s) contain Japanese kana — saved, but auto-correction currently only supports Chinese and ASCII words.」——仅计含假名条目且照常入库（3/300 实拍）。
- 随后单独保存纯中文「公司」→ 提示消失（kanaAdded 仅计本次新加入，不误报、不残留）。

## ② 专项 a：词典页交互边界【实测】全过

选择理由：#258 触碰词典保存路径，顺势专审从未覆盖的词典页边界。

- 300 上限：粘贴 305 词 + 超长词 + 空白行 + 重复词批量保存 → 琥珀提示「limited to 300 hotwords — 9 word(s) were not added」，数目精确（309 唯一新词 − 300）；计数器 300/300。
- 超长条目（34 字符）与纯空白行被静默过滤【实测+源码 addFromText filter】。观察①（不立案）：超长行被丢弃不计入「not added」提示——placeholder 已说明 20 字符规则，属文案已覆盖的静默边界；若要更精确可把长度过滤条目并入 dropped 计数（~2 行）。
- 重复条目去重正确（Set 语义）；搜索过滤精确命中；单 chip 删除即时生效（300→299 + 空态「No matching hotwords」）。
- 299 热词满载下 RightCtrl 中文听写（language=zh）识别正确、无可感知延迟。

## ③ 专项 b：失败录音保留上限口径【实测】全过

选择理由：「最多 20 段 / 7 天 / 50MB」三上限（dictation.ts pruneFailedAudio）从未运行时验证。

- 手法：failed-audio 预置可控样本 + 不可达 OpenAI 兼容端点（http://127.0.0.1:9/v1）制造真实识别失败触发落盘+prune。
- 条数+时效：预置 20 个近期 dummy + 1 个 8 天前 aged → 真实失败后恰余 20 个：aged 被时效规则删、最旧 dummy 被条数规则删（余最旧为 dummy19）。
- 大小：预置 3×20MB 近期文件 → 真实失败后余「真实失败 wav(0.1MB)+big1+big2」≈40.1MB，big3（将超 50MB）被删——按新→旧累计、超限从旧删的口径与源码一致。
- keepFailedAudio=true 前提确认；失败历史条目与 Retry 入口在位（130/131 轮已专审，本轮不重复）。

## ④ 核心回归【实测】全过

- RightCtrl 中文（language=zh，sensevoice，299 热词满载态）：「我们明天去公园散步」全对落字。
- Alt+Q 英文（language=en，切回本地 provider 后）：「The review and the report are done today.」全对落字——顺带证明失败链路测试后 provider 切换即时恢复。

## 环境限制

- 真手机麦端到端、auto×粤语、云端真实 key、多显示器沿旧挂账【未验证】。

## 清场

- SpeakType/Notepad 进程停、43117/18099 无监听、无 .part。
- failed-audio 清空；词典/provider/语言随 config 还原（round167-*.bak，history 321 条）。
- 防火墙三 OFF；repo 回 main，git status 干净。
