# 第 162 轮体验官审查报告

- 日期：2026-08-17
- 基线：main@0191bf8（含 #249/#250）
- 打包：`npm run pack:dir` 成功（round162\pack.log），产物 0.15.1
- 证据分级：【实测】打包运行时直接证据；【源码】源码检视；【推测】推断；【未验证】未执行

## 音源基建（本轮新增，可复用）

- 本机原只有英文 TTS。本轮用 `Add-WindowsCapability -Online -Name "Language.TextToSpeech~~~<ja-JP|ko-KR|zh-CN>~0.0.1.0"` 装齐日/韩/中语音包，并把 OneCore 语音 token 注册表复制到 `HKLM\SOFTWARE\Microsoft\Speech\Voices\Tokens`（含 WOW6432Node），System.Speech 即可枚举（Haruka 日、Heami 韩、Huihui 中）。
- 生成脚本 round162\maketts2.ps1（按 Culture SelectVoiceByHints + UTF-8 文本文件，避免命令行编码坑）。注意：直接 `SelectVoice(名字)` 对 OneCore 复制来的 token 会报「No matching voice」，须用 SelectVoiceByHints。
- 固定音源：ja.wav「明日は友達と映画を見に行きます。」（4.0s）、ko.wav「내일 친구와 함께 영화를 보러 갑니다.」（4.2s）、zhnum.wav「我们三点半在会议室开会，预算是两千五。」（6.5s）。
- 粤语：Windows 无 zh-HK/粤语 TTS capability，粤语检测仍【未验证】。

## 结论：P0=0，P1=0，P2=0，P3×1

## 专项 ① auto×日/韩检测补测【实测】

- language=auto + sensevoice-small，RightCtrl 分别听写 ja.wav / ko.wav：
  - 韩语全对：「내일 친구와 함께 영화를 보러 갑니다.」逐字命中（韩语正字法本身含空格，输出自然）。
  - 日语语种检测与内容正确，但输出夹杂空格：「明日 は友達と映画を 見に行き ます」。
- 交叉验证：显式 language=ja 再测同一音源，同样夹空格：「明日 は友達と映画を見に行き ます」——与 auto 无关，是日文输出后处理缺失。

### P3-① 立案：日文听写输出夹杂空格

- 现象【实测】：sensevoice 日文识别结果含 token 间空格（「明日 は…行き ます」），auto 与显式 ja 双配置复现；中文输出无空格（模型对汉字原生不加），韩语空格属正字法正常。
- 影响：日文用户每次落字都要手删空格，属可感知的输出质量问题。
- 根因【源码】：localasr.ts worker 仅 `text.trim()`，无 CJK 相邻字符间去空格后处理；日文假名/汉字间的空格未清理。
- 修复建议：对识别结果做「相邻两侧均为 CJK（含假名）字符时移除空格」的后处理（一个 regex，~2 行），或仅在 lang=ja/auto 检出日文时应用。

## 专项 ② Format spoken numbers（中文口语数字转换）开关运行时【实测】全过

选择理由：该开关声称「三点半→3:30、两千五→2500」，从未运行时专审过 ON/OFF 双态真实效果。

- language=zh，听写 zhnum.wav：
  - ON：text=「我们3:30在会议室开会，预算是2500」——三点半→3:30 生效；raw 保留「三点半」原文（raw=「我们三点半在会议室开会，预算是2500。」，2500 为模型原生输出）。
  - OFF：text=「我们三点半在会议室开会，预算是2500」——不再转换，原样保留。
- 开关即时生效无需重启；raw/text 分工正确（raw 存转换前文本）。

## 核心回归【实测】全过

- RightCtrl 中文（language=zh）：「我们明天去公园散步」1/1 全对。
- Alt+Q 英文（language=en）：「The review and the report are done today.」全对落字。

## 环境限制

- 粤语 TTS 无 Windows capability，auto×粤仍【未验证】。
- TTS 合成音非真人声；真手机麦/云端 key/多显示器沿旧挂账【未验证】。

## 清场

- SpeakType/Notepad 进程停、43117/18099 无监听、无 .part、failed-audio 空。
- config/history 由 round162-*.bak 还原（history 321 条）。
- 防火墙三 OFF；repo 回 main，git status 干净。
- 新装 TTS 语音包保留在机（测试基建，供后续轮次复用）。
