# 第 70 轮体验官审查报告

- 基线：main @ 562d153（含 #130/#131）win-unpacked 自打包
- 角度：观察项论证、History 500 条满载专项、Persona/F8 改写 mock 端点路径、统计口径抽查、核心回归
- 证据：`C:\Users\Administrator\round70-evidence.md`

## 结论：全 🟢，无新 P0-P3 立案

| 项 | 结果 |
| --- | --- |
| History 500 条满载：分页恰 50/页（Show more 450→400 remaining）、滚动顺滑 | 🟢 |
| 搜索+导出组合：uniqueXYZ 恰 3 条 → 导出仅含该 3 条、failed 条目已过滤 | 🟢 |
| 失败条目 Retry：重识别成功、toast+条目原地转正、status/audioFile 清除、落盘 wav 删除 | 🟢 |
| Persona 热键 Alt+1/2 toast；F8 改写（mock LLM）选区替换成功、请求含选区+指令 | 🟢 |
| F8 未配置：toast「Rewrite needs a polish model」+ 自动直达 Settings→AI model | 🟢 |
| 统计口径：Sessions 严格按 finalize +1（124→127→128）、Words 按落字词数（中 +69≈3×23 字、英 +17 词）、Time saved 单调 | 🟢 |
| 核心回归：RightCtrl 中英 + Alt+Q 一轮 | 🟢 |

## 观察项复核（不立案）

损坏/缺失态引导条正文维持「One-time download (~660MB)」句式：用户行动点是按钮，#128/#130 后按钮已增量口径（Resume x% done），round67 立案动机「用户不敢点」的载体已解决；正文承担全新用户「离线/一次性成本」卖点职责，为罕见态单独做五语×两态增量正文成本/收益比差。将来若做，正确形态是 percent!=null 时切「Model files incomplete — resume to repair (~xMB left)」类句式。

## 遗留/边界（非本轮立案）

- muteWhileRecording 需真声卡；真手机麦需真机。

## 清场

双模型 SHA 核对一致、配置/历史恢复原件、mock 进程与端口清、无 .part、进程 0、防火墙三 profile OFF。
