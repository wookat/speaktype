# 第 161 轮体验官审查报告

- 日期：2026-08-17
- 基线：main@c9dbd08（含 #247 识别语言「自动检测」、#249 Parakeet 禁用态语言下拉真实语义、#248/#250 skill、v0.15.1 发布与官网/README 升版）
- 打包：`npm run pack:dir` 成功（round161\pack.log），打包产物自报版本 0.15.1（main.log「SpeakType 0.15.1 starting (packaged=true)」）
- 证据分级：【实测】打包运行时直接证据；【源码】源码/产物检视；【推测】推断；【未验证】未执行

## 选题理由

1. **专项 ① 免按 + auto 语言组合**：#247 引入 auto 后，免按（Alt+Q）多句连续会话 × 语言自动检测的组合从未运行时专审——同一会话内中英切换是否各自识别正确、按句分段是否正常，是 auto 最容易暴露问题的真实场景。
2. **专项 ② 官网/README × #247/#249 新语义一致性**：v0.15.1 刚发布且 #247/#249 改变了设置 UI 语义，官网双语页/README 的版本链接、下载资产可达性、模型语言能力表述需与新 UI 口径对齐抽查。

## 结论：P0=0，P1=0，P2=0，P3=0——零立案

## 专项 ① 免按 + auto 语言组合【实测】全过

- 设置 language=auto（sensevoice-small，Ready），一次 Alt+Q 会话内播放拼接音源 mix.wav（zh 句 + 3s 静音 + en 句，8.06s，round161\mix.wav / hfmix.ps1）：
  - 按句正确分两条入历史：「我们明天去公园散步」（中文原样）+ “The review and the report are done today.”（英文原样）——同会话中英各自识别全对，无互相污染。
  - 两句均落字到 Notepad 光标处（截图 round161\hf-auto-notepad.png：`我们明天去公园散步 The review and the report are done today.`）。
  - log 两次 finalize（voicedMs=1540/1680）+ 会话退出空段 finalize（maxPeak=0），无异常。
- Alt+Q 进入/退出正常，会话内切语言无需重启 worker。

## 专项 ② 官网/README × 新语义一致性 全过

- 版本一致性【源码+实测】：docs/index.html 与 docs/zh/index.html 全部下载链接/标题升至 v0.15.1（APK 仍 0.15.0 与 release 说明一致）；README badge/下载表同为 v0.15.1；打包产物自报 0.15.1 与官网一致。
- 资产可达【实测】：Setup-0.15.1.exe / 0.15.1-portable.exe / 0.15.0.apk 三个 release 资产 HEAD 均 200。
- Parakeet 语义一致【实测+源码】：官网双语页第 137 行表述「Parakeet TDT 0.6B v3 for top English + 25 European language accuracy」（zh 页同义）与 #249 设置页禁用态固定显示「Auto (English + 25 European languages)」逐字口径一致；打包运行时实拍：选 parakeet 后语言下拉禁用并固定显示该文案 + hint 说明中日韩粤需切回 sensevoice，Force Simplified Chinese 行随之隐藏；切回 sensevoice 后 language=auto 原值保留、下拉恢复六项（Auto detect/中文/English/日/韩/粤）。
- README 引擎表述与 auto 不冲突【源码】：README 未对识别语言下拉做具体断言，无过期描述。

## 核心回归【实测】全过

- RightCtrl 中文（先设 language=zh，UI 下拉切换即写盘 zh）：「我们明天去公园散步」1/1 全对。
- Alt+Q 英文：已由专项 ① auto 会话覆盖（“The review and the report are done today.” 全对落字）。

## 环境限制

- 真实人声/真麦克风仍为 TTS+虚拟声卡链路；真手机麦/云端 key/多显示器沿旧挂账【未验证】。
- auto 下日/韩/粤语料本机无 TTS 音源，auto 对这三语的检测未验证【未验证】。

## 清场

- SpeakType/Notepad 进程停、43117/18099 无监听、无 .part、failed-audio 空。
- config/history 由 round161-config.bak / round161-history.bak 还原（history 321 条，language 还原原值）。
- 防火墙 Domain/Private/Public 全 False；repo 回 main，git status 干净。
