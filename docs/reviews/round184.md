# 第 184 轮严格体验报告（打包版实测）

- 被测版本：main @ `0a61f18`（含 #272 自家窗口盲发修复、#271 修饰键超时转提示），SpeakType 0.15.1
- 测法：`npm --prefix desktop ci && npm --prefix desktop run build && npm --prefix desktop run pack:dir`，实测 `release\win-unpacked\SpeakType.exe`（fake mic：`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=zh_pad.wav`，10.59s 中文循环语料，另加 `--no-proxy-server --remote-debugging-port=9333` 用 CDP 抓 toast 原文）
- 合成修饰键均为单条原子 rkey 序列（SendInput scancode）；未开防火墙、未改 hosts
- toast 证据除截图外，另有 CDP 轮询日志（toast.html DOM 原文 + 时间戳），排除截图时机误差

## 分级汇总

| 级别 | 数量 | 条目 |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 1 | B-1 ko pasteBlocked toast 正文被 line-clamp-2 截断 |
| P3 | 4 | A-1 Clear all 不清统计；A-2 缺「完全重置」；A-3 词典清空确认布局跳动；C-1 免按中文连续口述句间无分隔+句号被剥 |

## 一、回归确认 #272 / #271 —— 全部通过

### R-1 自家窗口标题栏口述 → noPasteTarget + 剪贴板哨兵不被覆盖（#272）✅
1. 剪贴板写入哨兵 `SENTINEL-R184`；点击 SpeakType 自身标题栏（焦点在自家窗口非输入控件）
2. 原子序列 `down:rctrl,sleep:6000,up:rctrl` 口述一句中文
3. 实测：toast「No text field in focus / Your words were saved to History — copy them from there.」（CDP 05:28:10 visible）；剪贴板读回仍为 `SENTINEL-R184`（未被覆盖）；历史新增该句
- 证据：`C:\Users\Administrator\screenshots\ss_dc609d23.png`

### R-2 Alt 残留 1600ms → pasteBlocked（#271）✅
1. 焦点记事本，原子序列 `down:rctrl,sleep:6000,down:alt,up:rctrl,sleep:1600,up:alt`（松 RightCtrl 后 Alt 继续压住 1600ms，超过 1500ms 超时窗）
2. 实测：不再盲发 Ctrl+V，toast「Text not typed — a key was held down / It's on your clipboard — press Ctrl+V to paste. Also saved to History.」（CDP 05:29:04）；记事本无新增文字；识别文本按设计留在剪贴板供手动 Ctrl+V，历史亦有
- 证据：`C:\Users\Administrator\screenshots\ss_0f10c4bb.png`（toast+字幕）、`ss_62e0ba13.png`（记事本未落字）

### R-3 记事本正常落字 ✅
- 干净一轮 `down:rctrl,sleep:8500,up:rctrl`，记事本落入「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复」（Ln1 Col29）
- 证据：`C:\Users\Administrator\screenshots\ss_db59b6d3.png`

## 二、专项 A：数据完整性

### A-1【P3】历史「Clear all」不清统计，首页仍显示已删会话的计数（182 轮挂账坐实）
- 复现：口述 3 句（首页 Sessions=3 / Words=77）→ History → Clear all → 两步确认
- 实测：`history.json` 变为 `history: []` 但 `stats: {"words":77,"durationMs":23120,"sessions":3}` 原样保留；首页仍显示 3 sessions / 77 words / 23s
- 代码佐证：`store.ts clearHistory()` 只置 `history=[]`；`index.ts history:clear` 只额外清 failed-audio，无 stats 处理
- 挑刺：用户点「Clear all」的心理预期是"抹掉我说过什么的一切痕迹"，首页计数残留会让人怀疑没删干净。要么同步清 stats，要么在确认文案里说明"统计将保留"
- 证据：`C:\Users\Administrator\screenshots\ss_2e55e53c.png`（清空后首页仍 3/77）

### A-2【P3】设置页缺「完全重置」入口
- 现状：全应用只有两处局部清除（历史 Clear all、词典 Clear），About 页只有"打开日志文件夹"；模型文件、日志、缓存、设置本体、统计均无 UI 内重置手段（代码 grep 亦无 reset 通路）
- 卸载/换机/排障场景用户只能手删 `%APPDATA%\SpeakType`。建议 About 或 General 增加「完全重置」（历史/统计/模型/设置/日志/缓存，二次确认+重启）

### A-3【P3】词典清空确认超时回弹时按钮布局跳动
- 复现：词典有词条 → 点 Clear → 按钮变宽为红色「Clear all words? Click again」，左侧 Export 按钮被顶着左移 ~110px → 4 秒不点自动复位 → Export/Clear 又跳回原位
- 实测：数据安全无问题（超时复位不清词条；二次点击才清空，功能正常）；但确认态进入/超时退出两次横向跳动，若用户此刻正要点 Export 会点偏
- 挑刺：确认态可固定按钮宽度（min-width 占位）或将确认文案放 tooltip/inline 文本而非改按钮本身宽度
- 证据：`C:\Users\Administrator\screenshots\ss_zoom_28a7e24c.png`（确认态）、`ss_zoom_5fea9bb6.png`（超时回弹后）、`ss_c6b09e7f.png`(二次点击清空成功)

