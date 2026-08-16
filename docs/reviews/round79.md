# 第 79 轮专项报告 — 转录页容器解码矩阵 + 3 小时上限路径

- 基线：main @ `76d7c68`（含 #146 完成瞬间占位/dark 横幅、#147 skill）
- 构建：`npm run pack:dir` 全绿，实测均为打包版 `release\win-unpacked\SpeakType.exe`
- 工具：本机 ffmpeg 8.1.2 从 70s 中文 wav 转出五种真实容器；`-stream_loop` 拼 3.008h（331MB）与 2.983h（328MB）wav
- 口径：【实测】= 打包运行时实证；【未验证】= 如实标注

## 结论

| 级别 | 数量 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

## ① 解码矩阵【实测】全过

| 格式 | 结果 |
|---|---|
| mp3 | ✅ 解码+4 段中文+时间戳单调 |
| m4a (aac) | ✅ |
| ogg (opus) | ✅（切点比 wav 基准晚 ~2s，opus 填充所致，单调、文本正确，非缺陷） |
| mp4（黑视频+aac 音轨） | ✅ 正确抽出音轨；SRT 抽查 4 块合法，end=00:01:09,615 |
| webm (opus) | ✅ |

## ② 3 小时上限路径【实测】全过

- 3h01（331MB）→ 解码约 3s 后红条「File exceeds the 3-hour limit — please split it first.」，无 crash、log 无 started、UI 可继续用。
- 2h59m 边界 → 正常开始转写（log started 10740.0s、进度 1%→5%、26 段实时推送）→ Cancel 即停、42 段保留、log 无 done。
- 328MB 文件 decode 约 5-8s，Loader 期间非卡死。

## ③ busy 防重入【实测】过

- running 中点击拖放区无文件选择器弹出、进度不受扰。OS 级真实拖拽受自动化限制未做【未验证】，但 onDrop 与点击同走 handleFile 首行 busy return 且拖放区 busy 时 pointer-events-none，属同一守卫【源码】。

## 清场

- 660MB+ 大文件全删（free 69.5GB）；settings/history 还原；进程 0；43117 无监听；.part 0；防火墙三 profile OFF 全程未开启；产品代码零改动。

证据文件（测试机本地）：`C:\Users\Administrator\round79-evidence.md`；截图 `ss_22117cb1/65ef07c5/b6becec5/2d94e635/755345c4/677ca5fa/c9569bf9/d4986299/02d4ca06.png`。
