# 第 280 轮体验官报告（独立专项：手机页五语言 / manifest 五口径 / 官网发布链路 / 核心回归）

- 角色：user-experience-officer（第 280 轮追加专项）
- 被测对象：
  - 打包版 `desktop/release/win-unpacked/SpeakType.exe`（main @ 45d8b17 构建，v0.17.0，packaged=true）
  - 线上官方中转 `https://speaktype.zalize.com/relay`（含 `/relay/app`、房间页、manifest）
  - 官网 `https://speaktype.zalize.com` 与 `/zh/`
- 测试日期：2026-09-01 ~ 2026-09-02（UTC）
- 说明：双手机抢占、设置页五语言、手机页房间页五语言主流程、切后台恢复等此前小节已写入 `docs/reviews/round278.md`（分支 review/round278-report），本文件只记录本轮新增专项。

## 结论摘要

- 手机页五语言（/relay/app + 房间页）：通过，无截断、无乱码、无缺翻译。
- PWA manifest 五口径：通过，5 语言 lang/name/description 全部正确（HTTP 200 实测）。
- 官网发布链路：通过。EN/zh 页面视觉与锚点正常，三个下载资产 HEAD 200 且均指向 v0.17.0 Release，README 徽章/下载链接与 v0.17.0 一致。
- 核心回归（RightCtrl 中文落字、Esc 取消）：通过。
- 本轮无新增 P0-P3 立案。

## 1. 手机页五语言走查（实测）

### 1.1 /relay/app 配对页（真实 Chrome 页面 + CDP 抓取 body 文本）

五语言逐一切换 `?lang=en/zh-CN/zh-TW/ja/ko`，抓取全部可见文案（工具：CDP `document.body.innerText`，端口 9446）：

- en: `Not paired with a PC / Connect your PC / Scan QR code / Connect with pair code / Add to home screen / Text lands at your PC cursor on release / Audio passes straight through the relay — never stored`
- zh-CN: `未配对电脑 / 连接你的电脑 / 扫二维码 / 用配对码连接 / 添加到主屏幕 / 松手后文字会落到电脑光标处 / 音频经中转服务器直通，不存储`
- zh-TW: `未配對電腦 / 掃 QR Code / 用配對碼連接 / 加入主畫面 / 鬆手後文字會落到電腦游標處 / 音訊經中繼伺服器直通，不儲存`
- ja: `PC と未ペアリング / QR コードをスキャン / ペアコードで接続 / ホーム画面に追加 / 離すと文字が PC のカーソル位置に入力されます / 音声は中継サーバーを素通しするだけで保存されません`
- ko: `PC와 페어링되지 않음 / QR 코드 스캔 / 페어 코드로 연결 / 홈 화면에 추가 / 손을 떼면 텍스트가 PC 커서 위치에 입력됩니다 / 오디오는 중계 서버를 그대로 통과하며 저장되지 않습니다`

配对输入框 placeholder（zh-CN：`12 位配对码`）与说明段（含 `设置 → 麦克风与音频 → 手机当麦克风` 路径描述）五语言均完整。HTTP 层面五口径均 200，HTML 字节 UTF-8 解码 0 个替换字符（无乱码）。视觉截图（zh-CN 配对页 + ko 房间页）确认无截断。

### 1.2 错误提示

- **实测触发**：zh-CN 配对页输入非法码 `abc` 点击「用配对码连接」，页面显示 `配对码格式不对（12 位字母数字）`，文案完整可理解（CDP 实操 + 截图）。
- **字节/i18n 核验（非实测触发）**：房间被占、麦克风权限被拒、连接断开等其余错误文案，五语言经页面内嵌 i18n 字符串 UTF-8 字节核验齐全且正确；未逐一构造真实触发路径（部分场景已在 round278.md 第 280 轮补测小节实测，如「Another phone is already connected to this room」）。

### 1.3 房间页五语言

房间页 `https://speaktype.zalize.com/relay/m/e2ef509bed86?lang=*` 五口径实测：主按钮「按住说话」（Hold to talk / 按住說話 / 押しながら話す / 눌러서 말하기）与连接状态文案五语言完整、无截断乱码（CDP body 文本 + 截图，详见 round278.md 第 280 轮补测小节，本轮复核一致）。

## 2. PWA manifest 五口径（实测，urllib 直连线上）

`https://speaktype.zalize.com/relay/manifest.webmanifest?lang=<lang>`：

