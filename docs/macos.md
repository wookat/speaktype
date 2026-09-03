# SpeakType for macOS（预览版）

> 状态：**预览版**。Apple Silicon 包在 macOS 26.5 的 Apple Silicon 虚拟机上真实构建、安装、跑通「长按热键说话 → SenseVoice 识别 → 落字到 TextEdit 光标处」；Intel 包为同一台机器交叉打包、**未在 Intel 硬件上运行过**。安装包未经 Apple 签名与公证。逐项验证记录见 [reviews/macos-round1.md](reviews/macos-round1.md)。

## 系统要求

| 项 | 要求 | 原因 |
|---|---|---|
| macOS | **15.5 或更高** | 随包的 sherpa-onnx 1.13.4 预编译 `libonnxruntime.dylib` 的 `minos` 为 15.5（`otool -l` 可查）；1.13.7 的 minos 已到 26.x，所以暂不升 |
| CPU | Apple Silicon（实测）/ Intel x64（交叉打包，未实测） | |
| 权限 | 麦克风、辅助功能；首次粘贴时还会问「自动化」（控制 System Events / 前台应用） | 见下文 |

## 安装与首次打开

1. 下载 `SpeakType-<version>-mac-arm64.dmg`（Intel 机器用 `-x64`），双击挂载，把 `SpeakType.app` 拖到「应用程序」。
2. 包是 **ad-hoc 签名、未公证** 的，Gatekeeper 会拦：
   - macOS 15+ 双击会提示「无法打开 / Apple 无法检查其是否包含恶意软件」，直接双击不会给「仍要打开」；
   - macOS 26 实测 Finder 右键「打开」**也不能**绕过；
   - 方法 A：**系统设置 → 隐私与安全性**，在「安全性」一节找到 SpeakType，点「仍要打开」（需要管理员密码）；
   - 方法 B（终端，一条命令）：
     ```bash
     xattr -d com.apple.quarantine /Applications/SpeakType.app
     ```
     然后正常双击。
3. 首次启动 SpeakType 会检测**辅助功能**权限：没有时弹出说明对话框，点「打开系统设置」跳到 隐私与安全性 → 辅助功能，把 SpeakType 打开（需要管理员密码）。授权后 App 会在 2 秒内自动启用全局热键，**无需重启**。
4. 首次启动就会弹「SpeakType 想要控制 System Events」（Apple Events 自动化，用于读取前台 App），点「允许」；首次长按热键录音时系统会弹**麦克风**授权（虚拟机用假麦克风参数测试时不会弹，见下文）。

> 为什么需要这些权限：热键靠 `uiohook-napi` 全局监听键盘（辅助功能/输入监控）；落字靠 `osascript` 让前台 App 执行 ⌘V（自动化）。SpeakType 没有自己的服务器，音频只进入你选的识别引擎。

## 使用

- **默认长按键是「右 Option」**（不是 Windows 上的右 Ctrl）：MacBook / Magic Keyboard 没有右 Ctrl，而右 Option 单独按下不会触发任何系统功能。可在 设置 → 通用 改成其他键。
- **免按模式 Option+Q**，**人设切换 Option+1…9**：这些点按组合键在 macOS 上走 Electron `globalShortcut`（系统级 RegisterEventHotKey 会吃掉按键），所以不会像纯旁听那样把 `œ`、`¡` 等符号输进前台 App。
- **本地引擎只列 SenseVoice 与 Parakeet**。whisper.cpp 上游不发布 macOS 可执行文件（只有 xcframework），仓库里的 `whisper-server.exe` 是 Windows 专用，macOS 包不带它；老配置若选了 whisper 模型，会得到本地化错误提示引导改选。
- 菜单栏有图标；关闭主窗口只是隐藏，点 Dock 图标或菜单栏图标可以再叫出来。

## 已知限制

| 限制 | 说明 |
|---|---|
| 未签名/未公证 | 需要 Apple Developer 账号 + Developer ID 证书才能公证。当前 `electron-builder-mac.yml` 用 `identity: "-"`（ad-hoc）+ hardened runtime + `disable-library-validation`（加载第三方 `.node`/`.dylib` 必需） |
| Intel 包未实测 | 只能保证包里带的是 `sherpa-onnx-darwin-x64` / `koffi darwin_x64`，运行未验证 |
| Esc 取消录音时前台 App 也会收到 Esc | Windows 版靠底层键盘钩子吃掉 Esc（`escblock.ts`），macOS 的 uiohook 只能旁听 |
| F8 改写 | 虚拟机实测直接按 F8 可触发；物理 MacBook 键盘的 F 键默认是媒体键，可能需要 fn+F8 或在系统设置里把 F 键改为标准功能键；也可在设置里改成别的键 |
| 「学你手改的词」不可用 | 依赖 Windows UI Automation（`watchedit.ts`），macOS 未实现 |
| 录音时静音系统 | `mute.ts` 走 osascript 设置输出音量，实测未覆盖 |
| whisper.cpp 引擎 | 仅 Windows |

## 从源码构建

```bash
cd desktop
npm install
npm run typecheck
npm run build
npm run pack:mac        # 产物在 desktop/release/：mac-arm64.dmg/.zip 与 mac-x64.dmg/.zip
```

- 打包用 `electron-builder-mac.yml`（`extends` 主配置），按 `${arch}` 回加 `sherpa-onnx-darwin-${arch}` 与 `koffi darwin_${arch}`，排除 Windows 的 whisper DLL/EXE 与 `koffi win32_x64`。
- **交叉打包 x64**：npm 只装当前 CPU 的可选依赖，在 Apple Silicon 上 `node_modules` 里没有 `sherpa-onnx-darwin-x64`，x64 包会缺 sherpa 原生模块。打包前先手动放进去（版本、sha512 以 `package-lock.json` 为准，不改 lockfile）：
  ```bash
  npm pack sherpa-onnx-darwin-x64@1.13.4
  mkdir -p node_modules/sherpa-onnx-darwin-x64
  tar -xzf sherpa-onnx-darwin-x64-1.13.4.tgz -C node_modules/sherpa-onnx-darwin-x64 --strip-components=1
  ```
- 验证包内原生模块：`codesign -dv --entitlements - release/mac-arm64/SpeakType.app` 应看到 `flags=0x10002(adhoc,runtime)` 与 5 项 entitlement（`build/entitlements.mac.plist`）；`ls release/mac-arm64/SpeakType.app/Contents/Resources/app.asar.unpacked/node_modules/` 应只有 `koffi sherpa-onnx-darwin-arm64 sherpa-onnx-node uiohook-napi`，`Resources/` 下不应有 `whisper/`。

## 没有麦克风的机器上怎么测（VM / CI）

Chromium 的假麦克风参数对打包后的 App 同样有效；`--no-sandbox` 必须，否则 renderer 读不到 wav：

```bash
say -o zh.aiff "帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复"
afconvert -f WAVE -d LEI16@16000 -c 1 zh.aiff zh16.wav      # 规范 PCM16 16kHz 单声道
/Applications/SpeakType.app/Contents/MacOS/SpeakType --no-sandbox \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --use-file-for-fake-audio-capture=$PWD/zh16.wav
```

假设备会循环播放这段 wav；长按右 Option 数秒再松开，即可在前台 App 看到识别文字。日志在 `~/Library/Logs/SpeakType/main.log`（`dictation finalize: ... maxPeak=... voicedMs=...` 表示录到了声音）。

## 数据目录

`~/Library/Application Support/SpeakType/`：`speaktype.json`（设置/词典/历史）、`models/`（离线模型）、`vad/silero_vad.onnx`。
