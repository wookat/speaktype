# 第 116 轮体验官审查报告

- 日期：2026-08-16
- 基线：main@a92b6eb（与第 115 轮打包为同一提交，`git pull` Already up to date，复用第 115 轮 `pack:dir` 产物 `release/win-unpacked/SpeakType.exe`，版本 0.15.0）
- 本轮方向：① 悬浮条/字幕多虚拟桌面·最大化/全屏·任务栏自动隐藏可见性；② 手机麦 LAN 模拟 + 词典热词/自动学词链路；③ 五语近 10 轮新增文案抽查；④ 核心回归
- 证据分级：【实测】打包运行时直接证据；【源码】源码检视；【未验证】本轮未能验证

## 结论

**P0=0，P1=0，P2=0，P3=0——零立案，观察 ×1。**

## ① 悬浮条/字幕可见性与层级（全过）

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 记事本最大化下按住说话 | 胶囊/字幕正常悬于窗口之上，命中 notepad→老板应用规则时 chip 正常显示 | 【实测】截图 max-notepad.png |
| Chrome F11 全屏 | 胶囊仍可见于全屏页面之上 | 【实测】截图 f11-chrome.png |
| 虚拟桌面 2（Win+Ctrl+D 新建） | 桌面 2 上录音胶囊正常显示、实时字幕正常，落字准确落到桌面 2 记事本光标处（今天下午3点开会，预算是5200元 含 ITN） | 【实测】截图 vd2-recording.png / vd2-result.png |
| 录音中切换虚拟桌面 | toast/胶囊跟随当前活动桌面显示（overlay 对所有工作区可见） | 【实测】桌面 1 起录、桌面 2 收到「没听清」toast |
| 任务栏自动隐藏（ABM_GETSTATE=1 实证开启） | 任务栏隐藏时胶囊位置不变、不被遮挡、无空窗死区；任务栏弹出时也不与胶囊重叠 | 【实测】截图 autohide-hidden.png |

【源码】windows.ts：面板/toast 均 `alwaysOnTop:true` + `setAlwaysOnTop(true,"screen-saver")` + `setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true})`，与运行时行为一致。

观察①（测试摩擦，不立案）：按住 RightCtrl 录音期间按 Win+Ctrl+方向键切换虚拟桌面，组合键中的 Ctrl 会被判定为松键而提前结束录音（物理场景用户单手按住 RightCtrl 时另一只手按 LeftCtrl 触发）。属热键语义边缘，无数据损失（正常结算），仅记录。

## ② 手机麦通道（LAN 模拟）+ 词典热词/自动学词（全过）

方法：设置页开启「手机作麦克风」LAN 直连（`https://172.16.3.2:43117/?t=…`），Node ws 客户端模拟手机端协议（start → 推 16kHz mono PCM → stop），音频为已知语料「今天下午3点开会，预算是5200元」。

1. **远程麦音频走正常听写链路**【实测】：手机端收到 connecting→recording（含实时 partial 字幕逐段推送）→transcribing→polishing→idle 全状态流，文本准确落到 PC 记事本光标处。
2. **词典热词同样生效**【实测】：词典置「金天/域算」后，同一音频远程麦落字为「金天下午3点开会，域算是5200元」——同音纠错在远程麦路径生效，与本机麦一致。
3. **watchedit 自动学词同样生效**【实测】：远程麦落字后 3 秒观察窗内手改「域算→玉散」，词典自动 +1（hotwords=[金天,域算,玉散]），main.log 记 auto-learn 条目——远程麦 stop 走 dictation 常规 finalize，`watchPastedText` 观察窗同样挂上。
4. **错误 token 拒绝**【实测】：`/ws?t=wrong` 直接 socket hang up 断开，配对页 403 失效页逻辑【源码】一致。
5. **busy 防打架**【实测】：PC 本机录音进行中手机端 start → 收到 `{"type":"busy"}`，不抢占。
6. 真实手机设备（触屏按钮、iOS/Android 浏览器 getUserMedia、自签证书信任流程）本机无真机，【未验证】（挂账不变）；公网中转（relay）模式本轮未测。

## ③ 五语近 10 轮新增文案抽查（过）

- 【源码】五语 357 键逐文件比对：en/ja/ko/zh-CN/zh-TW 键集完全一致，零缺键零多键（第 105 轮 355 键 → +2 为 #188 home.steps.expand/collapse）。
- 近 10 轮新增键（#186 toast.saveFailed/saveFailedBody、#188 home.steps.expand/collapse）五语均在位。
- 【实测】ko 运行时抽查：Home 引导卡「단계 보기/단계 숨기기」展开收起正常无溢出；Speech 页签手机麦区块（휴대폰을 마이크로/연결 방식/QR 스캔）全 ko 无硬编码英文无截断；词典页、托盘菜单（종료）均本地化。

## ④ 核心回归（全过）

- RightCtrl 中文含 ITN：「今天下午3点开会，预算是5200元」（5200 数字 ITN 正确）【实测】
- Alt+Q 免按：同语料清词典后准确落字无热词污染【实测】

## 清场核对

- SpeakType 进程 0；43117/18099 无监听；无 .part
- speaktype.json / history.json 从备份整体还原（321 条历史、hotwords=[]、remoteMicEnabled=false、uiLanguage=en）；非只读
- 词典测试词（金天/域算/玉散）随还原清零；测试音频 zh1.pcm/zh1.wav 删除；记事本测试窗口全关；虚拟桌面 2 已关闭；任务栏自动隐藏已还原（ABM_GETSTATE=0）
- 防火墙三 profile OFF；repo 回 main

## 下轮建议

1. 真手机麦实机 + 公网中转（relay）模式补账（需真机/云端 key，挂账）
2. 观察①（组合键 Ctrl 干扰 RightCtrl 按住）若认为值得，可论证热键判定是否应只认 RightCtrl 扫描码
3. 度量第三数据点随发版
