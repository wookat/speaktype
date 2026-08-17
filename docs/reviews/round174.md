# SpeakType 第 174 轮严格体验报告

- 日期：2026-08-17
- 基线：main `e64172f`（含 #263 Test connection 网络层错误映射为可行动文案）
- 构建：`desktop/` 下 `npm ci`（0 vulnerabilities）+ `npm run pack:dir`，实测对象为打包版 `release/win-unpacked/SpeakType.exe`（v0.15.1，Electron 43.3.0）【实测】
- 运行方式：打包版 + `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<wav>`（16 kHz 单声道 TTS 固定语料），目标窗口为系统记事本【实测】
- 证据分级：【实测】打包版真实运行验证；【源码】仅读代码；【推测】未直接验证的推断；【未验证】本轮未覆盖

## 结论速览

| 级别 | 数量 |
| ---- | ---- |
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

本轮零立案。#263 五语言网络错误文案回归 5/5 通过；设置页 5 语言 UI 走查（en/zh-CN/zh-TW/ja/ko）未发现溢出/未翻译/插值损坏；按应用自动切人设规则 notepad 正反向真实命中均通过；中英核心回归全过。

## 1. #263 回归抽验（Test connection 网络错误文案，5 语言）

复现路径：Settings → 语音识别服务 → Provider 选 OpenAI-compatible → Base URL 填不可达地址 `http://127.0.0.1:9/v1` → 任意 key → Test connection。上轮此处报原始「Failed: fetch failed」。

本轮五个 UI 语言下实测结果（同一不可达地址）：

| 语言 | 实测文案 | 截图 |
| ---- | ---- | ---- |
| en | Failed: could not reach the server — check the Base URL and your network connection | ss_36f3feeb |
| zh-CN | 连接失败：无法连接服务器——请检查 Base URL 与网络连接 | ss_zoom_78844b60 |
| zh-TW | 連線失敗：無法連線伺服器——請檢查 Base URL 與網路連線 | ss_f84fb70f |
| ja | 失敗: サーバーに接続できません。Base URL とネットワーク接続を確認してください | ss_zoom_6fd2df95 |
| ko | 실패: 서버에 연결할 수 없습니다. Base URL과 네트워크 연결을 확인하세요 | ss_zoom_d396cd09 |

5/5 通过，原始 undici 错误串不再出现【实测】。`humanTestError` 仅匹配网络层错误模式（fetch failed/ENOTFOUND/ETIMEDOUT/ECONN 等），401 等业务错误仍原样透传（保留上轮验证过的脱敏 401 明细）【源码】`desktop/src/renderer/src/lib/testError.ts`。

设计评价：修复方式（渲染层统一映射 + 五语言词条）是最小且正确的落点，与 Wispr Flow 断网提示行为一致。无进一步建议。

## 2. 专项 1：设置页 5 语言 UI 走查（en/zh-CN/zh-TW/ja/ko）

方法：General → 界面语言下拉逐个切换五种语言，每种语言走查 通用 / 语音识别 / AI 润色 / 关于 四个 tab，观察文字溢出、未翻译残留、插值损坏、控件被截断。

- 语言切换即时全量生效，无需重启，侧边栏/首页/设置页同步切换【实测】。
- en（ss_19019f34、ss_36f3feeb）、zh-CN（ss_15efdb41、ss_68cc9fc1、ss_4e38ec36）、zh-TW（ss_85605070、ss_f84fb70f、ss_48b2a515）、ja（ss_50b775e4、ss_2da657e6、ss_11009d90、ss_7726a783）、ko（ss_df9aba68、ss_66044a60、ss_23f0b0c1、ss_3fde86dd）四 tab 均无溢出、无英文/中文残留、无 `{xxx}` 插值裸露、无控件截断【实测】。
- 「格式化口语数字（中文）」示例插值（三点半 → 3:30 等）在五语言下均正常渲染【实测】。
- 关于页版本号 v0.15.1 与提交号在各语言下显示一致【实测】。
- 长文案语言（ja/ko）在识别服务商下拉与模型说明段落处最接近容器边缘，但均完整换行未截断【实测】。

未发现问题，零立案。

## 3. 专项 2：按应用自动切人设规则（notepad 真实命中）

规则配置：人设页 → 按应用自动切人设 → 添加规则 → 匹配串 `notepad` → 人设「面对老板」，写入 `settings.appPersonas = [{match:"notepad", personaId:"boss"}]`（配置文件核实）【实测】。

- 正向命中：前台切到记事本，按住 RightCtrl → 字幕悬浮条左侧出现「面对老板」徽标 + 实时字幕（截图 ss_c0caa45b），松开后中文完整落入记事本（截图 ss_0d506eff）【实测】通过。
- 反向验证：前台切到 Microsoft Edge（不匹配任何规则），按住 RightCtrl → 悬浮条正常出现但无人设徽标（截图 ss_b295cd80）【实测】通过。
- 命中时机在按键起手时读取前台窗口（录完再读窗口已切走），匹配为进程名+窗口标题子串、不区分大小写、先命中先用【源码】`desktop/src/main/activeapp.ts` `personaForActiveApp`、`dictation.ts`。
- 未配置 AI 润色时页面出现琥珀色提示「规则只在配置了 AI 润色模型后生效…」并附「去配置 AI 润色」跳转【实测】——提示与跳转俱全，可操作性好。

设计评价（不立案的观察）：未配置润色时徽标仍会显示（徽标含义是"命中了规则"而非"已按人设润色"），配合页面警告尚可接受；若想更精确，可在未配置润色时给徽标加灰显/tooltip。竞品对照：Wispr Flow 的 per-app tone 同样以前台应用为准、按键起手采样，SpeakType 的实现方式一致且开销更低。

## 4. 核心回归（必做）

- 中文：识别语言 = 中文，记事本聚焦，按住 RightCtrl 8 秒 → 录音中悬浮条实时字幕逐字出现（ss_c0caa45b）→ 松开后「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」完整落入记事本（Ln 1, Col 29，ss_0d506eff）【实测】通过。
- 英文：换英文语料重启打包版，识别语言 = English → 「Please schedule the design review for tomorrow morning and send the report to the whole team.」落入记事本（Ln 1, Col 94，ss_0302fcc4），首字母大写、句号正常【实测】通过。

## 5. 本轮未覆盖

- F8 改写链路（需 polish 模型就绪，建议单独一轮配合本地 LLM 验证）、多显示器窗口记忆、字幕悬浮条多窗口边界【未验证】。
- 人设规则的多规则优先级（先命中先用）与规则输入框的 running-apps 下拉建议本轮只配了单规则，多规则冲突行为【源码】有定义但【未验证】。
- 配置了 AI 润色后规则真实改写落字内容（本轮未配置润色模型)【未验证】。

## 6. 清场记录

- SpeakType 全部进程结束（0 残留）；记事本/Edge 关闭。
- `speaktype.json` 还原：language=zh、uiLanguage=zh-CN、asrProvider=local、asrBaseUrl/asrApiKey/asrModel 清空、appPersonas 清空（脚本核实输出 rules=0）。
- models 目录无 `.part`/`.part.json` 残留；HKCU Run 无 SpeakType 值；Windows 防火墙三档保持 OFF。
- `git status` 干净（本报告在独立分支 review/round174-report，未动 main，不开 PR）。
