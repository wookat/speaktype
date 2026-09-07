# 第 277 轮体验官报告（user-experience-officer + qa-engineer）

- 日期：2026-08-31
- 版本：v0.17.0（packaged=true，`npm run pack:dir` 产物 `desktop/release/win-unpacked/SpeakType.exe`）
- 环境：Windows Server 2022，Node 24.0.1，Chrome for Testing 137（fake mic：`--use-fake-device-for-media-stream` + `--use-file-for-fake-audio-capture`，中文 TTS WAV「帮我跟老板说那个方案需要再改一下明天上午之前给他答复」）
- 语言/模型：`settings.language=zh`，`sensevoice-small`（本地离线）
- 结论：**零 P0 / 零 P1 / 零 P2，2 项 P3**。手机麦克风中转链路（LAN 直连 + 官方中转 https://speaktype.zalize.com/relay ）两条路径全部实测打通，落字、刷新重连、重启配对码保持、PWA 资源、错误文案均健康。

## 1. 构建（实测）

| 步骤 | 结果 |
|---|---|
| `npm install`（desktop/，Node 24.0.1） | 通过 |
| `npm run typecheck` | 通过，0 错误 |
| `npm run build` | 通过 |
| `npm run pack:dir` | 通过，win-unpacked 可运行，日志 `SpeakType 0.17.0 starting (packaged=true)` |

## 2. 核心链路回归（实测，打包版 + Notepad 落字）

| 用例 | 结果 | 证据 |
|---|---|---|
| RightCtrl 按住说话 → 中文落字 | 通过：「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」完整落入 Notepad，含标点 | 截图 ss_2184221b |
| Alt+Q 免按模式多句 | 通过：三句连续落字，退出时出现 hands-free ended toast | 截图 ss_55a8e9cb |
| Esc 取消 | 通过：录音中按 Esc，Notepad 保持空白，无残留落字 | 截图 ss_85763637 |

## 3. 主专项：手机麦克风中转链路（实测）

模拟手机 = 独立 Chrome for Testing 实例（独立 profile、420px 窗口、fake mic）。真实手机/真实麦克风/相机扫码本机无设备，见「未测试项」。

### ① 配对（两条路径都验）

- **LAN 直连**：设置 → Speech → Phone as microphone 开启后展示 QR + `https://172.16.14.2:43117/?t=<token>`。手机窗口（`--ignore-certificate-errors`，LAN 自签证书）打开该 URL 直接进入按住说话页，显示 "Connected to your PC"，桌面端显示 "1 device(s) connected"。
- **官方中转 + 手输 12 位配对码**：桌面切到 Internet relay（Relay URL 默认 `https://speaktype.zalize.com/relay`），展示 12 位十六进制配对码 `f4521dd7a1e0` 与 `/relay/m/<code>?lang=en` QR。手机窗口（**不带** `--ignore-certificate-errors`，真实 TLS 链）打开 `/relay/app` 配对页，手输配对码 → "Connected to your PC"。桌面端同步显示已连接。
- 配对码格式校验实测：输入 `zzz` → "Invalid pair code (12 letters/digits)"，可行动。

### ② 手机按住说话 → 电脑光标落字

- LAN 直连：按住 9s（fake mic 中文 WAV）→ 松手 → Notepad 落字「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」，手机页同步显示识别文本。证据：截图 ss_738ee14a、剪贴板核对。
- 官方中转：同一句经 relay 路径落字成功，字节级一致。证据：截图 ss_79cc8256、剪贴板核对。

### ③ 刷新自动重连

- LAN 页 `location.reload()` 后自动回到 "Connected to your PC"（token 在 URL 里）。
- relay `/app` 页刷新后从 `localStorage['speaktype-room']=f4521dd7a1e0` 自动重连成功。

### ④ 配对码重启后不变

- 经托盘菜单 Quit 正常退出 → 重新启动打包版：`speaktype.json` 中 `remoteRelayRoom` 仍为 `f4521dd7a1e0`，设置页展示同一配对码与 QR，手机页**无需任何操作**自动恢复 "Connected to your PC"。证据：截图 ss_2f12bafe。

### ⑤ PWA 健康检查

- `/relay/manifest.webmanifest` 200，application/manifest+json，`start_url:/relay/app`、`scope:/relay/`、standalone、192/512 图标齐全。
- `/relay/sw.js` 200（1049B），service worker 实际注册成功（scope `https://speaktype.zalize.com/relay/`）。
- `/relay/icon-192.png`（2132B）、`/relay/icon-512.png`（6111B）、`/relay/health`→ok 均 200。
- 页面含 "Add to home screen" 入口、apple-touch-icon/apple-mobile-web-app meta 齐全。真实安装到手机主屏幕未测（无移动设备）。

