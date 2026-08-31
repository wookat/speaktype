# SpeakType 第 272 轮体验官报告（user-experience-officer + qa-engineer）

- 基线：main @ `06f4196`（v0.17.0，含 #360/#361/#362/#363/#364）
- 环境：Windows Server 2022，Node 24.0.1（desktop 要求 >=22.12.0，Node 20 会 EBADENGINE），fake mic（`--use-file-for-fake-audio-capture` + msedge-tts 生成中文 WAV），无物理音频输出设备
- 测试形态：全部基于打包产物（`npm run pack:dir` 的 win-unpacked + electron-builder NSIS 安装包），非源码 dev 模式
- 结论：**本轮回归全部通过，无 P0/P1/P2；立案 1 个 P3（官网首页横幅文案未随 v0.17.0 更新）**

---

## 1. 构建与打包（实测）

| 步骤 | 结果 |
|---|---|
| `npm install`（desktop/） | ✅ 通过（Node 24.0.1） |
| `npm run typecheck` | ✅ 0 错误 |
| `npm run build` | ✅ 通过 |
| `npm run pack:dir` | ✅ 产出 `desktop/release/win-unpacked` |
| electron-builder NSIS | ✅ 产出 `SpeakType-Setup-0.17.0.exe`；另将版本临时改为 0.17.1 打出 B 版安装包用于覆盖升级实验（改动已还原，未提交） |

## 2. 重点回归

### 2.1 #364 覆盖升级自启保留（实测 ✅）

实验流程（真实 NSIS 安装包）：

1. 静默安装 A 版（v0.17.0）→ 打开设置「开机自启」→ `reg query HKCU\...\Run /v SpeakType` 存在，指向 `%LOCALAPPDATA%\Programs\SpeakType\SpeakType.exe`。
2. 覆盖安装 B 版（本地打的 v0.17.1，含 GUI 交互式覆盖与静默覆盖两种路径）→ 升级完成后再次 `reg query`：**Run 值仍存在，未被清掉**。
3. 真卸载（`Uninstall SpeakType.exe /S`）→ `reg query` 返回「找不到指定的注册表项或值」，`SpeakType.exe` 已删除。**DeleteRegValue 仅在真卸载路径执行，符合 #364 预期**。

- 证据：升级前后 reg query 输出、卸载后 reg query 报错输出、`build/uninstaller.nsh` 的 `${ifNot} ${isUpdated}` 守卫（源码对照）。
- 局限：原计划的覆盖升级期间持续注册表轮询（runpoll.log）因后台脚本引号问题未生成，本项证据为升级前/后 + 卸载后三个时间点的直接查询，未覆盖升级过程中的瞬时状态。

### 2.2 #361 深色下原生 select 弹层（实测 ✅）

- 打包版切换深色主题后，逐个点开设置页多处原生 `<select>`（主题、识别语言、字幕时长等）：弹层均为深色背景、浅色文字、选中高亮清晰，无「白底白字/刺眼白弹层」回归。
- 截图证据：深色弹层多张实拍截图（会话附件 ss_3c14364e / ss_3f389570 / ss_a2ff8951 等）。
- 源码对照：主题设置同步 `nativeTheme.themeSource`。

### 2.3 #362 语音命令完成提示 3s（实测 ✅，约 3 秒）

- 开启「免按语音命令」，Alt+Q 免按模式播放「换行」命令音频，Notepad 中执行换行，屏幕出现「Voice command / New line」toast。
- 用 250ms 间隔全屏采样 + toast 区域像素差分测量：toast 出现 `14:57:23.301`，消失 `14:57:26.385`，可见时长 **≈3.1s**（含淡出），与 `dictation.ts` 中 `showToast(..., 3000)` 一致。
- 局限：仅测量一次；首次命令音频尝试因 voicedMs=0（音频头部静音过长）未触发命令，属测试音频问题而非产品缺陷，重制音频后复测通过。

### 2.4 核心链路（实测 ✅ 无回归）

- **RightCtrl 中文落字**：按住 RightCtrl 播放中文音频，Notepad 落字「今天天气很好，我们一起去公园散步。」，`main.log` 有 `dictation finalize: durationMs=7876 maxPeak=32768 voicedMs=2600`。
- **Alt+Q 免按多句**：连续多句依次落字（含自动分段空行，见 3.2），首页统计 Sessions/Words 正常累计。
- **Esc 取消**：免按录音进行中按 Esc，会话结束、无额外文字落入，已落文字保留。

## 3. 专项深挖

### 3.1 官网/README v0.17.0 一致性（实测，立案 1 项 P3）

