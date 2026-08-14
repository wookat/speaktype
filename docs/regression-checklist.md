# 回归清单（每轮修复 PR 合并前逐条实测）

来源：审→改循环各轮体验官报告的复现步骤。修复某项时必须用**当轮报告的原始复现步骤**回归，不允许只用自造的新用例（第 2/3 轮各漏过一次就是这个原因）。

## 核心链路（任何一轮都必测，回归即 P0）
- [ ] 按住 RightCtrl 说话 → 悬浮条出实时字幕 → 松手 → 文字落到记事本光标处
- [ ] 静音录音 → 出现"没听清"可见反馈（不允许静默失败）

## 英文断句（polish.ts addEnglishPunctuation）
- [ ] `testing speech recognition Please transcribe this sentence accurately` → 两句、句号、首字母大写（第 1/2 轮验收句）
- [ ] `and all tests passed, Let me know when you are ready to deploy` → 逗号升级为句号（第 3 轮）
- [ ] `I booked the room for Friday afternoon, I will prepare the slides tonight` → ", I will" 处分句；"Friday" 不误断（第 3 轮）
- [ ] `can you check the numbers before the meeting` → 句尾 "?"（第 3 轮）
- [ ] `hello world` → 不动；已有标点文本 → 不动；中文 → 保留原有中文标点策略

## 配置自愈（store.ts backupIfCorrupt）
- [ ] speaktype.json 截断损坏 → 启动生成 .bad 备份 + "配置已重建" toast（第 2 轮）
- [ ] speaktype.json 加 UTF-8 BOM → 启动后**数据完好**（剥 BOM 写回修复，不重建不清空）（第 3 轮）

## SenseVoice worker（localasr.ts）
- [ ] 启动 ~3s 预热 log；空闲 10min → "worker stopped (idle)" + 内存回落数百 MB；再次录音瞬时重建、首句无额外等待（第 2/3 轮）

## 窗口与 UI
- [ ] 拖动/缩放窗口后 ~1s bounds 落盘；taskkill /F 强杀 → 重启精确还原（第 2 轮）
- [ ] 录键按钮窄布局单行；数字键 → 琥珀色"不支持"提示；F9 可录（第 2 轮）
- [ ] 识别语言下拉恰好 5 项（中/英/日/韩/粤）（第 2 轮）
- [ ] 历史 >50 条 → 分页显示"显示更多"；搜索正常（第 3 轮）
- [ ] 历史卡片操作按钮在 hover:none（远程桌面/触屏）环境可见（第 1 轮）
