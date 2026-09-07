# SpeakType 第 53 轮严格审查报告 —— 开机自启实测 + 长闲置热键响应 + 界面语言即时切换走查

- 审查对象：最新 main@43d712f（含 #109）pack:dir 打包实测
- 审查方式：【实测】= 真机验证；【源码】= 代码走查；【未验证】= 如实标注
- 环境：Windows Server 2022；配置/历史测毕已从备份还原，自启注册表条目已确认移除

## 结论总览

| 级别 | 数量 | 内容 |
|------|------|------|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 0 | — |
| P3 | 0 | 本轮零新立案（第 40 轮以来首次全绿轮） |

## 1. 开机自启实测 —— 全过

| 步骤 | 结果 |
|------|------|
| 开启 Launch at login | 【实测】HKCU\…\CurrentVersion\Run 即时写入 `SpeakType = "…\win-unpacked\SpeakType.exe" --hidden`：路径带引号、指向当前 exe 本体、正确 |
| Start hidden 子开关 | 【实测】仅在自启开启后显示（层级合理）；--hidden 恒随自启命令行，是否静默由 startMinimized 决定（源码 index.ts:435 双条件），语义正确 |
| --hidden + Start hidden 模拟登录启动 | 【实测】带 --hidden 启动：零可见窗口、无任务栏项、托盘图标就位、热键管线正常加载——静默驻留达标 |
| 无 --hidden 正常双击（对照） | 【实测】主窗正常显示——静默只作用于登录自启，手动打开不受影响，正确 |
| 关闭 Launch at login | 【实测】Run 条目即时移除、Start hidden 子开关随之隐藏 |
| 环境局限 | 【未验证】真实注销→重登的登录时刻拉起（会话中断风险不执行）；win-unpacked 路径本身非安装版路径，安装版指向 Program Files 的等价行为由同一 auto-launch 库负责（第 47 轮安装版曾正常运行，此点风险低） |

## 2. 长闲置后热键响应 —— 全过

- 【实测】应用启动后闲置 20 分钟：日志如约 `sherpa worker stopped (idle)`（启动后第 10 分钟），进程组内存降至 ~294MB。
- 【实测】闲置 20 分钟后 RightCtrl 口述：worker 与说话并行重建（日志 restart 与口述同秒），落字「Idle wake up check after 20 minutes.」逐字准确含 ITN（twenty→20），用户感知零额外等待——与第 45 轮 2.1s 并行重建结论一致，无回归。
- 【实测】Alt+Q 免按同场景落字正常。

## 3. 自由挑刺：界面语言即时切换（含托盘菜单）—— 全过

- 【实测】设置页切 日本語：整页 UI（导航/开关文案/说明文字）即时切换无需重启；**托盘右键菜单同步刷新**为「SpeakType を開く / 音声認識を設定 / 終了」（#refreshTrayMenu 在 uiLanguage patch 时被调用，实拍验证）；切回 English 同样即时。
- 观察（不立案，环境行为）：溢出托盘区偶见已强杀进程留下的幽灵图标，划过即消失——Windows 系统级行为，与应用无关（本轮测试频繁强杀所致）。

## 4. 下一轮候选（按优先级）

1. 云端成功路径补测（继续等有余额的 key——仍是唯一长期未覆盖面）。
2. 手机麦克风（Phone as microphone）通道真机走查：设置项存在但从未实测过（需要局域网内第二设备或模拟，可先做无设备时的引导/报错路径）。
3. 打磨期常规抽查轮换（周期性回归五页面+核心链路）。

## 5. 清场记录

- 自启注册表条目已移除（Run 键实查为空）
- speaktype.json / history.json 已从备份还原（launchAtLogin=False、startMinimized=False、uiLanguage=en）
- SpeakType / Notepad 进程 0；无 .part
- 防火墙三 profile 保持 OFF（未执行任何开启命令）
- 未修改任何产品代码
