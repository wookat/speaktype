# SpeakType 第 58 轮严格审查报告 —— #118 线上中转回归 + F8 改写全路径 + 失败录音重试链路 + 核心回归

- 审查对象：最新 main@8af2356（含 #118）pack:dir 打包实测 + 线上中转 https://speaktype.zalize.com/relay 真实环境
- 审查方式：【实测】= 真机验证；【源码】= 代码走查；【未验证】= 如实标注
- 环境：Windows Server 2022；配置/历史测毕已从备份还原

## 结论总览

| 级别 | 数量 | 内容 |
|------|------|------|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 0 | — |
| P3 | 0 | 零新立案 |

## 1. PR #118 线上回归——全过【实测】

- **等待电脑灰禁用**：中文界面开公网中转，手机页（Chrome 模拟）连上后「已连接电脑」+按钮可按；桌面关远程麦 → 手机页即时变**「已连接中转，等待电脑…」+「按住说话」disabled 灰**（DOM 实查 disabled=true）；桌面重开远程麦——**房间号按安装持久（同 room id），已在房的手机页自动回到「已连接电脑」+按钮恢复可按**，正是「手机先入房、电脑后上线」目标场景，peer 消息双向驱动全部正确。
- **全链路落字**：经线上中转推真实语音 PCM → partial/transcribing/polishing/idle 全状态 → `The phone microphone channel is working correctly today.` 准确落 Notepad 光标 + 入历史。
- **zh 历史导出时间戳**：中文界面导出 md，时间戳 `2026/8/15 19:08:42` 中文区域格式（实拍），不再是美式 `8/15/2026, 7:08 PM`。

## 2. F8 改写全路径——全过【实测】

- Notepad 选中「the quarterly report draft needs review」→ 按住 F8 口述「make it formal for the zalize team」（词典已加 Zalize）→ mock 润色端点收到的指令为 **「Make it formal for the Zalize team.」（专名驼峰正确）**、原文完整，返回结果**原位替换选中文本**（剪贴板逐字核对）。#109 热词纠错在指令路径的行为与第 53 轮开发侧 mock 抓 prompt 实证一致。
- 改写结果入历史（含「查看识别原文」展开），人设标注正确。
- **润色端点不可达时的降级**（顺带实测）：AI 端点关停后普通口述**回退落原文** + toast 可见提示【源码 polishText onFallback + 实测落字为原文双证】——降级可见，符合守则。

## 3. 失败录音重试链路——全过【实测】

- 造失败：ASR 切「OpenAI 兼容转写」指向不可达端点 → RightCtrl 口述 → **toast「fetch failed · 刚才的录音已保留，再按一次热键立即重试」**（实拍）+ 历史出**「识别失败: fetch failed」红字 + 重试按钮 + 云转写 provider 标签**，wav 实存 failed-audio/。
- 重试：切回本地离线 → 历史页点「重试」→ **用当前（本地）通道重识别成功**，条目原位变正常文本 + 本地离线标签、status/audioFile 清除、**wav 文件删除**、文本进剪贴板（逐项实查）。跨 provider 重试语义正确——失败时用什么通道不影响重试用当前通道。

## 4. 核心链路回归——全过【实测】

- RightCtrl 英文（parakeet）：多句逐字落字（§2/§3 实验句全对）。
- RightCtrl 中文（sensevoice+中文）：`今天下午3点开会，预算是5200元` 含 ITN；模型热切换即时生效。

## 5. 下一轮候选（按优先级）

1. 云端成功路径补测（继续等 key——唯一长期未覆盖面）。
2. 真手机实测手机麦通道（触摸/息屏仍【未验证】）。
3. 打磨期主要面已扫完（56-58 三轮仅 1 个 P3 且已修），建议转 v0.13 规划轮。

## 6. 清场记录

- speaktype.json / history.json 已从备份还原（model=parakeet、ui=en、asr=local、remoteMic=False、词典 0 词、mock AI 端点配置清除）
- failed-audio 目录 0 文件；Downloads 测试导出已删；mock 润色服务已停
- SpeakType / Notepad / node 全清，进程 0；无 .part；43117 端口已关
- 防火墙三 profile 保持 OFF（未执行任何开启命令）
- 未修改任何产品代码
