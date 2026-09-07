# 第 123 轮体验官审查报告 —— 专项 e：官网/README/Release × main 一致性复查 + 专项 f：公网中转 relay 链路健康复查

- 审查日期：2026-08-16
- 基线：main@599a419（复用 122 轮 pack:dir 产物打包实测）
- 方法：官网英/中页抓取比对 + Release 资产 HEAD + relay 协议级探测 + 打包应用中转模式 E2E；不改产品代码
- 证据分级：【实测】打包运行时/线上实探；【源码】；【推测】；【未验证】

## 结论总览

**P0=0，P1=0，P2=0，P3=0——零立案；并首次实测补账「公网中转模式」E2E。**

## ① 专项 e：官网/README/Release × 当前 main 一致性（全过）

- **版本一致**【实测】：远端最新 tag v0.15.0 = 官网英/中页 pill = README badge；110 轮后无新发版，无版本漂移。
- **三资产可达**【实测】：Setup/portable/apk 三下载直链 HEAD 全 200（跟随重定向到 release-assets）。
- **官网行为表述与近 12 轮变化不冲突**【实测+源码】：#192（LLM 前缀剥离）/#194/#196/#198（BOM 导出、rewriteTarget）/#200/#201（学词口径）均为内部行为精化；官网自动学词 FAQ（「落字后盯一个输入框、比对差异、学进词典并同步历史、切窗即停、可整体关闭」）逐句仍准确，未过度承诺（未声称任何改动都学，故拒学口径不构成矛盾）；转录 3 小时/TXT/SRT、660MB 模型、页签名（en Speech/General、zh 语音识别/通用）、SenseVoice 0.27s/Parakeet 表述抽查全部在位一致。
- **README 抽查**【实测】：110 轮全量审后无 README 变更（最后一次为 #185），badge/直链/官网链接本轮复验有效。

## ② 专项 f：公网中转 relay 链路健康（全过，并 E2E 补账）

线上 wss（speaktype.zalize.com/relay，官方公共中转）协议级探测【实测】：

| 验点 | 结果 |
| --- | --- |
| 配对页 `GET /relay/m/<room>` | 200，10.9KB，完整手机端 UI（按住说话/配对码引导） |
| `role=desktop` / `role=phone` 建联 | 均 open 成功 |
| 非法 role | HTTP 400 拒连 |
| 缺房间号 | HTTP 404 拒连 |
| peer 上线/离线通知 | desktop 端收到 `{"type":"peer","connected":true/false}` 双向正确 |

**中转模式 E2E 首次实测补账**【实测】：打包应用切 relay 模式（log `remote mic relaying via …/m/277103c94c4e`），模拟手机端经公网中转推 16k PCM——实时字幕逐段推送正确、「今天下午3点开会，预算是5200元」准确落字入历史，与 LAN 模式行为一致。掉线自动重连 + 连败 3 次可见错误为【源码】口径未运行时构造。

- 旧 workers.dev 官方地址自动迁移到新域名【源码】（store.ts migrate）。
- 仍挂账：真实手机浏览器/App 端（本轮为 ws 协议级模拟）。

## ③ 核心回归（全过）

- RightCtrl 中文：「我明天去公园散步」准确落字【实测】。
- Alt+Q 免按："The review and the report are done today." 准确落字【实测】。

## 测毕清场

- SpeakType/notepad/node 进程退出；43117/18099 无监听；无 .part
- speaktype.json、history.json 由 round123-*.bak 整体还原（remote mic 关、模型回 parakeet）
- 官网快照/relay 探测脚本留 review 工作区；用户数据无残留
- 防火墙三 profiles OFF；repo 回 main、工作区干净
