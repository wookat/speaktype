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
- [ ] `today is a beautiful day and I am testing speech recognition` → 整句不拆，不得出现 "and. I am"（第 4 轮）
- [ ] `Please send the invite to Alice` → 整句不拆，不得出现 "to. Alice"（第 4 轮）
- [ ] `we should invite Peter Johnson to the meeting tomorrow` → 整句不拆，不得出现 "invite. Peter"（第 5 轮）
- 已知限制（第 6 轮记录）：起句词白名单化后，句首为人名/开放词的真句界不再拆（如 "…the budget John said it looks fine" 保持整句）。少拆比误拆伤害小，属有意折衷；根治依赖 ct-transformer 标点模型（见 docs/reviews/round6.md 专项 a），不再继续扩词表。

## 配置自愈（store.ts backupIfCorrupt）
- [ ] speaktype.json 截断损坏 → 启动生成 .bad 备份 + "配置已重建" toast（第 2 轮）
- [ ] speaktype.json 加 UTF-8 BOM → 启动后**数据完好**（剥 BOM 写回修复，不重建不清空）（第 3 轮）
- [ ] 历史/统计已拆到独立 history.json：旧版 speaktype.json 里的历史启动后自动迁入 history.json 且主配置里清空；历史/统计不丢（第 4 轮）
- [ ] history.json 截断损坏 → 启动生成 history.json.bad 备份 + “历史记录已重建” toast（与主配置文案区分）（第 5 轮）

## SenseVoice worker（localasr.ts）
- [ ] 启动 ~3s 预热 log；空闲 10min → "worker stopped (idle)" + 内存回落数百 MB；再次录音瞬时重建、首句无额外等待（第 2/3 轮）

## 窗口与 UI
- [ ] 拖动/缩放窗口后 ~1s bounds 落盘；taskkill /F 强杀 → 重启精确还原（第 2 轮）
- [ ] 录键按钮窄布局单行；数字键 → 琥珀色"不支持"提示；F9 可录（第 2 轮）
- [ ] 识别语言下拉恰好 5 项（中/英/日/韩/粤）（第 2 轮）
- [ ] 历史 >50 条 → 分页显示"显示更多"；搜索正常（第 3 轮）
- [ ] 历史卡片操作按钮在 hover:none（远程桌面/触屏）环境可见（第 1 轮）
- [ ] 历史卡片 raw≠text 时默认收起 diff，点“查看识别原文”才展开；展开后可点“收起识别原文”收回（第 4/5 轮）

## 免按模式（第 4 轮）
- [ ] Alt+Q → 说一句 → 停顿 → 自动落字后**继续聆听**，可连续口述多句
- [ ] 再按一次 Alt+Q → 立即退出连续听写
- [ ] 连续听写英文多句 → 句与句之间有空格分隔，不得出现 "test.And here" 顶格拼接；中文句间不插英文空格（第 5 轮）
- [ ] 连续听写进行中按长按键/F8 → 退出免按并显示“免按模式已退出（其他热键）” toast，不得静默退出（第 5 轮）
- [ ] 免按聆听中**未说话**时按长按键/F8 退出 → 只显示退出 toast，不得被“没听清”toast 覆盖（第 6 轮）
- [ ] 全程不说话 → 约 1 分钟后自动退出 + “免按模式已退出” toast
- [ ] 未配润色模型时按 F8 → toast + 主窗口自动打开并直达 设置→模型 tab

## F8 改写全链路（第 26 轮固化，mock 端点免真实 key）
1. `node desktop/scripts/mock-rewrite-server.mjs`（127.0.0.1:18099）
2. 设置→模型：Base URL=`http://127.0.0.1:18099/v1`，API Key=`mock`，Model=`mock`
- [ ] 记事本选中一整行 → 按住 F8 口述指令 → 松键 → 选区被替换为 `MOCK-REWRITE: ...`（含指令与原文大写内容）
- [ ] F8 录音期间悬浮条**不显示**按应用命中的人设徽标（改写不走人设，显示会误导）（第 26 轮）
- [ ] 未配润色模型时按 F8 → toast + 直达设置→模型 tab（同免按节最后一条）

## 窄窗口基线（第 27 轮固化）
主窗口缩到 700×560 逐页走查：
- [ ] 历史卡片头部 Copy/Correct/Delete 保持单行（长人设名被截断而非按钮换行）
- [ ] 人设卡片右侧操作按钮保持单行
- [ ] 侧栏/设置项自适应，无横向滚动条、无控件重叠

## 润色降级可见 + 本地无鉴权端点（第 28 轮固化）
- [ ] 润色模型 Base URL 指向不可达地址 → 普通听写落字为未润色原文，且弹「润色服务不可用」toast（降级不再静默）
- [ ] API Key 留空 + Base URL 指向本地无鉴权端点（Ollama/LM Studio/mock）→ 测试连接可点、润色/F8 改写可用（请求不带 Authorization 头）
- [ ] 同一拒写状态下依次下载 Parakeet 与 whisper 系模型 → 两者都报存储类文案（GH 第三源 404 不再覆盖真实错误）

## 增强标点英文边界句基线（第 16 轮固化，ct-transformer 模型级限制，不投工程修）
以下句子的当前模型输出即为基线，复现同样偏差不算回归；整体明显变差才算回归：
- [ ] "can you check the numbers before the meeting I met Sarah this morning she said the roadmap is ready we can start next week" → 问号会错位到句中（meeting？I met…），"she said，" 有冗余逗号
- [ ] "what time is the meeting tomorrow and who is joining" → 疑问句可能收句号而非问号
