# macOS 第 1 轮：真机构建 / 安装 / 核心闭环验证报告

- 基线：main @ `c740374`；分支 `devin/1788431756-macos-build`
- 机器：**Apple Silicon 虚拟机**（`uname -a` 含 `RELEASE_ARM64_VMAPPLE`），macOS 26.5.2 (25F84)，Xcode 26.6，Node v24.19.0。**不是物理 Mac**：没有真实麦克风、没有物理键盘，Gatekeeper/TCC 行为与物理机一致，但音频与键盘均为注入。
- 方法：源码 dev 探针 → 修 darwin 路径 bug → `npm run pack:mac` 打包 → 安装 arm64 dmg 到 `/Applications` → 打包版 + 假麦克风 + 合成按键做 GUI E2E（全程录屏）。
- 录屏：`/Users/devin/screencasts/speaktype-mac-e2e/speaktype-mac-e2e-clean.mp4`（约 26 分钟，含 annotate）；截图目录 `/Users/devin/screenshots/`（下文 `ss_*.png`）。
- 逐项标记：**✅ 实测通过** / **🔧 实测失败已修** / **⚠️ 未测（原因）**。

## 一、前一会话静态审计结论的真机核对

| # | 静态结论 | 真机结果 |
|---|---|---|
| 1 | lockfile 含 `sherpa-onnx-darwin-arm64/x64@1.13.4`，整目录 asarUnpack 即可加载 | ✅ 打包版 main.log：`sherpa worker started (sensevoice-small)`；`app.asar.unpacked/node_modules/` 只有 `koffi sherpa-onnx-darwin-arm64 sherpa-onnx-node uiohook-napi` |
| 2 | 1.13.4 的 `libonnxruntime.dylib` minos=15.5 | ✅ `otool -l` 核对为 15.5；`minimumSystemVersion: "15.5"` 写进 Info.plist，README/官网写明 macOS 15.5+；未升 1.13.7 |
| 3 | whisper.cpp 上游无 mac 二进制 | ✅ 核对 whisper.cpp releases 页面：只有 Windows/Ubuntu 二进制与 xcframework → 选方案「mac 隐藏 whisper，只留 SenseVoice/Parakeet」（ss_5cb2a4b9.png 模型列表只有 2 项） |
| 4 | VAD 可放开 darwin | ✅ arm64 探针：sherpa Silero VAD 加载并推理，对假 wav 输出 `windows 183 speech windows 170`（能区分有声/无声窗）；x64 仅包内含 `.node`，**未运行** |
| 5a | uiohook 无权限时 `start()` 抛异常中断 whenReady 链 | 🔧 已修：`startHotkeys()` 先 `isTrustedAccessibilityClient(false)`，未授权 → 对话框 + 跳系统设置 + 2s 轮询；`hotkeys.start()` 包 try/catch，失败 `dialog.showErrorBox` 不中断启动 |
| 5b | PCM_PIPE 硬编码 Windows 命名管道 | 🔧 已修：darwin 用 `tmpdir()/speaktype-pcm-<pid>.sock`，启动前 `rmSync` 残留、`server.on("error")`、`before-quit` 清理；打包版 `dictation finalize: durationMs=8902 maxPeak=32762 voicedMs=5260` 证明 recorder→main 帧传输可用 |
| 5c | 默认热键 RightCtrl 在 MacBook 不存在 | 🔧 已改：darwin 新用户默认 `RightAlt`（右 Option）。论证：MacBook/Magic Keyboard 无右 Ctrl；右 Option 单按无系统功能；Fn/🌐 键在 macOS 默认绑定切换输入法/表情（系统设置可见，未实测 uiohook 对它的事件），故不选。Electron 探针收到 `keycode 3640`（AltRight）的 keydown/keyup |
| 5d | extraResources 会把 Windows whisper DLL 带进 mac 包 | 🔧 已修：`extraResources` 移到 `win:` 段；mac 包 `Contents/Resources/` 无 `whisper/` |

## 二、平台适配层逐文件（darwin 路径）

