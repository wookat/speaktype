# SpeakType 第 73 轮严格体验官审查报告

- 基线：main @ `91e78dd`（含 #134 hasPasteTarget、#135 SKILL），`npm run pack:dir` 全绿，win-unpacked 打包实测
- 环境：Windows Server 2022（管理员会话）；防火墙三 profile 全程 OFF（测前测后核验）
- 结论：**P0=0，P1=0，P2=0，P3×1（新立案）**；另 3 条观察不立案
- 证据分级约定：【实测】打包运行时直接观察；【源码】代码核对；【未验证】如实标注

---

## 一、P3-①：剪贴板还原竞态——落字后 ~410ms 窗口内用户手动复制会被静默覆盖

### 复现（【实测】）
1. 预置剪贴板 `ORIGINAL-CLIPBOARD-CONTENT`。
2. RightCtrl 口述一句（"Testing the clipboard race window now."），落字正常。
3. 竞态脚本轮询剪贴板，在识别文本刚写入剪贴板的瞬间（= 350ms 还原窗口内）模拟用户 Ctrl+C 写入 `USERCOPY-DURING-WINDOW`。
4. 700ms 后读剪贴板：**`final=ORIGINAL-CLIPBOARD-CONTENT`**——用户在窗口内复制的新内容被应用的"还原旧剪贴板"动作静默覆盖丢失。

脚本与输出：`speaktype-review\round73\clip-race.ps1` / `race-out.txt`（注入时刻 01:44:14.435，最终值实拍）。

### 根因（【源码】paste.ts `pasteText`）
```ts
export async function pasteText(text: string): Promise<void> {
  const previous = clipboard.readText();
  clipboard.writeText(text);
  await sleep(60);
  await sendShortcut(VK_V, "v");
  await sleep(350);
  if (previous) clipboard.writeText(previous);   // ← 无条件还原
}
```
还原是无条件的：不检查此刻剪贴板是否仍是自己写入的 `text`。若用户在 60+350ms 窗口内复制了新内容，会被 `previous` 覆盖。

### 分级论证
- 触发窗口 ~410ms 且需恰好在落字瞬间复制，频率低 → 不到 P2。
- 但后果是**用户刚复制的内容静默丢失**（数据丢失族，与 #134 同守则），且用户完全无法归因 → 立案 P3。

### 推荐修法（~1 行）
```ts
if (previous && clipboard.readText() === text) clipboard.writeText(previous);
```
剪贴板已被别人（用户/其他程序）改写时放弃还原——宁可少还原，不可覆盖用户新内容。顺带收益：`previous` 为空时现状让识别文本留在剪贴板，行为不变。

---

## 二、#134 之后其他非常规粘贴目标

### 任务管理器前台（【实测】）
- taskmgr 前台（类名 `TaskManagerWindow`，与 SpeakType 同为管理员高完整性，UIPI 不拦截）口述："This text goes to the Task Manager window."
- 结果：无字落下（Taskmgr 主视图无文本框，Ctrl+V 无效）、**无 toast**（hasPasteTarget 只判 Progman/WorkerW）、历史正常入库、剪贴板还原正常。
- **观察不立案**：与 #134 同族的"静默不落字"，但内容已在历史、场景罕见；通用检测"前台是否有焦点编辑控件"（GetGUIThreadInfo.hwndFocus）对自绘/Electron/UWP 窗口误报率高，扩大拦截面弊大于利。建议 v-next 若做，仅加白名单式提示不拦截粘贴。

### SpeakType 自身窗口前台（【实测】）
- 历史页搜索框聚焦时口述 "hello self window" → **文本落入自家搜索框并即时过滤**，行为自洽合理。
- **观察不立案（注释与实现不一致）**：activeapp.ts 第 155 行注释写"桌面壳/**自身窗口**/无前台都不算"，实现只排除了 Progman/WorkerW 与空前台，自身窗口实际是合法粘贴目标（且体验合理）。建议改注释而非改行为（1 行文档修正）。

### 锁屏前台 / UAC 安全桌面（【未验证-环境限制】）
- 锁屏与 UAC 提升提示运行在 Secure Desktop，SendInput 从用户桌面无法注入，理论上 Ctrl+V 到不了目标（文本应只进历史且无 toast）。实测需锁定当前 RDP 会话/触发真实 UAC 弹窗，会中断自动化会话，本轮不执行，如实标注。

---

## 三、免按模式桌面无目标连续 toast 骚扰度（【实测】）

- 桌面（WorkerW）前台，Alt+Q 进免按，连续口述 3 句（句间 ~2.6s 静音分段）。
- 结果：每句结束各弹一次「No text field in focus / saved to History」toast，**同一 toast 原位复用刷新，不堆叠**；免按不中断，3 句全部入历史；停说后按静音阈值正常退出。
- 判定：不立案。提示频率=句频，单实例无堆积，信息真实必要；若嫌烦根因是"人在桌面开免按"这一边缘用法，不值得加抑制逻辑。

---

## 四、五语言新键抽查（#134 toast.noPasteTarget）

- 【源码】en / zh-CN / zh-TW / ja / ko 五语言 `toast.noPasteTarget(+Body)` 全部就位，无缺键。
- 【实测】en：「No text field in focus / Your words were saved to History — copy them from there.」桌面实拍；zh-CN：「当前没有可输入的窗口 / 内容已保存到历史，可从历史页复制。」桌面实拍，单行排版无截断无溢出。
- ja/ko/zh-TW 未逐一切换实拍（文案长度与 zh/en 同量级，排版风险低）【未验证】。

---

## 五、核心链路回归（【实测】）

- RightCtrl 英文（parakeet）：落 Notepad `The final regression sentence looks good at 4 p.m.`（ITN four PM→4 p.m.）。
- RightCtrl 中文（sensevoice 热切换即时生效）：落 Notepad `今天下午3点开会，预算是5200元`（ITN 全对）。
- Alt+Q 免按：见第三节，3 句连续分段识别全部正确。

---

## 六、清场

- speaktype.json / history.json 从 round73 备份还原；Notepad/taskmgr/竞态脚本进程全停；SpeakType 退出（进程 0）；无 .part；测试导出/临时文件仅留在 speaktype-review 评审区；防火墙三 profile 保持 OFF。

## 七、下轮候选

1. P3-① 条件还原落地后回归（含空剪贴板/图片剪贴板等非文本 previous 边界）。
2. 云端成功路径补测（等 key，长期挂账）。
3. 真手机麦通道（缺真机，挂账）。
4. v0.13.0 已在 About 显示——若为新版本线，建议下轮做 v0.13 变更面清单走查。
