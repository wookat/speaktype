# 第 121 轮体验官审查报告 —— 专项 a：转录 × 听写/免按/F8 并发组合 + 专项 d：日志/资源增长与轮转

- 审查日期：2026-08-16
- 基线：main@599a419（含 #202 skill；产品代码与 120 轮 #200/#201 相同）
- 打包：`npm run pack:dir` 全绿（win-unpacked，SpeakType.exe 构建时间 2026-08-16 22:56）
- 方法：打包应用运行时实测（10 分钟长音频转录为并发窗口 + mock LLM 端点 + keybd_event 热键）；不改产品代码
- 证据分级：【实测】打包运行时；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3=0——零立案，观察 ×1（测试摩擦级）。**

## ① 专项 a：转录进行中 × 听写/免按/F8/自动学词并发（四验点全过）

并发窗口：long10min.wav（865.5s 音频，sensevoice 实转约 30s/次），四次转录中分别插入操作，log 时间线为证：

| 并发操作 | 时间线（log） | 结果 |
| --- | --- | --- |
| RightCtrl 中文听写 | transcribe started 22:58:51 → dictation finalize 22:59:17 → transcribe done 22:59:22 | 听写准确落字（含润色路径），转录不中断【实测】 |
| Alt+Q 免按听写 | started 23:00:29 → finalize 23:00:51 → done 23:00:59 | 免按落字正常【实测】 |
| F8 改写选区 | F8 按下于转录中，finalize 23:01:01，选区被 mock 改写结果替换 | 改写正常、目标正确（TARGETWORD→[REWRITTEN len=10]）【实测】 |
| 自动学词结算 | started 23:04:28 → finalize 23:04:50 → **auto-learn 23:04:58.839** → done 23:04:58.997 | 观察窗结算发生在转录完成前 158ms，开慧/域算 学入词典 +2【实测】 |

- 四次转录均 45 segments、内容逐次一致，无听写文本混入转录、无转录段泄漏到落字——状态互不干扰【实测】。
- 转录条目与听写条目在历史中各自独立、时间戳正确【实测】。
- 转录中 ASR 与听写 ASR 共用 sherpa worker 串行排队，听写在转录中仍即时响应（finalize 均正常延迟）【实测+源码】。

观察①（测试摩擦，不立案）：润色开启时落字带 mock 前缀导致按位置手改脚本错位，属测试基建问题；关闭前缀模式后学词按预期工作。产品侧无异常。

## ② 专项 d：日志/历史膨胀与轮转（全过）

- **日志轮转存在且生效**【实测】：electron-log 5.4.3 默认 `maxSize=1MB`（未被产品覆盖，源码无自定义）。将 main.log 充填至 1,103,095B 后启动应用 → 首次写入即轮转：`main.old.log`（1,103,095B 原样归档）+ 新 `main.log`（241B）。仅保留一代旧档，磁盘占用上界约 2MB，无无限膨胀风险。
- **历史有硬上限**【源码+实测】：`addHistory` 落库即 `slice(0, 500)`（store.ts），500 条含万字长条目场景 108 轮已运行时验证；本机 321 条 history.json 仅 100KB。
- **配置/历史分仓**【源码】：高频大体积历史与配置分开存储，改设置不重写历史，损坏互不陪葬（108 轮自愈已验证）。
- 资源快照【实测】：多轮转录+听写后 SpeakType 进程组 RAM 933MB（sensevoice 模型驻留），与 117 轮 soak 无泄漏结论一致量级；AppData 总 1.25GB 主要为模型文件，数据文件（json/log）合计 <1.3MB。
- keepFailedAudio 默认关闭，无失败音频堆积路径【源码】。

## ③ 核心回归（全过）

- RightCtrl 中文含 ITN：「今天下午3点开会，预算是5200元」准确落字【实测】。
- Alt+Q 免按：en2.wav → "The review and the report are done today." 准确落字【实测】。

## 环境限制（如实挂账）

- 本轮转录单次仅约 30s（sensevoice 对 10min 音频的实转速度），并发窗口有限但四类操作均落在窗口内，时间线以 log 毫秒级为证。
- 真手机麦/云端 key、多显示器分辨率专项仍挂账。

## 测毕清场

- SpeakType/notepad/mock node 进程退出；18099/43117 无监听；无 .part
- speaktype.json、history.json 由 round121-*.bak 整体还原（词典清空、polish 关、模型回 parakeet）
- main.old.log/充填日志删除、transcribe-last.json 删除、测试音频删除
- 防火墙三 profiles OFF；repo 回 main、工作区干净