| 文件 | 结果 |
|---|---|
| `hotkey.ts` | ✅ 右 Option 长按/释放状态机闭环（ss_5f9f4a45.png）。🔧 Option+Q 纯旁听时前台 TextEdit 收到 `Œ`（实测失败）→ 改为 darwin 上组合键走 Electron `globalShortcut`（Option+Q / Option+1…9），复测 TextEdit 无 `œ/Œ`（ss_3d3a0f4e.png）。单个修饰键长按仍走 uiohook |
| `paste.ts` | ✅ osascript ⌘V 落字到 TextEdit 光标处；首次触发 Apple Events 授权弹窗后允许 |
| `activeapp.ts` | ✅ darwin 分支（osascript 前台 App 缓存、`hasPasteTarget` 恒 true）在整条落字链路中无异常；⚠️ 按 App 切人设规则未单独测 |
| `dictation.ts` | ✅ darwin 快捷 return 不影响主流程；finalize/识别/落字完整 |
| `vad.ts` | ✅ 见上表 #4 |
| `mute.ts` | ⚠️ 未测：VM 无音频输出设备，osascript 设音量无法观察效果 |
| `escblock.ts` / `watchedit.ts` | ✅ win32 守卫生效，darwin 不加载、无异常；功能本身 mac 不可用（已写入已知限制） |
| `index.ts` 权限引导 | ✅ `tccutil reset All com.speaktype.desktop` 后重启：出现辅助功能引导对话框（ss_d4a3d8f6.png）→ 点「打开系统设置」跳到 Accessibility（ss_0dc8b6b1.png）→ 开关授权（ss_1a5a0a72.png）→ ~2s 后日志 `accessibility granted; starting global hotkeys`，无需重启 |

## 三、构建与打包

命令：`cd desktop && npm install && npm run typecheck && npm run build && npm run pack:mac`（Node 24.19.0）

| 项 | 结果 |
|---|---|
| `npm install` | ✅（npm audit 报 1 moderate 1 high，本轮未处理、未升依赖） |
| `npm run typecheck` | ✅ 0 错误 |
| `npm run build` | ✅ |
| lint | ⚠️ 仓库 `desktop/package.json` 与根 `package.json` 均无 lint 脚本，只有 typecheck，如实记录 |
| `npm run pack:mac` | ✅ 退出码 0；构建阶段有 1 条无关 warning `Cannot find base config file "./.wxt/tsconfig.json"`（根目录 Chrome 扩展项目未 `npm install`，与 desktop 无关，基线亦存在） |
| arm64 dmg/zip | ✅ `SpeakType-0.17.0-mac-arm64.dmg`（113 MB）/ `.zip`（123 MB），主程序 `Mach-O 64-bit executable arm64`，含 `sherpa-onnx-darwin-arm64`、`koffi/darwin_arm64`，不含 x64 与 whisper |
| x64 dmg/zip（交叉） | ✅ 打包成功：`SpeakType-0.17.0-mac-x64.dmg`（119 MB）/ `.zip`（131 MB），主程序 `x86_64`，含 `sherpa-onnx-darwin-x64`、`koffi/darwin_x64`；前提是手动把 `sherpa-onnx-darwin-x64@1.13.4` 放进 `node_modules`（见 docs/macos.md）。⚠️ **未在 Intel 机器运行** |
| 签名 | ✅ `codesign -dv`：`Signature=adhoc`、`flags=0x10002(adhoc,runtime)`、`TeamIdentifier=not set`；entitlements 5 项（audio-input / apple-events / allow-jit / allow-unsigned-executable-memory / disable-library-validation）实际生效 |
| Windows 包不受影响 | ✅ 主配置 `files` 排除 `sherpa-onnx-darwin-*` 与 koffi darwin，mac 配置按 `${arch}` 回加；`electron-builder.yml` 的 win 段保持 whisper extraResources。⚠️ 本机为 macOS，`npm run pack`（Windows NSIS）未实跑，只跑了共用的 `npm run build` |

## 四、安装与 GUI E2E（打包版 `/Applications/SpeakType.app`）