| lang 请求 | HTTP | 返回 lang | name | description（截取） |
|---|---|---|---|---|
| en | 200 | en | SpeakType phone microphone | Hold to talk — text lands at your PC cursor |
| zh-CN | 200 | zh-CN | SpeakType 手机麦克风 | 按住说话，文字落到电脑光标处 |
| zh-TW | 200 | zh-TW | SpeakType 手機麥克風 | 按住說話，文字落到電腦游標處 |
| ja | 200 | ja | SpeakType スマホマイク | 押しながら話すと、文字が PC のカーソル位置に入力されます |
| ko | 200 | ko | SpeakType 폰 마이크 | 누른 채 말하면 텍스트가 PC 커서 위치에 입력됩니다 |

五语言 name/description 全部正确，JSON UTF-8 解码无替换字符。核验方式为 Python urllib 直接请求并写 UTF-8 文件比对，排除控制台编码干扰。

## 3. 官网发布链路核验（实测）

### 3.1 页面走查

- `https://speaktype.zalize.com`（EN）：HTTP 200，HTML UTF-8 无替换字符。浏览器实开走查：hero（You speak, it types. / v0.17.0 is out 横幅）、Features、Engines、Phone mic、Compare 表、Download 四卡（installer/portable/APK/macOS）、FAQ、footer 均正常渲染，无截断错位。
- `https://speaktype.zalize.com/zh/`：同样 200 无乱码，中文页各区块（你说，它写。/ 获取 SpeakType v0.17.0 / 下载四卡）渲染正常；EN↔中文互链正常。
- 锚点核验：导航锚 `#features #engines #phone #compare #download #faq` 在两页 HTML 中均存在对应 `id`（脚本核验 missing=∅），#download 实点跳转正常（截图）。
- 页面链接抽查：GitHub 仓库 / issues / LICENSE / CONTRIBUTING / DISCLAIMER / relay 自部署 / releases/latest 链接均指向预期地址。

### 3.2 下载资产 HEAD（实测）

三资产 URL 均为 `releases/download/v0.17.0/`，HEAD 均 200（跟随重定向至 release-assets.githubusercontent.com）：

| 资产 | HTTP | Content-Length |
|---|---|---|
| SpeakType-Setup-0.17.0.exe | 200 | 103,256,782（~98MB，与页面描述一致） |
| SpeakType-0.17.0-portable.exe | 200 | 91,671,214（~87MB，一致） |
| SpeakType-0.17.0.apk | 200 | 2,494,687 |

### 3.3 README 抽查（实测，main 分支 raw）

- 徽章：License-MIT / Platform-Windows / **Release-v0.17.0** / UI languages-5 / PRs-welcome，Release 徽章 URL HEAD 200，版本与线上一致。
- 下载链接：releases/latest + 三个 v0.17.0 直链，与官网一致。

## 4. 轻量核心回归（实测，打包版）

- RightCtrl 中文落字：按住 8s（fake mic 中文样音），松手后 Notepad 落字「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」，main.log `dictation finalize: durationMs=7875 maxPeak=32758 voicedMs=4040`。通过。
- Esc 取消：按住 RightCtrl 3s 后按 Esc 再松手，Notepad 无任何新落字（光标位置不变），main.log 无新增 finalize 记录。通过。

## 5. 立案

本轮无新增立案（无 P0/P1/P2/P3）。此前立案 280-P3-1（录音中被抢占静默丢语音+按钮卡「Release to finish」）见 round278.md，本轮未涉及。

## 6. 实测证据 vs 源码/字节推断区分

- 实测：/relay/app 与房间页五语言页面文本与截图、zh-CN 非法配对码错误提示触发、manifest 五口径 HTTP 响应、官网两页面浏览器走查与锚点跳转、三资产 HEAD、README raw 抓取、RightCtrl/Esc 回归。
- 字节/i18n 核验（非实测触发）：/relay/app 其余错误文案（房间被占/权限被拒等）仅核验字符串存在与编码正确。
- 源码推断：无（本轮结论均基于线上/本机实测或字节核验）。

## 7. 未测试项

- 真机手机（iOS Safari / Android Chrome）上的 /relay/app 五语言渲染与 PWA 安装横幅。
- APK 实际安装运行（仅核验下载可达与体积）。
- Setup exe / portable 的完整下载与安装冒烟（仅 HEAD）。
- /relay/app 全部错误提示的真实触发矩阵（仅 zh-CN 非法配对码实测）。
- 官网在移动端窄屏下的响应式布局。

## 8. 环境清理

测试完成后退出 SpeakType 打包版、关闭 Notepad（不保存）、关闭手机模拟 Chrome（9444/9446），未改动防火墙/hosts，未提交任何 secrets，设置保持默认（relay 模式为应用默认配置）。

---

# 第 280 轮补充专项（设置页手机麦克风五语言+深浅色 / relay app 五语言复核 / RightCtrl·Alt+Q·Esc 回归）

