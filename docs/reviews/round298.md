# SpeakType 第 298 轮严格体验官报告（打包版 0.17.2 @ main a9ec83d，验收 PR #387 六项修复）

> 角色：user-experience-officer + qa-engineer。测试对象：Windows VM 上 main（HEAD `a9ec83db5f5494c95cea04f073c738dcab5e3781`，含 #387 合并提交 `9eaa376`）全新 `npm install && npm run typecheck && npm run build && npm run pack:dir` 产出的 `desktop/release/win-unpacked/SpeakType.exe`（不测 dev）。全程真实本地模型（SenseVoice / Parakeet 0.6B v3 / whisper tiny-q5_1 / base-q5_1 / small-q5_1）；mock 仅一处：F8 改写与润色用的本地 OpenAI 兼容服务 `http://127.0.0.1:18081/v1`（`mock_llm.cjs`，回 `MOCK-REWRITE[n]`，延迟由 `mock_delay.txt` 控制，用来把「上一句收尾窗口」拉长到可复现）。**未改 hosts / 防火墙 / asar / 产品源码**。
> 证据目录（VM 本地，未入库）：`C:\Users\Administrator\tts\`（`mainlog_r298.log` 完整主进程日志、`toast_final.log` 悬浮条/toast 40ms 轮询、`phone.log` 手机端模拟、`confirm5.json` / `yue5.json` / `yue5b.json` 五语 CDP 采样、`history_backup_r298b.json`）；截图 `C:\Users\Administrator\screenshots\ss_*.png`。
> 判定口径：**PASS/FAIL = 打包版实测**；「源码核对」「推断」「未测」单独标注。本报告不对任何 PR 的开关/合并状态做推断，只陈述 `git log` 可见的提交事实。

## 给老板的结论（可直接转发）

1. #387 六项修复在打包版全部实测生效，**297 轮的 5 个 P2 全部关闭**：① 排队中晚 Esc 现在有明确 toast「听写已取消 — 排队中的下一句已作废」（五语实测），上一句照常落字、排队句不落字不进 History，日志 `queued hold dropped` 且无 `resumed queued hold`；② 排队期间按 F8 再松手不再吞掉仍按着的 RightCtrl 句（`resumed queued hold (frames=16, released=false)`，第二句完整落字，3/3 次）；③ 两步确认六处入口（删模型 / History 清空 / 词典清空 / 恢复默认 / 清除全部 / 删人设）600ms 内的第二次点击/Enter 被挡、>600ms 生效、4s 自动复位、History 清空 Esc 可撤销，五语文案完整；④ Settings 全部文本字段 6ms/字连打（API Key 77 字、Base URL 81 字、模型名、润色提示词 288 字、词典、人设名/提示词、中转 URL）渲染端 = `speaktype.json` = bridge 三方一致，不丢字；⑤ whisper tiny/base/small 下「粤语」选项置灰并给出五语提示，真实粤语音频 whisper 三档均按普通话解码（`yue` 与 `zh` 输出逐字一致），SenseVoice 忠实输出粤语字词；⑥ 导出 EPERM / EBUSY / ENOSPC 三种 errno 五语行动式文案 15/15 实测，History Retry 在 820px 下两行截断且按钮可点。核心链路（RightCtrl / Alt+Q / Esc / F8 mock，SenseVoice zh + Parakeet en + whisper tiny ja）全绿，无 P0/P1。
2. 新立 **1 个 P3**（P3-298-1）：手机麦正在录音时，桌面端松开 RightCtrl 会提前结束手机那句（3/3 复现，F8 松手则不影响）。`stop(owner)` 只区分了 hold/rewrite，没有区分本地/手机所有者。日常单端使用不受影响。另 3 项体验差距见 §5。
3. 判断：**可继续发布迭代**；建议 299 轮顺手把 P3-298-1 并进去（一行判断：远程会话进行中忽略本地 hold 松手），其余无阻塞项。

---

## 0. 环境与构建

| 项 | 结果 |
|---|---|
| 源码 | `wookat/speaktype` main HEAD `a9ec83d`（`docs(skill): 第 293 轮测试经验沉淀 (#385)`），其父 `9eaa376` 为 #387 合并提交 |
| Node / OS | Node 20.19.0 / npm 10.8.2；Windows Server 2022；无物理麦克风（全程 `--use-file-for-fake-audio-capture`） |
| `npm install` | 依赖安装完成；进程退出码非 0 仅因 `npm audit` 报告漏洞条目（未执行 audit fix，改依赖不在 QA 范围） |
| `npm run typecheck` / `build` / `pack:dir` | 三项均通过；electron-builder 26.15.3 / Electron 43.3.0 |
| app.asar | 36,624,917 B，SHA-256 `A9818A6BB806159D134849AE6000F0B739E34CA9683BBD1A0412914528AF625B`；全程未改，测毕复核一致 |
| 打包态证明 | `[2026-09-06 00:23:29.500] [info]  SpeakType 0.17.2 starting (packaged=true)` |
| 启动参数 | `--no-proxy-server --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<wav> --remote-debugging-port=9333` |
| 音频夹具（Edge TTS → ffmpeg 16k mono s16 PCM，规范 RIFF 无 LIST 块） | `zh.wav`「今天天气很好，我们一起去公园散步吧。」/ `en.wav`「The quick brown fox jumps over the lazy dog.」/ `ja.wav`「今日はとても良い天気ですね。」/ `yue.wav`（粤语 TTS 9.736s）「今日天氣好熱，我想去公園行一行，你得唔得閒陪我去呀？」/ `silence30.wav` |
| 键盘注入 | `rkey.ps1`（SendInput 扫描码，`Start-Process ... -WindowStyle Hidden` 分离运行）；Esc 一律 `down:esc,60,up:esc` |
| 手机麦模拟 | `phone.mjs`：WebSocket 连 `wss://<lan>:<port>/ws?t=<token>`，`{"type":"start"}` → 20ms PCM 帧实时推送 → `{"type":"stop"}` |

## 1. 总览矩阵

| # | 项目 | 结论 | 主要证据 |
|---|---|---|---|
| 核心-1 | RightCtrl 按住落字 Notepad（SenseVoice zh） | **PASS** | `00:26:13 finalize durationMs=8391 voicedMs=2660`；toast.log 悬浮条 `今天天气很。→…散步吧。→ Transcribing… → Polishing… → 落字` |
| 核心-2 | Alt+Q 进/出免按（SenseVoice zh，2 句） | **PASS** | `00:27:09 / 00:27:16` 两条 finalize；「Hands-free mode ended」toast |
| 核心-3 | 录音中 Esc | **PASS** | `00:27:45 TOAST Dictation canceled / Nothing was typed`，无 finalize |
| 核心-4 | F8 mock 改写 | **PASS** | `00:28:44 PANEL … Rewrite Rewriting… (original kept, Esc to cancel)` → `MOCK-REWRITE[2]` |
| 核心-5 | Parakeet en | **PASS** | history `01:04:20 The quick brown fox jumps over the lazy dog.`（与夹具逐字一致） |
| 核心-6 | whisper tiny ja | **PASS** | history `01:06:11 今日はとても良い天気ですね` |
| a-1 | 排队晚 Esc：`down:rctrl,4000,up,1200,down:rctrl,2000,down:esc,60,up:esc,1500,up:rctrl`（润色延迟 3s） | **PASS（P2-296-1 关闭）** | §3.a：`queued` → `queued hold dropped`，无 `resumed`；toast 五语；History 无排队句；Notepad 仅第一句 |
| a-2 | 排队早 Esc（第二句按下 ~0.5s 即 Esc，落在上一句润色中） | **PASS（沿用设计：两句均取消）** | `01:37:42 queued hold dropped` → toast「Dictation canceled / Nothing was typed」，无 MOCK[31] |
| a-3 | queue already occupied | **PASS** | `00:30:54 / 01:38:43 dictation start: queue already occupied, press ignored`，随后原排队句 `resumed (frames=1, released=true)` |
| b-1 | 排队中按 F8 150ms 再松手 | **PASS（P2-296-2 关闭，3/3）** | `00:32:15 queued` → `00:32:57 TOAST Still finishing the last one` → `00:32:19 resumed queued hold (frames=16, released=false)` → 第二句 `finalize durationMs=5881` → MOCK[8]/[10] |
| b-2 | F8 改写中松 RightCtrl | **PASS** | `00:34:14 PANEL Rewrite` 持续到 `00:34:18 finalize durationMs=4245`（= F8 全程），MOCK[12] 落字；RightCtrl 松手未截断改写 |
| b-3 | RightCtrl 按住中按 Alt+Q | **PASS（观察）** | `00:34:43 finalize durationMs=1909`，无免按 toast、无 `queued`：Alt+Q 未进入免按，当前句正常收尾 MOCK[13] |
| b-4 | 免按聆听中按 RightCtrl / F8 | **PASS（现有设计）** | `00:34:54 / 00:35:05 TOAST Hands-free mode ended — Another hotkey was pressed, so continuous dictation stopped`（#387 新增「因其他热键」文案），当前句落字 |
| b-5 | 手机麦按住中桌面松 F8 | **PASS** | §3.b rv3：手机 6026ms 全程由手机 stop 结束，F8 松手无影响 |
| b-6 | 手机麦按住中桌面松 RightCtrl | **FAIL → P3-298-1** | §3.b rv1/rv2/p3：手机 6s 句在桌面 RightCtrl 松手瞬间被 finalize（5133 / 5222 / 4681ms），对照组无按键 6011ms |
| b-7 | 桌面录音中手机 start | **PASS** | `00:37:35 phone recv {"type":"busy"}`；桌面句 `finalize durationMs=4891` 自然结束，手机 stop 未截断 |
| c | 两步确认六入口 × 键鼠 × 五语 | **PASS（P2-296-3 关闭）** | §3.c |
| d | Settings 文本字段 6ms/字连打 | **PASS（P2-296-4 关闭）** | §3.d |
| e-1 | 真实粤语音频：SenseVoice vs whisper tiny/base/small | **PASS（P2-296-5 关闭）** | §3.e 表 |
| e-2 | whisper 下 `language=yue` 实际按 `zh` 解码 | **PASS（实测）** | small `yue` 与 small `zh` 输出逐字相同 `今天天气好热,我想去公园行一行 你得不得闲陪我去呀?` |
| e-3 | 设置页 yue 置灰 + 提示五语 | **PASS** | `yue5.json` / `yue5b.json`：whisper 三档 `yueDisabled=true` + 提示；SenseVoice `yueDisabled=false`；Parakeet 无语言下拉 |
| e-4 | whisper 三种失败 stderr 尾部落 main.log | **PASS ×3** | 坏模型 exit 3 / 外部 kill exit 4294967295 / 端口冲突 exit 1，均有 `whisper-server stderr (exit n):` + 尾部 |
| f-1 | 导出 ENOSPC / EBUSY / EPERM 五语 | **PASS 15/15** | §3.f |
| f-2 | 配置导出 ENOSPC | **PASS** | `01:31:09 config export failed Error: ENOSPC` |
| f-3 | History Retry 820px 长错误 | **PASS** | 错误 span `h=32 lh=16px scrollHeight=112 line-clamp-2`，`title` 为全文；Retry `47×24` 可点、不重叠 |
| g | 自由发掘（Transcribe / Home） | 1 P3 + 3 差距 | §4 / §5 |

## 2. 核心链路回归（SenseVoice zh / Parakeet en / whisper tiny ja）

见 §1 核心-1～6。补充：Parakeet 与 whisper 段分别以 `en.wav` / `ja.wav` 重启进程（`launch.log` 01:03:34 / 01:05:33），`polishEnabled=true` 指向 mock，因此 History `text` 为 `MOCK-REWRITE[n]`、`raw` 为 ASR 原文——以 `raw` 判定识别正确性。

## 3. 专项

### 3.a #387-① 排队晚 Esc 取消文案（`canceledQueuedBody`）

序列 `down:rctrl,4000,up:rctrl,1200,down:rctrl,2000,down:esc,60,up:esc,1500,up:rctrl`，mock 润色延迟 3000ms，Notepad 前台，五种 UI 语言各跑一次（每次 `updateSettings({uiLanguage})` + reload 后再跑）：

```text
[01:34:53.700] dictation finalize: durationMs=3891 maxPeak=32764 voicedMs=2860
[01:34:55.024] dictation start: previous session still finalizing, queued
[01:34:57.064] dictation cancel: queued hold dropped
01:34:57.283Z TOAST visible|Dictation canceled The queued next sentence was discarded
01:34:57.286Z PANEL visible|MOCK-REWRITE[26]          ← 上一句照常落字
```

| 语言 | toast（实测） |
|---|---|
| en | Dictation canceled — The queued next sentence was discarded |
| zh-CN | 听写已取消 — 排队中的下一句已作废 |
| zh-TW | 聽寫已取消 — 排隊中的下一句已作廢 |
| ja | 入力をキャンセルしました — 待機中の次の文は破棄されました |
| ko | 받아쓰기를 취소했습니다 — 대기 중이던 다음 문장을 취소했습니다 |

五次均：无 `resumed queued hold` 行；History 只新增 MOCK[26]~[30]（第一句），无第二句；Notepad 仅第一句（截图 `ss_f05dba02.png`）。
边界：Esc 若落在**上一句润色进行中**（a-2，01:37:42），走 `finishing.cancel()` 分支，两句都取消、toast「Nothing was typed」——与 296 轮「早 Esc」设计一致，不算缺陷；文案未提「排队句」但「什么都没输出」属实。

### 3.b #387-② owner 隔离矩阵（`stop(owner)`）

源码分支（`dictation.ts` L687-712）与实测对照：

| 分支 | 实测 |
|---|---|
| `pendingStart && owner !== "rewrite"` → `released=true` | b-1：F8 松手不置位 → `frames=16, released=false` ✅ |
| `owner && (owner==="rewrite") !== this.rewriting` → return | b-2（hold 松手不结束 rewrite）✅；b-5（rewrite 松手不结束手机句）✅ |
| `handsFree` → `handsFreeEndByKey` toast | b-4 ✅ |
| owner=`hold` 且 `rewriting=false` → finalize，**不看会话是否来自手机** | b-6 ❌ P3-298-1 |

P3-298-1 复现（01:57-01:59，`remoteMicEnabled=true`，`phone.mjs … 6000`，桌面按键在手机 start 后 ~4s 落下）：

```text
rv0 对照（无按键）  phone start 01:58:19.173 → finalize 01:58:25.182 durationMs=6011 → phone sent stop 01:58:25.184
rv2 RightCtrl 700ms  phone start 01:58:52.122 → rctrl 松手 ≈01:58:57.3 → finalize 01:58:57.340 durationMs=5222（phone 仍在推帧，01:58:58.149 才 sent stop）
rv3 F8 700ms         phone start 01:59:21.220 → f8 松手 ≈01:59:26.4 → finalize 01:59:27.256 durationMs=6026（由 phone stop 结束）
```

另 00:36:53 p3 首次出现同现象（`durationMs=4681` < 手机 6006ms）。History 四条 `source:"phone"` 均正常落字（夹具语音在 3.3s 前结束，故本次无内容损失；真人手机说到一半会被截断）。

### 3.c #387-③ 两步确认（`useConfirm`：600ms 防抖 + 4s 复位）

六入口 × 鼠标双击 / `tap:enter,120,tap:enter` / `tap:enter,800,tap:enter` / Esc，en 下直接操作，另四语用 CDP 采样文案（`confirm5.json`）：

| 入口 | 立即二击（<600ms） | >600ms 二击 | 4s 复位 | Esc |
|---|---|---|---|---|
| 词典清空 | 未执行（`2/300` 不变） | 执行 → `0/300` | ✅ 回「Clear」 | n/a |
| 人设删除 | 未执行 | 执行（自定义人设消失） | ✅ | n/a |
| 删模型 | 未执行（模型仍在） | 未执行破坏性操作（保护已下载模型），复位后回「Delete model」 | ✅ | n/a |
| 恢复默认设置 | 未执行 | 未触发（避免破坏测试环境） | ✅ | n/a |
| 清除全部数据 | 未执行 | 未触发 | ✅ | n/a |
| History 清空 | 未执行 | 未触发 | ✅ | ✅ 取消，17 条不变，焦点在 Cancel |

五语文案（armed 态）摘录：

| 语言 | History | 词典 | 删模型 | 恢复默认 / 清除全部 | 人设 |
|---|---|---|---|---|---|
| en | Clear all history? [Clear / Cancel]，focus=Cancel | Clear all words? Click again | Confirm delete? Re-download needed to use again | Confirm reset settings? / Confirm erase everything? | Delete? Click again |
| zh-CN | 清空全部历史？[清空 / 取消]，focus=取消 | 清空全部热词？再点一次 | 确认删除？再次使用需重新下载 | 确认恢复默认设置？/ 确认清除全部数据？ | 确认删除？再点一次 |
| zh-TW | 清空全部歷史？[清空 / 取消] | 清空全部熱詞？再點一次 | 確認刪除？再次使用需重新下載 | 確認還原預設設定？/ 確認清除全部資料？ | 確認刪除？再點一次 |
| ja | 履歴をすべて消去しますか？[消去 / キャンセル] | すべての単語を消去しますか？もう一度クリック | 削除しますか？再利用には再ダウンロードが必要 | 設定をリセットしますか？/ 本当にすべて消去しますか？ | 削除しますか？もう一度クリック |
| ko | 모든 기록을 지울까요? [지우기 / 취소] | 모든 단어를 지울까요? 한 번 더 클릭 | 삭제할까요? 다시 사용하려면 재다운로드 필요 | 설정을 초기화할까요? / 정말 모두 삭제할까요? | 삭제할까요? 한 번 더 클릭 |

截图：`ss_e0618c86 / ss_e0fad3b4`（词典）、`ss_7c03c3a8`（人设）、`ss_6f8ffa40 / ss_8368e327`（通用页两按钮）、`ss_49a98667`（删模型）、`ss_ca8aa027`（History）。
未测：恢复默认 / 清除全部 / 删模型的**真正执行**（有意不执行，避免破坏测试环境与已下载 1GB 模型）；源码核对三者与词典共用同一 `useConfirm.press`，防抖/复位已由词典与人设入口实测。

### 3.d #387-④ Settings 文本字段连打一致性

以约 6ms/字符的速度向输入框连打夹具文本（`apikey.txt` / `baseurl.txt` / `model.txt` / `prompt.txt` / `dict1~3.txt` / `persona.txt` / `relay.txt`），输入结束后三方比对（渲染端 `input.value` / `%APPDATA%\SpeakType\speaktype.json` / `speaktype.init()` bridge）：

| 字段 | 输入 | 结果 |
|---|---|---|
| 润色 API Key | 77 字 `sk-rapid0123…-END` | 三方一致 |
| 润色 Base URL | 81 字 `https://api.rapid-typing-test.example.com/v1/path/segment/…` | 三方一致 |
| 润色模型名 | 47 字 | 三方一致 |
| 润色提示词（人设 prompt） | 288 字 | 三方一致 |
| 词典热词 ×3 | `dict1~3.txt` | 三方一致，`hw_backup.json` 事后还原 |
| 人设名称 | 90 字 | 三方一致 |
| 远程中转 URL | 58 字 | 渲染端即时更新，**Tab 失焦后**三方一致（源码 `MicSection.tsx` `defaultValue + onBlur` 提交，非缺陷） |

### 3.e #387-⑤ whisper 粤语降级（真实粤语音频 `yue.wav`）

同一段粤语 TTS，`autoPaste` 目标 Notepad，History `raw`：

| 模型 | language | 输出（raw） | 备注 |
|---|---|---|---|
| whisper tiny-q5_1 | yue | 今天天气好热,我想去公园行一行,你得不得行陪我去啊?今天 | 普通话化 + 尾部幻觉「今天」；`t2cn applied (language=yue): 3/29` |
| whisper base-q5_1 | yue | 今天天气好热,我想去公园行一行,你得不能行陪我去呀? | 「唔得閒」→「不能行」 |
| whisper small-q5_1 | yue | 今天天气好热,我想去公园行一行 你得不得闲陪我去呀? | 最接近，但仍是普通话字词 |
| whisper small-q5_1 | **zh** | 今天天气好热,我想去公园行一行 你得不得闲陪我去呀? | **与上一行逐字相同 → `yue` 在 whisper 路径确实按 `zh` 解码**（`whisperLanguage("yue")==="zh"` 实测印证） |
| SenseVoice | yue | 今日天气好热，我想去公园行一行，你得唔得闲陪我去呀。 | 忠实粤语用字（日/唔/闲），与源句仅简繁差异 |

设置页（`yue5b.json`，每次切模型后 reload 采样）：whisper 三档 `<option value="yue" disabled>`，提示「Whisper tiny/base/small can't transcribe Cantonese — speech will be decoded as Mandarin Chinese. For real Cantonese, switch the model to sensevoice-small.」（zh-CN「Whisper tiny/base/small 不支持粤语，会按普通话解码。要真正识别粤语，请把模型换成 sensevoice-small。」；zh-TW / ja / ko 见 `yue5.json`）；SenseVoice `disabled=false`；Parakeet 无语言下拉（`NO SELECT`）。

whisper 三种失败（模型 base，`localasr.ts` stderr 尾部）：

```text
[01:15:15.518] local whisper-server exited (3)            ← 4KB 零字节假模型（bad magic）
[01:15:15.518] whisper-server stderr (exit 3):
whisper_init_from_file_with_params_no_state: loading model from '…\models\ggml-base-q5_1.bin' …
[01:19:07.857] local whisper-server exited (4294967295)   ← 外部 Stop-Process
[01:20:28.916] local whisper-server exited (1)            ← 端口 18717 被占：couldn't bind to server socket: hostname=127.0.0.1 port=18717
```

坏模型与端口冲突两种情况下听写均得到 toast / History 错误「Local recognition engine failed to start: check main.log via About → Open log folder and report the issue」，失败音频落 `failed-audio\`；外部 kill 发生在空闲态，仅落日志，下一次听写自动重启 server 并正常落字（01:19:47 starting → 01:19:57 finalize）。假模型删除、`.bak` 改回后 base 恢复正常（01:18:49 落字）。

### 3.f #387-⑥ 导出 errno 五语 + Retry 820px

EPERM：对已存在文件 `noaccess.md` `icacls /deny` 写权限后在原生对话框选它并确认覆盖；EBUSY：`lockme.txt` 由分离进程 `FileShare.None` 持锁；ENOSPC：50MB VHD `T:` 填满后导出足够大的 History（小于一簇的导出会 MFT 常驻而成功，见 SKILL）。每语言三次导出（`toast_final.log` 01:23-01:29）：

| 语言 | ENOSPC | EBUSY | EPERM |
|---|---|---|---|
| en | Couldn't save file — The disk is full — free up space or pick another drive. | …The file is open in another app — close it and try again. | …No permission to write to that folder — pick another location. |
| zh-CN | 保存文件失败 — 磁盘已满，请清理空间或换个磁盘。 | 文件正被其他程序打开，请关闭后重试。 | 没有写入该文件夹的权限，请换个位置保存。 |
| zh-TW | 儲存檔案失敗 — 磁碟已滿，請清理空間或換個磁碟。 | 檔案正被其他程式開啟，請關閉後重試。 | 沒有寫入該資料夾的權限，請換個位置儲存。 |
| ja | ファイルを保存できませんでした — ディスクの空き容量がありません。… | ファイルが他のアプリで開かれています。… | このフォルダへの書き込み権限がありません。… |
| ko | 파일을 저장하지 못했습니다 — 디스크가 가득 찼습니다.… | 파일이 다른 앱에서 열려 있습니다.… | 이 폴더에 쓸 수 있는 권한이 없습니다.… |

对应 main.log 15 条 `save text failed (…) Error: ENOSPC|EBUSY|EPERM` + 1 条 `config export failed Error: ENOSPC`。
Retry 820px：把 §3.e 失败条目的 `error` 拉长到 412 字后（app 退出态改 history.json），`winsize.ps1 -w 836` → `innerWidth=820`，CDP 量测 `{cls:"line-clamp-2 … text-red-500", h:32, lh:"16px", sh:112, title:392, retry:{w:47.16,h:24,disabled:false}, overlap:false}`。

## 4. 自由发掘

- Transcribe：原生文件选择 `yue.wav`（SenseVoice）→ 一段「今日天气好热，我想去公园行一行，你得唔得闲陪我去啊。」+ TXT/SRT 导出按钮（`ss_248fa340 / ss_5995493d`）；`silence30.wav` → 「No speech detected.」（`ss_8c7c14c8`）。
- Home：16 sessions / 32 words / ~1 min voice input / **Time saved 0s**（`ss_36623c08`）；onboarding 卡片与当前人设卡正常。
- 手机麦：LAN 模式二维码 URL `https://172.16.7.2:43117/?t=…`，busy 拒绝、状态流（connecting → recording+partial → transcribing → polishing → idle）正常；发现 P3-298-1。

## 5. 竞品差距（3 项，均为本轮实测观察；竞品能力为公开产品资料，未在本轮实测竞品）

1. **本地引擎启动失败只让用户「去看 main.log」**：坏模型 / 端口占用 / 进程被杀三种失败 UI 文案相同，且 stderr 已明确含 `bad magic` / `couldn't bind` 等可分类线索。同类桌面听写/转写工具通常直接给「重新下载模型」「更换端口重试」按钮。建议：按 stderr 关键词分类 → toast 带动作按钮（重新下载 / 重试）。
2. **Transcribe 仅 TXT / SRT**：同类文件转写工具普遍还提供 VTT / 带时间戳 TXT / 段落编辑后再导出。当前无法在导出前修正识别错误。
3. **Home「Time saved 0s」**：16 次会话 32 词后仍显示 0 秒，对新用户是负激励。建议改为词数/WPM 或在样本不足时隐藏该项。

## 6. 缺陷清单

| ID | 级别 | 现象 | 复现 | 建议 |
|---|---|---|---|---|
| P3-298-1 | P3 | 手机麦录音中，桌面松开 RightCtrl 即结束手机那句 | §3.b rv1/rv2/p3（3/3），对照组 rv0 / F8 rv3 不复现 | `stop("hold")` 时若 `remoteSource`（或 `activeWs`）为真则 return；或在 `start()` 拒绝本地 hold 时记一个「本次 hold 无会话」标记，松手直接忽略 |

## 7. 环境还原

- 打包 app、mock LLM、toast 轮询、Notepad 已全部结束；T: VHD 已分离，`noaccess.md` / `lockme.txt` / 锁进程已清除；假模型删除、`ggml-base-q5_1.bin` 59,707,625 B 复原，五个模型文件完整。
- `speaktype.json` 以 `profile_backup_r298.json` 为基础恢复（`uiLanguage=system`、RightCtrl/Alt+Q/F8、SenseVoice、`remoteMicEnabled=false`），并把润色 mock 配置清回默认（`polishEnabled=false`、URL/Key/Model 空）、去掉备份里两条编码损坏的热词；History 保留本轮真实产生的条目（合成的长错误串已还原为原文）。
- 仓库仅新增本报告与 SKILL.md 追加，未改产品源码；GitHub Actions 保持禁用，验收以本地 typecheck/build/pack 为准。
