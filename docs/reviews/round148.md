# 第 148 轮体验官审查：完全断网可用性 + 出网流量审计（隐私承诺实证）

- 基线：main 不变（#231 skill 文档），win-unpacked 沿用（v0.15.0 packaged=true）
- 方法：hosts 黑洞构造断网（api.github.com/github.com/huggingface.co/hf-mirror.com/speaktype.zalize.com/chatgpt.com/www.doubao.com 等 → 127.0.0.1，测毕还原 + flushdns）；联网态 10 分钟正常使用（4 轮听写、全部页面、1 次转录、1 次搜索），每 2s 采样 SpeakType 进程树 TCP 远端（Get-NetTCPConnection -OwningProcess）
- 结论：**立案 1 项（隐私）**；断网可用性 8 项全通过；#221 回归通过

## 🔴 立案：provider=local 时启动即后台连接豆包/字节跳动遥测域

**现象**：`asrProvider=local`、用户未做任何豆包相关操作，联网态启动后 4 秒（07:37:12，早于任何听写）SpeakType 进程树即建立并持续保持对 www.doubao.com 及字节系 CDN/遥测域的 TCP 443 连接，贯穿全部 10 分钟采样窗口（1258 条采样中 1256 条为豆包/字节系目标）。

**根因**（代码可定位）：`desktop/src/main/index.ts` L526

```ts
if (hasAppKey()) ensureBridge();
```

只要 `speaktype.json` 存在 `doubaoAppKeyCache`（用户任何一次历史使用/测试过豆包 provider 后留下），启动即无条件预载隐藏豆包桥接窗口（`createBridgeWindow()` → `loadURL("https://www.doubao.com/chat")`），该页面自带字节跳动前端遥测（mcs.doubao.com、mon.zijieapi.com、mssdk.bytedance.com、lf3-config.bytetcc.com 等，见 `Network Persistent State` 落盘域名清单）——与当前 asrProvider 无关。

**A/B 复测证明**：删除 `doubaoAppKeyCache` 后重启，3 分钟采样仅剩 GitHub 升级检查 1 个目标（20.29.134.17:443 共 2 条，与 main.log 07:52:27 `latest release prefetched` 时间吻合）；豆包/字节连接归零。

**用户价值判断**：官网承诺「本地优先/无上传」；本地 provider 下后台静默连接第三方（含遥测域）且无 UI 提示，与承诺相悖。虽未见音频/文本内容上行证据（连接归属为豆包页面自身资源与遥测），但「曾经用过一次豆包 → 永久后台预载豆包页面」不符合用户预期。**建议修复**：预载条件加 `settings.asrProvider === "doubao"`（与 dictation.ts L198 warmUp 口径一致），或在设置中提供「清除豆包登录/缓存」入口。

## 出网目标清单表（联网 10min 采样，1258 条）

| 远端 IP | 端口 | 域名归属（DNS 比对/PTR） | 采样数 | 时间窗 | 功能解释 | 判定 |
|---|---|---|---|---|---|---|
| 140.82.116.6 | 443 | lb-…github.com（PTR 实证） | 2 | 07:37:14-16 | 升级检查（api.github.com，启动+5s，#172 口径） | ✅ 可解释 |
| 98.96.242.53 / 98.96.213.145 | 443 | www.doubao.com（A 记录逐字比对命中） | 182 | 07:37-07:40 | 豆包桥接窗口主站 | 🔴 立案 |
| 163.181.60.205/.201、163.181.246.190/.192/.194 | 443 | 字节系 CDN/遥测（Network Persistent State 域名：mcs.doubao.com、mon.zijieapi.com、mssdk.bytedance.com、lf-flow-web-cdn.doubao.com、lf3-config.bytetcc.com、lf3-short.ibytedapm.com、opt.doubao.com） | 986 | 07:37-07:47（持续） | 豆包页面静态资源+前端监控/风控 SDK | 🔴 立案 |
| 128.14.219.133 | 443 | 同上字节系边缘（Zenlayer 段，无 PTR） | 88 | 07:37-07:40 | 同上 | 🔴 立案 |
| （A/B 删缓存后）20.29.134.17 | 443 | GitHub Azure 段（无 PTR；与 prefetched 日志时间相关） | 2 | 07:52:29-31 | 升级检查 | ✅ 可解释 |

- 本地 ASR 无音频/文本出网证据：除上述目标外全窗口零其他远端；听写/转录期间未出现新增目标。
- 无 Google/Chromium 组件更新、无崩溃上报、无其他遥测目标。

## A. 完全断网可用性（hosts 黑洞态）

| 项 | 结果 | 证据 |
|---|---|---|
| 断网冷启动 | ✅ | launch 07:32:24.670 → starting 25.303（0.6s）→ sherpa worker 28.473（**3.8s**，基线 ~3.2s 同量级）；主窗完整、无白屏无卡顿、无升级横幅 |
| RightCtrl 中文听写 | ✅ | 整句落字 Notepad Ln1 Col29 |
| 免按 Alt+Q | ✅ | 2 段连续落字 Ln2 Col42，退出即收 |
| F8 改写降级口径 | ✅ | polish 未配置：按住 F8 说指令 → 打开 Settings→AI polish 页引导启用，不崩溃（取证口径：引导而非报错 toast） |
| 文件转录 | ✅ | r139_padded.wav → 1 段带时间戳 07:34:43 |
| 词典纠错 | ✅ | 断网听写正常经词典管线（hotwords=0 基线，落字无异常） |
| 历史/搜索/导出 | ✅ | 搜索「明天」命中多条；导出 md 1927 字节、BOM EF BB BF 在（#198） |
| 升级横幅静默失败 | ✅ | latest-release.json 删除后断网启动：零 prefetched 行、零 error/uncaught（07:3x 窗口 8 行日志全正常）、UI 无打扰 |

## C. 回归

- **#221 搜索 trim**：✅ 「方案␣」（尾随空格）命中多条今日条目。

## 清场核验

hosts 黑洞段删除（residue=False）+ flushdns；bak148 还原：hist=43、stats 122/7089/1018238、lang=zh/theme=system/hold=RightCtrl/mwr=False/provider=local/hotwords=0、doubaoAppKeyCache 保留基线原状；latest-release.json 还原；导出文件删除；mute=False；flag 无；failed-audio=0；进程 0；43117/43998/18099 无监听；防火墙三 Profile False 且零 SpeakType 规则（本轮未用防火墙）；VB-CABLE=1 保留；未改产品源码。

## 观察（不立案）

- A/B 实验中 api.github.com 命中 20.29.134.17（GitHub Azure 段，无 PTR），与 140.82 段同属 GitHub 轮换池，两次拨号均与日志时间吻合。
- Network Persistent State 中的字节系域名为豆包窗口历史访问累积，可作为「哪些域被访问过」的离线取证源。