- 测试日期：2026-09-02（UTC），同环境、同打包版（v0.17.0, packaged=true）
- 本节全部为实测证据（打包版 GUI 截图 + 线上 HTTP 实测），除注明「复用前节证据」处。

## 结论摘要（补充专项）

- 专项 A 设置页「手机当麦克风」区块五语言：通过，无截断、无乱码、术语一致；浅色/深色各抽查通过。
- 专项 B /relay/app 五口径 + manifest zh-TW/ko name：通过。
- 核心回归 RightCtrl 中文、Alt+Q 免按多句、Esc 取消：全部通过。
- 本节无新增 P0-P3 立案。

## A. 设置页「手机当麦克风」区块五语言走查（打包版实测截图）

在打包版设置页逐一切换界面语言，检查语音识别页手机麦克风区块（开关、连接方式下拉、中转地址、二维码、房间 URL、配对码、等待状态）：

| 语言 | 区块标题 | 连接方式选项 | 中转地址标签 | 配对码文案 | QR lang 参数 | 主题 |
|---|---|---|---|---|---|---|
| en | Phone as microphone | LAN direct / Internet relay | Relay server URL | Pairing code | ?lang=en | 浅色 |
| zh-CN | 手机当麦克风 | 局域网直连 / 公网中转 | 中转服务地址 | 配对码（手机 App 里扫码可连接） | ?lang=zh-CN | 浅色 |
| zh-TW | 手機當麥克風 | LAN 直連 / 公網中轉 | 中轉服務地址 | 配對碼（手機 App 內手動輸入即可連線） | ?lang=zh-TW | 浅色 |
| ja | スマホをマイクに | LAN 直接接続 / インターネット中継 | 中継サーバー URL | ペアリングコード（スマホアプリに入力） | ?lang=ja | 浅色 |
| ko | 휴대폰을 마이크로 | LAN 직접 연결 / 인터넷 중계 | 중계 서버 URL | 페어링 코드（휴대폰 앱에 입력） | ?lang=ko | 深色 |

- 五语言均无截断、无乱码；「局域网直连 vs 官方中转」在各语言的说明段与下拉选项术语一致（同一 Wi-Fi 走直连 / 不同网络走中转，默认官方中转可自部署）。
- 二维码在浅色与深色主题下均清晰渲染，房间 URL 的 `?lang=` 跟随界面语言实时切换（实测 zh-TW/ja/ko 截图确认）。
- 深色主题抽查（ko）：文字对比度正常、无背景/文字同色问题；浅色抽查（en/zh-CN/zh-TW/ja）正常。测试后已恢复 English + 跟随系统主题。

## B. /relay/app 五语言口径复核 + manifest zh-TW/ko

- `/relay/app?lang=en/zh-CN/zh-TW/ja/ko` 五口径 HTTP 实测：全部 200，HTML UTF-8 解码替换字符 0（无乱码）。按住说话按钮、连接状态、错误提示文案的可见文本走查见本文件第 1 节与 round278.md 第 280 轮补测小节（本轮 HTTP 层复核一致，页面版本未变）。
- manifest 实测（Python urllib，UTF-8 解码逐字比对）：
  - `?lang=zh-TW` → 200，lang=zh-TW，name=`SpeakType 手機麥克風` ✓
  - `?lang=ko` → 200，lang=ko，name=`SpeakType 폰 마이크` ✓
  - （顺带复核 en/zh-CN/ja 三口径 name 亦全部一致）

## C. 核心回归（打包版 + Notepad 实测）

- RightCtrl 中文落字：按住 8s 松开，Notepad 落字「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」，日志 `dictation finalize durationMs=8689`。通过。
- Alt+Q 免按多句：Alt+Q 开启免按模式后不按任何键持续 22s，fake mic 循环语音被自动分句落字 3 句（每句独立成段），再按 Alt+Q 结束。通过（要求两句，实测三句）。
- Esc 取消：录音 3s 时按 Esc，Notepad 光标位置无任何新增文本（Ln5 Col25 不变），日志无新 finalize 记录。通过。

## D. 证据口径与未测项（补充）

- 实测：设置页五语言/双主题截图、manifest 两口径+五口径逐字比对、/relay/app 五口径 HTTP、RightCtrl/Alt+Q/Esc（Notepad + main.log）。
- 复用前节证据：/relay/app 页面内可见文案与错误提示明细（本轮页面字节未变化，HTTP 复核一致）。
- 未测：设置页五语言 × 双主题全组合（仅按「深浅色各抽查一次」执行）；真机手机端渲染。

## E. 环境清理（补充专项后）

界面语言恢复 English、主题恢复跟随系统；退出 SpeakType 与 Notepad（不保存）；无新增模拟浏览器窗口；未改防火墙/hosts、未提交 secrets、Actions 保持禁用。
