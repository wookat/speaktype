# SpeakType 第 52 轮严格审查报告 —— 存量死 id 规则回归 + 学词冲突/F8 热词边界 + 多实例与托盘走查

- 审查对象：最新 main@5d87fb8（含 #107/#108）pack:dir 打包实测
- 审查方式：【实测】= 真机验证；【源码】= 代码走查；【未验证】= 如实标注
- 环境：Windows Server 2022；配置/历史测毕已从备份还原

## 结论总览

| 级别 | 数量 | 内容 |
|------|------|------|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 0 | — |
| P3 | 2 | ① #107 只管未来删除，存量死 id 规则仍静默改道 Default（缺启动清洗）；② F8 改写指令的转写不过热词纠错，词典对改写指令不生效 |

## 1. 存量死 id 规则回归 —— #107 之前留下的脏数据仍中招，P3-①

- 【实测】手工向 speaktype.json 注入 `{"match":"notepad","personaId":"custom-9999-dead"}`（模拟 #107 上线前删除人设留下的存量规则）→ 启动打包版 + mock 润色端点 → Notepad 口述：历史 personaName=**Default（静默改道）**，口述后 json 里死 id 原样残留、无任何提示——与第 51 轮 P3-① 同现象。#107 的联动清理只挂在「删除人设」动作上，对已经躺在配置里的脏数据无效。
- **修法论证**：启动时清洗一次最干净——migrate.ts（或首次 getSettings 后）把 `appPersonas` 中 personaId 不在「内置 ∪ 自定义人设」集合内的规则重置为 default 并 log 一行（~6 行）。比 UI 侧标红更彻底：清洗后 UI/运行时/存储三者一致，且一次性了断存量。

## 2. 学词与手动词冲突 + F8 热词路径

### 2.1 学词与手动词典冲突 —— 行为正确【实测】
- 词典模型澄清【源码】：hotwords 是「偏置 + 纠错词表」（单词列表），不是 A→B 映射，学词学的是改后的词本身（learnCorrections 只存 item.right），因此不存在「映射互相打架」的形态；唯一冲突形态是重复。
- 【实测】手动加 Zalize → 口述后把误识别 "SAILIZED" 改成 "Zalize"：日志记录 `auto-learn: "SAILIZED" -> "Zalize"` 但**词典不重复入库、无学词 toast**（learned 为空即静默跳过，词典计数不变）——去重正确，静默合理（用户改的词已在词典，无需打扰）。
- 顺带复核：学词/手动词共用同一 300 上限与同一 correctHotwords 纠错管线，无双轨不一致。

### 2.2 F8 改写路径热词不生效 —— P3-②【源码】
- dictation.ts finalize：普通口述走 `polishText` → 内部 `correctHotwords(base, settings.hotwords)` + LLM prompt 附热词表；**F8 改写走 `rewriteSelection(settings, rewriteTarget, raw)`——raw 是未经热词纠错的裸转写，prompt 也不附热词表**（polish.ts:271-303 全程无 hotwords）。
- 危害：用户词典里的专名（如产品名）出现在改写指令里被误识别时（「把这段改成提到 SpeakType 的版本」→ 转写成 speak type），LLM 会照错的写。词典承诺「recognition will respect them」在这条路径失效。
- **应否生效**：应该。指令同样出自同一个 ASR、同样受同一批专名影响。修法 ~2 行：`rewriteSelection` 前对 raw 过一遍 `correctHotwords`；可选加一行把热词表并入 prompt（与 polishText 对齐）。

## 3. 自由挑刺：多实例防护 + 托盘菜单 —— 全过

- 【实测】运行中再次启动 SpeakType.exe：进程数不变（requestSingleInstanceLock 拒绝第二实例）、主窗口自动弹回前台（second-instance→showMain）——双击图标找不到窗口的经典问题不存在。
- 【实测】托盘：图标常驻，右键菜单三项（Open SpeakType / Set up speech recognition / Quit）全部可用；左键单击直接开主窗。点 X 关窗为隐藏到托盘（进程保留、热键仍活），托盘单击复原——关而不退符合听写工具预期。
- 观察（不立案）：溢出托盘区曾见一枚幽灵图标，鼠标划过即消失——是 Windows 对已死进程图标的系统级残留行为，非应用缺陷（本轮曾强杀旧进程所致）。

## 4. 下一轮候选（按优先级）

1. P3-①（启动清洗存量死 id 规则）+ P3-②（F8 指令过热词纠错）一个 PR 落地回归。
2. 云端成功路径补测（继续等有余额的 key）。
3. 开机自启实测（launchAtLogin 开关 → 注册表/启动项实查 + 重启后行为，本轮未覆盖）。

## 5. 清场记录

- speaktype.json / history.json 已从备份还原（词典 0、mock 润色配置清除、注入规则恢复原状）
- mock 润色服务已停止；SpeakType / Notepad 进程 0；无 .part
- 防火墙三 profile 保持 OFF（未执行任何开启命令）
- 未修改任何产品代码
