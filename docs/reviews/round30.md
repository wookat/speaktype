# SpeakType 第 30 轮严格审查报告

- 审查对象：main@5139c77（含 PR #80 切模型立即释放 worker + About 轻量新版提示、PR #81 {{version}} 插值热修）
- 方法：git pull → `npm run pack:dir`（全绿）→ `release\win-unpacked\SpeakType.exe` 真机走查
- 环境：Windows Server 2022，未开防火墙、无网络阻断；测试状态已全部还原（模型 parakeet、界面语言 English、whisper-server 已随重启清理）
- 证据标注：【实测】打包应用真机证据 /【源码】源码推断 /【未验证】未能验证
- 本轮未改任何产品代码，未开 PR

---

## 一、#80/#81 回归结论

### 1. 切模型立即释放旧 worker——【实测】通过，收益如预期
- 空闲态切换 parakeet→sensevoice：**6 秒内进程组内存 1358MB→647MB**（-711MB），日志出现 `sherpa worker stopped (model switched)`（shots/05 前后测量）。
- 第 28 轮提出的 2.5GB 窗口期峰值问题按此机制已被压缩：旧模型不再等 10 分钟 idle 计时。

### 2. About 轻量新版提示——负向路径【实测】通过；正向横幅【未验证】
- 当前 GitHub latest = v0.10.0 = 本机版本 → About 页无横幅，判断正确（shots/01）。
- **限流边界【实测】**：审查时本机出口 IP 恰好处于 GitHub API 未鉴权限流（直接 curl 返回 403 rate limit）。打包应用同一时刻打开 About：页面干净、无报错露出、无卡顿——限流静默达标。
- 断网静默：【源码】`catch {}` 静默返回空串，不打扰。
- 缓存后语言切换：【源码】主进程只缓存语言无关的 tag 字符串，文案在渲染层每次 render 时翻译 → 切语言即换文案，无陈旧语言问题。
- `isNewer` 函数级 7 例验证：v0.11.0/v0.10.1/v1.0→true；同版本/低版本→false；**`models-v1` tag→false（NaN 防御正确，该仓库确实存在这个模型资产 release，防御非纸面）**。v0.11.0-beta→true，但 GitHub `releases/latest` 端点不返回 prerelease/draft，实际不可达。
- 正向横幅 UI（新版本存在时的展示与跳转）：无更新可发布 + 本机限流，真机无法触发，【未验证】，待 v0.11 发布后自然验证。

### 3. {{version}} 插值（#81）——【源码】通过
五语 locale 的 `settings.about.updateAvailable` 均使用 `{{version}}`，`makeTranslator` `replaceAll("{{name}}")` 一致，无单花括号残留。

---

## 二、专项①：更新检查边界（含设计反问）

三个边界（断网/限流/缓存后切语言）结论如上，实现本身干净。但反问一个可发现性问题：

**P2（轻）：检查只在用户打开 设置→About 时才发起——需要更新提示的用户恰恰不会主动去 About。**
- 【源码】`useEffect` 挂在 AboutTab 组件 mount 上；Home 页无任何入口。
- 第 29 轮建议原文是"启动查一次 + Home/About 一行提示"，#80 只落了 About 一半。竞品对照：Handy 的更新提示在主界面可见。
- 建议：Home mount 时调用同一 `app:latestVersion` IPC（主进程已缓存 tag，二次调用零网络成本），Home 顶部一行可关闭提示。~15 行。

---

## 三、专项②：zh-TW / ja / ko 视觉走查——零问题

每语言走查 General / Speech(音声認識/음성 인식) / About(情報/정보) 三页（shots/08-18）：
- 文案自然、无未翻译键、无溢出/截断；长 hint（ja 的 VAD 说明、ko 的失败录音说明）折行正常。
- 新增 key（updateAvailable）在五语 locale 均存在（源码级，横幅未触发故 UI 未见）。
- P0/P1/P2 = 0。

---

## 四、专项③：pending 转写中切模型——文字无损，有一个 P3 级浪费

【实测】RightCtrl 长句录音中途（第 3 秒）切 sensevoice：
- 句子完整准确落字（含 "round thirty"→"round 30" 的 ITN），无崩溃、无截断——**核心链路边界安全**。
- 但日志显示：切换瞬间 `sherpa worker stopped (model switched)` → 0.25 秒后又 `sherpa worker started (parakeet)`——`releaseSherpaWorker` 的 `pending.size > 0` 守卫只覆盖"recognize 调用在途"，不覆盖"录音会话进行中"（partial 间隙 pending=0），导致旧模型被无谓卸载又立刻重载：用户侧付一次 partial 延迟，且本想释放的旧大模型反而重新驻留直至 idle 计时。
- **P3 建议**：守卫改为"录音会话活跃"（dictation 侧 busy 标志暴露给 localasr，或 releaseSherpaWorker 延迟到 finalize 后执行）。~5 行。

---

## 五、新发现问题

### P2-1（本轮唯一实质缺陷）：whisper-server 不在释放范围，切走后永久常驻
- 【实测】选 whisper base-q5_1 听写一句（落字正确）→ `whisper-server.exe` 启动（169MB）→ 切回 sensevoice：**8 秒后 whisper-server 仍在 169MB 常驻**；【源码】它从无 idle 关停，只在换另一个 whisper 模型或退出应用时才停。
- 与 #80 刚修的问题同族不对称：sherpa worker 切走即释放，whisper-server 切走永久驻留（small 模型会是 ~500MB 级）。
- 修复 ~2 行：`settings:update` 切模型分支在 `releaseSherpaWorker()` 旁同时调 `stopLocalServer()`；顺带评估给 whisper-server 加同款 idle 关停。

### 复核（非问题）：缺模型时按住说话的反馈
选中未下载的 base-q5_1 直接听写：无落字、无历史条目、无日志——【源码】`start()` 抛 `error.localModelMissing` 走 `report("error")`，悬浮条显示错误态，属既有设计（有反馈、不静默），不立案。

---

## 六、分级汇总

| 级别 | 数量 | 内容 |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 2 | ① 切模型不停 whisper-server（~2 行）② 更新检查只挂 About、可发现性差（~15 行） |
| P3 | 2 | ① 录音会话中切模型触发无谓卸载重载（~5 行）② 上轮遗留：模型目录拒写误显 Not configured |

## 七、下轮优先级建议

1. **P2-1** 切模型同时停 whisper-server（+评估 idle 关停）
2. **P2-2** 更新检查挪到 Home（复用已缓存 IPC）
3. P3-1 releaseSherpaWorker 录音会话守卫
4. 上轮遗留：官网/文档「识别+标点+润色全本地零 key」叙事 + Ollama 指引

## 八、未验证范围

- 正向更新横幅 UI（需 v0.11 发布或本机 IP 脱离 GH 限流后模拟）
- 断网静默为源码级结论（本轮禁网络阻断）
- 真人麦、中文口播、APK、云端三通道（照旧）
