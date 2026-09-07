# SpeakType 第 36 轮严格审查报告

- 审查对象：main@7ee1d11（含 PR #87：纯大小写守卫、零 key 文案四处、latest 预拨日志）
- 方法：git pull → `npm run pack:dir`（全绿）→ 模拟全新用户（备份并清空 speaktype.json/history.json 后首启）真机全盘走查，截图 shots/01-13
- 环境：Windows Server 2022，未开防火墙、无网络阻断；测试状态已全部还原（配置/历史从备份恢复、手机麦克风关闭、无 whisper-server 残留）
- 证据标注：【实测】/【源码】/【未验证】
- 本轮未改任何产品代码，未开 PR

---

## 一、#87 三项回归——全部通过

1. **纯大小写守卫**【实测】：Parakeet 落字后把 "the" 改成 "The"（纯大小写）→ 全程零 auto-learn、词典无新增；同场景改成真实差异词照常学习。上轮 P2 闭环、清单断言现在成立。
2. **零 key 文案**【源码+实测】：README/README.zh-CN/docs/index.html/docs/zh/index.html 四处均已加「本地端点 API Key 可留空 / API key optional for local endpoints」；应用内 AI model 页 API Key placeholder 也写着 "leave empty for local endpoints like Ollama"（shots/10）。四轮遗留清账——**但见第二节 P2**。
3. **预拨日志**【实测】：启动 5 秒日志 `latest release prefetched: v0.10.0`，回归清单该条目终于可按写法执行。三轮遗留清账。

## 二、P2（本轮唯一）：官网线上版本未随 main 更新，#87 文案用户看不到

- 【实测】直接抓取线上 `https://speaktype.zalize.com/` 与 `/zh/`：**均无新句**（"API key optional for local endpoints" / "可留空" 匹配失败）；响应头 `cache-control: max-age=0, must-revalidate`、`cf-cache-status: DYNAMIC`——不是 CDN 缓存问题，是**部署没跑**。
- 【源码】官网源码在仓库 docs/ 目录且 #87 已合并 main；仓库 Actions 按约定保持关闭。推断（需维护方确认）：站点托管在 Cloudflare 侧，部署链路要么断了要么需要手动触发。
- 后果：第 31 轮起四轮打磨的官网卖点文案（零 key、本地全链路）全部停留在仓库里，线上用户看到的还是旧版。**修复：打通或手动执行一次官网部署，并把「合并含 docs/ 变更后线上抽查」写进发布清单。**

## 三、新用户视角全盘走查（本轮主线）——零 P1，整体达标

- **首启零配置即用**【实测】：清空配置首启 → en 系统默认 Parakeet+English（#76 行为）、状态 Ready、Home 大标题 "Hold RightCtrl to start voice typing" + First time? 4 步引导（shots/01）；直接按住 RightCtrl 口述一次成功落字（含 "round 36" ITN）。新用户从启动到第一句落字无任何必配项。
- **五页面视觉**【实测】（本轮 dark 主题；浅色历轮已覆盖）：Home/History 空态/Personas/Dictionary/Settings 四 tab 均无溢出错位；History 空态文案引导正确（shots/02-09）。
- **手机麦克风**【实测】：开关打开 → QR + `https://172.16.5.2:43117/?t=…` + "Waiting for a phone to connect…"（shots/13）；服务器真实监听（日志 `remote mic listening`），正确 token 抓取 200 且页面含操作指引，**错误 token 403**（鉴权有效）。自签证书提示文案已预先写明。【未验证】真手机扫码到落字全链路（无手机）。
- **免按/F8**：双击 RightCtrl 进免按 → 两句连落带空格 → 双击退出【实测】；F8 全链路上轮已 mock 验证、本轮未重复。
- **settle 延迟观察项**：本轮 4 次学词场景全部即时结算，上轮的延迟未复现，维持观察不立案。

## 四、反问式走查发现（记录/候选）

- **P3（新）：误编辑学词无撤销入口**——真机实证：手滑把 "the" 改成 "Fhe"（模拟用户误编辑）→ 词典即刻收进 `Fhe`。有 toast 可见性（第 28 轮守则达标），但 toast 上没有「撤销」按钮，误学要自己想起去 Dictionary 手删。建议：学词 toast 加 Undo（点击即从词典移除，~15 行）。这是自动学词系列的最后一块体验拼图。
- 首启引导 4 步卡片没提「双击 RightCtrl=免按」（副标题一句带过 Alt+Q），对最常用第二功能曝光偏弱——维持现状可接受，记录不立案。
- 手机麦克风入口藏在 Settings→General 底部，Home 无线索；对"笔记本没好麦"这类目标用户可发现性一般。候选：Home 引导第 1 步 hover/链接提一句。P3。

## 五、分级汇总

| 级别 | 数量 | 内容 |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 1 | 官网线上未随 main 部署，#87/#31 轮以来卖点文案未上线 |
| P3 | 2 | ① 学词 toast 无撤销（误编辑学垃圾词后自救成本高）② 手机麦克风可发现性 |

## 六、下轮优先级建议

1. **P2 官网部署打通**（一次性运维动作 + 发布清单加抽查项）
2. P3-① 学词 toast Undo（~15 行，自动学词系列收尾）
3. P3-② 手机麦克风可发现性（低成本文案位）
4. 观察项：settle 延迟继续顺带留意

## 七、未验证范围

- 真手机扫码→落字全链路（无手机；服务器/鉴权/页面已实测）
- 浅色主题本轮未重走（历轮已覆盖，#87 未动 UI）
- 中文口播链路（照旧）
- 真人麦、APK（照旧）
