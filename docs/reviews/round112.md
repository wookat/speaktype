# 第 112 轮体验官审查报告 — About/更新流程与应用内链接全量专项 + #192 回归

- 基线：main @ `0377bef`（含 #192/#193），`npm run pack:dir` 退出码 0，打包版实测
- 口径：【实测】/【源码】/【未验证】/【推测】

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

零立案，观察 ×1（测试摩擦级，见 ⑤）。

## ① #192 回归【实测】过

文件驱动 mock（SKILL #193 方法）：mock 返回 `Here is the polished text: LLM整理后的正文` → 落字与历史均为「LLM整理后的正文」（前缀剥净）；mock 返回无前缀正文 → 原样落字无误剥。stripLlmWrapper 两分支实证【源码 polish.ts:245-252】。

## ② About 页信息核对【实测】过

版本行 `SpeakType 0.15.0 (0377bef)` 与本次构建 commit 一致；开源协议 MIT、作者 wookat & contributors、日志打开按钮、贡献/隐私区块齐全；Releases 按钮直达 github releases 页（线上 v0.15.0 Latest 实拍）。

## ③ #172 升级横幅缓存复验【实测】过

- **缓存命中路径**：注入 `latest-release.json{tag:v0.99.0, at:now}` + hosts 封锁 api.github.com → 首启 About 即显「New version v0.99.0 is available」横幅（断网下走 24h 缓存），链接指向 releases/latest。
- **失败路径**：删缓存 + 保持封锁 → 无横幅、无报错弹窗、log 无 uncaughtException，静默排队重试（30min×≤3【源码 index.ts:337-358】，等待窗口过长未实测重试触发，标【未验证】）。
- **成功路径**：还原 hosts + 刷 DNS 重启 → log `latest release prefetched: v0.15.0`、缓存文件落盘 `{tag:v0.15.0}`、同版本不出横幅。hosts 已还原核实（0 残留）。

## ④ 应用内外链逐一点击【实测】过

About 页 4 链接实点：Releases → `/releases`（v0.15.0 Latest）、仓库 → `github.com/wookat/speaktype`、Issues → `/issues`、MIT License → `/blob/main/LICENSE`（GitHub MIT 许可页实拍）——目标全部正确、全部可达（openExternal 走系统默认浏览器）。侧栏 GitHub·MIT 链接同 REPO_URL【源码】；手机配对失效页链接 #181 已验不重复。

## ⑤ 托盘/窗口标题/任务栏一致性【实测】过

托盘菜单三项「Open SpeakType / Set up speech recognition / Quit」与 uiLanguage=en 一致；「Set up speech recognition」直落 Settings → Speech 页签（#174 回归过）；任务栏图标/窗口标题/侧栏版本号 v0.15.0 一致。观察①（测试摩擦，不立案）：测试中反复 `Stop-Process -Force` 强杀会在通知区累积幽灵托盘图标（悬停即消），属 Windows shell 对非正常退出的通用行为，正常 Quit 不残留。

## ⑥ 核心回归【实测】过

RightCtrl 中文「今天下午3点开会，预算是5200元」含 ITN + Alt+Q「我们明天去公园散步」准确落 Notepad（sensevoice-small）。附带实证：parakeet 模型对中文音频输出英文乱句，与文档「no Chinese support」声明一致，非缺陷。

## 清场记录

hosts 还原（api.github.com 0 残留）+ flushdns；注入的 latest-release.json 删除；配置/历史整体还原（321 条）；mock 停 18099 无监听；非只读；进程 0；无 .part；43117 无监听；防火墙三 profile 保持 OFF。

## 下轮候选

1. 度量脚本第三数据点随下个发版跑。
2. 长期未审：词典自动学词（watchedit）边界专项复查，或转录页取消/错误态深挖。
3. 真手机麦/云端 key 补账（挂账）。