## 三、专项 B：五语言 UI 走查（en/zh-CN/zh-TW/ja/ko）

设置四个 tab + 新 toast 全部实机切换走查；语言下拉「立即生效」体验良好；未发现未翻译键名、未见设置页截断。

新 toast 五语言实机触发结果（CDP 抓 DOM 原文）：

| 语言 | noPasteTarget | pasteBlocked | 结果 |
|---|---|---|---|
| en | 实测 ✅ | 实测 ✅ | 正常 |
| zh-CN | 实测 ✅ | — | 正常（`ss_9a4fe43d.png`） |
| zh-TW | — | 实测 ✅ | 正常（`ss_ab533944.png`） |
| ja | 实测 ✅ | — | 正常（`ss_7859a5d0.png`） |
| ko | — | 实测 ✅ | **正文截断，见 B-1** |

### B-1【P2】ko pasteBlocked toast 正文被截断，动作提示句被腰斩
- 复现：界面语言切 한국어 → 记事本焦点 → Alt 残留序列触发 pasteBlocked
- 实测：toast 正文只显示「텍스트가 클립보드에 있습니다. Ctrl+V로 붙여넣으…」，"붙여넣으세요. 기록에도 저장되었습니다."（按 Ctrl+V 粘贴/已存历史）被省略号吃掉——失败补救提示恰好是被截断的部分
- 根因：`toast.tsx` 正文 `line-clamp-2`，韩文该句在当前 toast 宽度下超两行（CDP 抓到的完整 DOM 文本确认翻译本身完整，纯显示截断）
- 建议：toast 正文放宽到 line-clamp-3，或按语言/文本长度自适应宽度；至少保证「按 Ctrl+V」动作句完整
- 证据：`C:\Users\Administrator\screenshots\ss_021641a4.png`

## 四、专项 C：长会话稳定性（免按连续口述）✅

- 方法：记事本焦点，Alt+Q 进免按（原子序列），fake wav 每 10.59s 循环一句 28 字中文，连续跑 4 分 50 秒后 Alt+Q 退出
- 落字：31 句完整 + 退出时在录的 1 句部分（6 字），记事本 Ln1 Col875 与 31×28+6=874 字完全吻合，**零丢句零重复**；历史同步新增 32 条、stats 增至 39 sessions/965 words，账目一致
- 字幕：全程实时刷新、跟手，无卡死无残影（`ss_46059313.png` 中途、`ss_d76ff0e3.png` 结束）
- 内存（Get-Process WorkingSet 合计，9 进程）：开始 543MB → 1 分钟 648MB → 3 分钟 605MB → 结束 636MB；主进程 253→348MB。前 1 分钟爬升后进入 600-650MB 区间震荡，无单调泄漏迹象；主进程 +95MB 建议后续 30 分钟级长跑再观察
- 判定：通过

### C-1【P3/设计反问】免按中文多句口述＝无标点无分隔的一整行
- 实测：31 句中文首尾直接相连成 874 字单行（「…给他答复帮我跟老板说…」），因为①中文句尾句号被刻意剥掉（`polish.ts`「去尾句号是中文语音输入习惯」）②免按句间 glue 只对拉丁/数字开头补空格（`dictation.ts` holdGlue），CJK 不加任何分隔
- 反问：单句口述去句号是对的，但免按模式的用户显然在连续成段口述——第 2 句起仍剥句号又不给分隔，产出物完全不可读，还得手工断句。建议：免按会话内非末句保留句末标点（或句间补「，」/换行可配置）。这样设计真的最适合免按场景吗？

## 五、自由挑刺（不计级观察）

1. 语言切换后设置页滚动位置保留在页尾，切完看到的是页尾而非页首——无伤但首次切换会愣一下
2. pasteBlocked 场景识别文本会覆盖剪贴板（设计如此，方便 Ctrl+V 补救），但这意味着用户此前复制的内容被静默替换——toast 有说明，可接受；若做「粘贴后还原剪贴板」需权衡
3. 首页统计只有累计值，没有"今天/本周"维度，77 words 这种终身计数对用户激励有限

## 复核清单（本轮实测过什么/没测什么）

- 实测：#272/#271 回归、Clear all 与 stats、词典两步清空+超时回弹、五语言设置页+新 toast、免按 32 句长会话、内存采样
- 未测：30 分钟以上超长免按、增强标点/Silero 增强包下载链路、在线 ASR（豆包）通道、多显示器 DPI
- 测试语料为同一句循环，ASR 多样性未覆盖（与稳定性结论无冲突）

证据截图目录：`C:\Users\Administrator\screenshots\`（文件名见各条目）；toast CDP 日志与内存采样输出见会话记录。