### ⑥ 断网 / 中转不可达报错

- **桌面退出（=电脑离线）**：relay 手机页 → "Connected to relay, waiting for your PC…"（准确可行动）；LAN 手机页 → "Pairing expired — scan the QR code on your PC again"（LAN token 每次启动轮换，提示重扫是正确动作）。
- **中转不可达（桌面侧）**：Relay URL 改为 `https://127.0.0.1:9/relay` → 设置页立即显示红字 "Can't reach the relay server — check the relay URL and your network. Still retrying…"，明确指出检查 URL 与网络且持续重试；恢复官方 URL 后自动回到 "1 device(s) connected"。证据：截图 ss_7d389c0b。
- 手机页真实断网（飞行模式）无法在本机模拟，未测。

## 4. 副专项：历史页来源筛选与手机来源标识（实测 + 源码佐证）

- 实测：History 页现有 6 条记录（本机麦克风 RightCtrl/Alt+Q 与手机 LAN/relay 听写混排），每条只显示「时间 · 人设 · 时长 · Local offline」；**手机来源条目与本机麦克风条目视觉完全不可区分**，页头只有 Search/Export/Clear all，**没有任何来源筛选控件**。证据：截图 ss_b4e77d21。
- 源码佐证：`desktop/src/shared/types.ts` HistoryEntry 的 `source?: "file"` 只区分文件转录，听写条目不记录 mic/phone 来源，属数据层缺口（要做筛选需先补 source 字段）。

## 5. 立案项

### 277-P3-1 历史页无来源筛选，手机听写条目无来源标识
- 复现：手机中转落字一句 + 本机 RightCtrl 落字一句 → 打开 History。
- 现象：两条目外观完全一致，无「手机」徽标，也无来源筛选器。
- 证据：实测截图 ss_b4e77d21；源码 `types.ts` `source?: "file"`。
- 影响面：多设备用户无法回溯哪句来自手机；隐私/纠错场景（手机在他人手里误触）无法定位来源。
- 建议：HistoryEntry.source 扩展为 `"file" | "phone"`（未设=本机麦克风），手机链路写入时标记，History 页加来源 chip + 筛选下拉。

### 277-P3-2 relay manifest 无 lang 参数时默认 zh-CN
- 复现：`curl https://speaktype.zalize.com/relay/manifest.webmanifest`（不带 `?lang=`）。
- 现象：返回 `"name":"SpeakType 手机麦克风","lang":"zh-CN"`；`relay/src/phone.ts` `manifest()` 的 fallback 是 `?? "zh-CN"`。
- 影响面：极小——页面脚本总会把 manifest link 重写为带 `?lang=` 的 URL，只有绕过页面直接抓取才会遇到；但英文用户如果浏览器在脚本执行前抓 manifest，理论上可能装到中文名 PWA。
- 建议：fallback 改为 "en"，或按 Accept-Language 协商。

## 6. 实测 vs 源码推断

- 实测：第 1–4 节全部结论、277-P3-1 的页面表现、277-P3-2 的 HTTP 响应。
- 源码推断（未实测）：LAN token 每次启动轮换的机制（`remotemic.ts`）；relay Durable Object 的同房间顶替策略（`relay/src/index.ts`，本轮未做双手机抢占实测）。

## 7. 未测试项（如实标注）

- 真实手机（iOS/Android 浏览器、真实相机扫码配对）：无设备，untested。
- 真实麦克风采集：无音频输入设备，用 fake mic WAV 替代，untested。
- PWA 实际「添加到主屏幕」安装与 standalone 启动：桌面浏览器无移动安装流程，仅验证 manifest/sw/图标/入口按钮，untested。
- 手机端真实断网（飞行模式/弱网）：本机无法模拟且规则禁改防火墙/hosts，untested。
- 双手机同房间抢占、Android 原生 App（android/）：untested。
- 设置页五语言文案走查（副专项②未选）：untested。

## 8. 测试后清理

- 托盘 Quit 正常退出 SpeakType（未强杀子进程）；关闭两个模拟手机 Chrome 实例；删除临时 profile/脚本/剪贴板文件；`%APPDATA%\SpeakType` 配置中 Relay URL 已恢复官方默认。未修改任何产品代码。