- README（EN）版本徽章 v0.17.0、下载表三个链接（Setup 0.17.0 / portable 0.17.0 / APK 0.15.0）与官网 https://speaktype.zalize.com 一致；四个 URL `curl -I` 均 **HTTP 200**。
- GitHub Release v0.17.0 页面（HTML 实查）：Highlights 列出 #354/#357/#360/#362/#346/#352/#358/#359/#361，下载文件名与 README/官网一致。
- 官网截图资产（docs/assets/screenshot-*.png）为 v0.17.0 深色实拍（截图内侧栏版本号 v0.17.0），与 #363 一致。
- 局限：GitHub API `/releases/latest` 请求被限流（HTTP 403 rate limit），release 元数据经由页面 HTML 验证而非 API。
- 发现 → 见 P3-272-1。

### 3.2 免按语音命令 + 自动分段组合（#354/#357）（实测 ✅）

- 免按模式：句子 A → 停顿 >4s（`paragraphBreakMs=4000` 默认）→ 句子 B，B 前自动插入空行（\r\n\r\n）分段 —— #354 自动分段生效。
- 同一免按会话中说「删除上一句」：上一句连同其前的分段空行一并退格删除，Notepad 恢复到 A 段结束状态，toast 提示执行成功 —— 命令与分段组合无互相破坏。
- 「换行」命令实测见 2.3；「另起一段」未单独实测（源码上与换行同路径，仅粘贴双 EOL，属源码推断）。
- 语音命令默认关闭（`voiceCommands: false`）：默认状态下说「换行」按普通文本落字「换行。」，符合 opt-in 设计。

## 4. 立案项

### P3-272-1 官网首页横幅文案未随 v0.17.0 更新（EN/ZH 双语）

- 复现：打开 https://speaktype.zalize.com （或 repo `docs/index.html:40` / `docs/zh/index.html:40`）。
- 现象：横幅写「**v0.17.0** is out - privacy hardening, cleaner uninstall and portable mode」/「**v0.17.0** 已发布 —— 隐私加固与更干净的卸载/绿色版」，但「隐私加固/更干净卸载/绿色版」是 **v0.16.0** 的亮点；v0.17.0 的实际亮点是免按自动分段、语音命令、深色下拉修复（见 Release 页 Highlights，实查 HTML）。
- 证据：官网 HTML 实查（HTTP 200）+ Release v0.17.0 页面 Highlights 文本对照 + repo 内 `docs/index.html`/`docs/zh/index.html` 第 40 行。
- 影响面：营销/官网一致性——版本号已更新但卖点文案是上一版的，新用户会误解 v0.17.0 内容；下载链接本身正确，不影响功能。
- 修复建议：#363 之后补一行文案，例如「v0.17.0 is out — hands-free auto paragraphs & voice commands」/「v0.17.0 已发布 —— 免按自动分段与语音命令」。

## 5. 实测证据 vs 源码推断

- **实测**：上文 2.1–2.4、3.1、3.2 除注明外均为打包版直接操作 + 截图/注册表输出/`main.log`/像素差分证据。
- **源码推断（未实测）**：
  - 「另起一段」命令（与「换行」同代码路径）。
  - #360 长命令词一字容错（本轮命令均被精确识别，未构造一字误识音频）。
  - `uninstaller.nsh` 的 `${isUpdated}` 分支逻辑（行为已由 2.1 实验佐证，NSIS 宏本身为源码对照）。

## 6. 未测试项

- 系统静音/闪避类（无物理音频输出设备，**untested**，遵守规则如实标注）。
- portable 版（本轮只打了 NSIS）。
- 手机作麦克风（Android APK）联动。
- 文件转录长音频 + 历史页展示。
- 按应用人设规则、设置导入导出兼容旧版配置。
- 英文/多语言识别、云端 API 模式。
- GitHub API release 元数据（限流，见 3.1）。
- 覆盖升级过程中的注册表瞬时状态（仅前/后/卸载三点查询，见 2.1）。

## 7. 环境清理（实测 ✅）

- 已终止全部 SpeakType.exe（8 个进程）与 Notepad；tasklist 复查无 SpeakType/notepad/ffmpeg 残留。
- 已静默卸载测试安装版本：`%LOCALAPPDATA%\Programs\SpeakType\SpeakType.exe` 不存在，HKCU Run\SpeakType 值已随卸载清除。
- 临时版本号改动（0.17.1 实验）已还原，仓库工作区除本报告外无改动；未提交任何 secrets。
- 备注：卸载后 `%APPDATA%\SpeakType`（用户数据/模型）仍保留，为卸载器默认行为，非本轮立案。
