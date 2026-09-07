# 第 139 轮体验官审查：免按多轮分段 × muteWhileRecording=ON 静音状态机（main @ 9fca9d7）

- 基线：main @ 9fca9d7（含 #221 搜索 trim / #219 / #217），真实打包应用 `desktop\release\win-unpacked\SpeakType.exe`（用户 pack:dir @ 08-17 04:44）。
- 取证工具：修正后 CoreAudio 探针（IAudioEndpointVolume 11-filler，测前 SetMute(1)→GetMute=True / SetMute(0)→False 往返自验通过）；后台采样循环记录 `mute + muted-by-recording flag`（实测采样粒度 ~2s，getmute 子进程开销所致）；fake mic 用 sample.wav + 4s 静音尾的 padded wav（16k/mono/16bit，vadSilenceMs=2000 触发分段）。
- 设置：muteWhileRecording=true、hotkeyToggle=Alt+Q、language=zh、vadAutoStop=true（B3 时经设置页 UI 切 OFF 后还原）。

## A1 免按多轮分段 × muteWhileRecording=ON（主专项）

Alt+Q 进入免按，fake mic 循环产生 3 个分段落字（Notepad 实拍 3 句中文），Alt+Q 退出。探针序列（节选，完整见下）：

```
04:50:14.176 mute=False flag=False   ← 进入前
04:50:16.198 mute=True  flag=True    ← 进入免按即置静音+落 flag ✅
04:50:24.392 mute=True  flag=True
04:50:26.423 mute=False flag=False   ← ❌ 分段 1 间隙：静音被解除后再置位（闪烁）
04:50:28.502 mute=True  flag=True
...（持续 True）
04:50:59.226 mute=False flag=True    ← ❌ 分段间隙再次捕获过渡态
04:51:01.306 mute=True  flag=True
04:51:05.366 mute=False flag=False   ← 退出免按，恰好解除一次 ✅
04:51:07 起持续 False/False，无再置位 ✅
```

- ✅ 进入免按即 mute=True + flag=True；退出后稳定 False/False（恰好一次解除，无重复置位/解除）。
- 🔴 **立案（本轮唯一新问题）：分段落字间隙系统静音闪烁解除→再置位**。探针在 3 个分段的两个间隙各捕获一次 mute=False（04:50:26 / 04:50:59，采样粒度 2s，实际每个间隙都有 ≥150ms + 转写/落字时长的解除窗口）。代码根因明确：`dictation.ts` finalize L601 每段结束调用 `this.unmute()`（unmuteAfterRecording 删 flag+SetMute(false)），`maybeContinueHandsFree` L764 150ms 后重新 `start("toggle")` 再次 muteForRecording。用户影响：免按连续听写时系统声音在每句话之间短暂漏出（通知音/媒体声），且频繁写盘 flag。建议：免按会话内跨 segment 保持 mute（如 finalize 时若 `handsFree && mode==="toggle"` 则跳过 unmute，仅在真正退出免按处解除）。可复现：每次分段间隙必现（时窗 >150ms）。

## A2 预先手动静音 → 免按 → 退出（#217 语义回归）

- ✅ SetMute(1) 后进免按跑 2 段再退出：全程 23 个采样点均 mute=True、flag=False（**从未创建**）；退出后仍 True 不被反转。

## A3 免按中强杀 → 重启恢复

- ✅ 免按录音中（mute=True flag=True）Stop-Process 强杀 → 残留 mute=True flag=True procs=0 → 重启打包应用就绪后 mute=False、flag 删除（initMuteRecovery 生效）。

## B 回归

- ✅ #221 搜索 trim：History 搜索框输入「明天␣」（尾随空格）命中多条、无「明天」的条目被过滤（旧版零命中可判别）。
- ✅ RightCtrl 中文听写：hold 10s 整句「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」正常落字 Notepad。
- ✅ vadAutoStop OFF 抽查：设置页「Auto-exit on prolonged silence」切 OFF → 免按仍正常分句落字（3 段）、静音不自动退出、Alt+Q 手动退出正常（与 #205 解耦语义一致）；测后还原 ON。

## C 视觉抽查

- ✅ 免按期间悬浮条（波形 + Auto translate chip + 关闭钮）与实时字幕气泡显示正常；任务栏扬声器图标随录音呈静音态。

## 测试者备注（非产品问题）

- 首轮 padded wav 制作 bug（naive 44 字节头假设，sample.wav 实有 LIST chunk 致 data 损坏，maxPeak=0），修正 chunk 解析后重测；该无效轮已剔除。
- 探针采样粒度实测 ~2s（每次 getmute 起子进程 ~1.9s），足以捕获闪烁但无法给出精确闪烁时长；闪烁窗口下限由代码路径（≥150ms + 转写耗时）推定。

## 清场

配置/历史/stats 还原（mwr=False、toggle=Alt+Space、vad=ON、lang=zh、hist=43、stats 122/7089/1018238）；flag 删除；系统 mute=False；failed-audio=0；SpeakType/notepad/node 进程 0；18099/43117/43998 无 LISTENING；防火墙 Domain/Private/Public 全 False（全程未开启）；VB-CABLE 保留；未改产品源码。