| # | 场景 | 结果 | 证据 |
|---|---|---|---|
| 1 | dmg 挂载 → 拖到 /Applications → Finder 双击 | ✅ Gatekeeper 拦截提示如预期 | ss_2a78dd41.png |
| 1b | Finder 右键「打开」绕过 | ❌ macOS 26 上**不能**绕过（仍提示未打开）；「隐私与安全性 → 仍要打开」需管理员密码；`xattr -d com.apple.quarantine` 成功 → 文档以 xattr 为主 | 录屏 |
| 2 | 辅助功能引导 → 系统设置 → 授权 → 热键自动启用 | ✅ | ss_d4a3d8f6 / ss_0dc8b6b1 / ss_1a5a0a72 |
| 2b | 麦克风首次授权弹窗 | ⚠️ 未测：VM 无麦克风，测试用 `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` 跳过了系统 TCC 弹窗 |
| 2c | Apple Events（自动化）授权 | ✅ 首次启动即弹「控制 System Events」，允许后落字正常 | 录屏 |
| 3 | 下载 SenseVoice 模型 | ✅ 设置页下载完成，`sherpa worker started (sensevoice-small)` | 录屏 |
| 4 | **核心闭环**：TextEdit 光标 → 长按右 Option 说话 → 松开 → 落字 | ✅ 落字「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」；`maxPeak=32762 voicedMs=5260` | ss_5f9f4a45.png |
| 5 | Option+Q 免按进/出，前台无 `œ/Œ` 污染 | ✅（修复后） | ss_3d3a0f4e.png |
| 6 | Esc 取消录音 | ✅ 取消、无落字（前台 App 也会收到 Esc，已知限制） | ss_b6e2fc1e.png |
| 7 | F8 改写（mock LLM，本机 OpenAI 兼容服务） | ✅ 连接测试通过、改写结果 `[MOCK-REWRITE-OK]` 落字 | ss_a7d1e447 / ss_d392de87 |
| 8 | 菜单栏图标 / Dock | ✅ 关窗隐藏、菜单栏菜单可用、Dock 点击恢复窗口 | ss_a8fefea0 / ss_7f53aa79 |
| 9 | 深色模式 | ✅ 系统切深色后约 1s 跟随 | ss_9c5a0d2e.png |
| 10 | 设置页五语言（en / zh-CN / zh-TW / ja / ko）无乱码 | ✅ | ss_6f06b1ce / ss_f9df0f7b / ss_8eb670d8 / ss_2cde1ff1 / ss_3a0f7a40 |
| 11 | mac 模型列表只有 SenseVoice / Parakeet | ✅ | ss_5cb2a4b9.png |

**音频注入方法**（VM 无麦克风）：`say` 生成中文 aiff → `afconvert` 转 16 kHz 单声道 PCM16 wav → 打包版加 Chromium 参数 `--no-sandbox --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=<wav>`（`--no-sandbox` 必须，否则 wav 读成静音）。**按键注入**：右 Option 用 CGEvent flagsChanged（自建 `keytool`），Option+Q / Esc 用 `osascript key code`，F8 用 computer-use hold_key。方法细节已写入 `.agents/skills/testing-speaktype-desktop/SKILL.md` 的 macOS 章节。

## 五、GUI 测试发现的问题与处置

| 问题 | 严重度 | 处置 |
|---|---|---|
| 通用页「跟随系统」提示文案写死 Windows | 低 | 🔧 五语言改为「系统/OS」 |
| 语音页 Provider 标签写 `SenseVoice / whisper.cpp`、模型提示含 whisper tiny/base/small 说明（mac 上不存在） | 低 | 🔧 标签改 `SenseVoice / Parakeet`；whisper 那句拆成独立 key，只在模型列表含 whisper 模型（Windows）时拼接显示 |
| Finder 右键「打开」在 macOS 26 不能绕过 Gatekeeper | 文档 | 🔧 docs/macos.md 改为以 `xattr` 与「隐私与安全性 → 仍要打开」为主 |
| Apple Events 弹窗出现在首次启动而非首次落字 | 文档 | 🔧 docs/macos.md 修正 |

> 文案修复后重新 `npm run typecheck && npm run build && npm run pack:mac` 出最终产物（SHA-256 见 Release）；文案改动没有再跑一遍完整 GUI 回归，仅 typecheck/build/打包验证。

## 六、未测 / 未验证项汇总

| 项 | 原因 | 建议 |
|---|---|---|
| 物理 Mac（真实麦克风、物理键盘、右 Option 手感） | 只有 Apple Silicon VM | 老板/同事在物理 MacBook 上跑一遍核心闭环 |
| Intel x64 包运行 | 无 Intel 硬件 | 找一台 Intel Mac 跑 dmg |
| 麦克风 TCC 首次授权弹窗 | 假麦克风参数绕过 | 物理机首次长按热键观察 |
| `mute.ts` 录音时静音 | VM 无音频输出 | 物理机 |
| Parakeet 模型 mac 推理 | 仅测了 SenseVoice（同一 sherpa addon） | 下载 660 MB 模型跑一次 |
| Windows `npm run pack`（NSIS） | 本机 macOS | Windows 机跑一次确认体积未变 |
| 签名/公证 | 无 Apple Developer 账号 / Developer ID 证书 | 需要老板提供后改 `identity` 并加 notarize |
| 老配置 `hotkeyHold: RightCtrl` 的 mac 用户 | 不自动迁移（尊重用户显式设置） | 首次 mac 发布前没有老用户，可接受 |

## 七、测试环境残留（不在仓库内）

- 为通过系统设置的管理员密码验证，新建了本地管理员 `stadmin`（密码只存在本机文件，未进入仓库/日志/PR）；可用 `sudo sysadminctl -deleteUser stadmin` 清理。
- `/Users/devin/mac-test/` 下的探针、keytool、mock LLM、fake wav 均为本机临时文件，未提交。
