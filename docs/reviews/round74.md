# SpeakType 第 74 轮严格体验官审查报告

- 基线：main @ `04472ff`（含 #136 剪贴板条件还原、#137 经验沉淀），`npm run pack:dir` 全绿，win-unpacked 打包实测
- 环境：Windows Server 2022（管理员会话）；防火墙三 profile 全程 OFF（测前测后核验）
- 结论：**P0=0，P1=0，P2=0，P3×1（新立案）**；另 2 条观察不立案
- 证据分级：【实测】打包运行时直接观察；【源码】代码核对；【未验证】如实标注

---

## 一、#136 回归（【实测】三例）

1. **无竞争正常还原**：预置 `KEEP-ME-AFTER-PASTE` → 口述落字 Notepad → 终值 `clip=KEEP-ME-AFTER-PASTE`，还原不受条件判断影响。
2. **竞态窗口内用户复制保留（上轮 P3 修复坐实）**：预置 `OLD-BEFORE-RACE` → 口述，竞态脚本在识别文本刚写入剪贴板的瞬间注入 `USERCOPY-DURING-WINDOW` → 终值 **`final=USERCOPY-DURING-WINDOW`**（round74\race-out.txt，注入时刻 02:16:45.549）。上轮同法实测终值是旧内容覆盖用户复制，本轮用户内容保留——#136 条件还原生效。
3. **图片剪贴板边界：新 P3-①（见下）**。

## 二、P3-①：previous 为图片时落字后用户复制的图片永久丢失

### 复现（【实测】）
1. 脚本 SetImage 放入 32×32 位图，`ContainsImage()=True`。
2. RightCtrl 口述一句英文，正常落字 Notepad。
3. 落字后查剪贴板：**`hasImage=False text=[Image clipboard edge case check]`**——用户先前复制的图片被识别文本替换且不再还原，图片永久丢失。

脚本：round74\imgclip.ps1。

### 根因（【源码】paste.ts）
```ts
const previous = clipboard.readText();   // 图片剪贴板 readText() 返回 ""
...
if (previous && clipboard.readText() === text) clipboard.writeText(previous);
// previous 为空串 → 条件恒假 → 永不还原
```
非 #136 引入（`if (previous)` 一直存在），属存量边界：还原快照只取文本格式，图片/文件等非文本格式一概不保。

### 分级论证
- 场景真实常见：截图（Win+Shift+S/PrtSc）后顺手口述一句，截图即丢，需重截。
- 静默数据丢失族（与第 72/73 轮同守则），但图片可重截、损失可恢复 → P3 不升 P2。

### 推荐修法（~5 行）
```ts
const prevText = clipboard.readText();
const prevImage = prevText ? null : clipboard.readImage();   // 仅文本为空时快照图片
...
if (clipboard.readText() === text) {
  if (prevText) clipboard.writeText(prevText);
  else if (prevImage && !prevImage.isEmpty()) clipboard.writeImage(prevImage);
}
```
沿用 #136 的条件还原语义（剪贴板已被他人改写则放弃）；Electron `clipboard.readImage/writeImage` 现成可用，无新依赖。文件列表等其余格式仍不保（Electron 无通用格式快照 API，成本收益不匹配，如实声明边界即可）。

## 三、v0.13 变更面清单走查

- 【源码】v0.12（a9efb44）→ v0.13（bf26f34）变更集 = #100–#118 共 19 个 PR，与第 46–58 轮逐轮实测记录一一对应（每轮报告在 docs/reviews/round46-58.md），无未经审查的漏网变更；#119 仅版本号与下载链接。
- 【实测】发布资产可用性：Setup-0.13.0.exe（HEAD 200，98MB）、portable（200，87MB）、APK（200，2MB）三链接全通；About 页与侧栏显示 v0.13.0。
- 【实测】抽查两项代表性修复不回归：#100 同窗口连续口述句间补空格（`Window 1. Second half` 实拍）、跨窗口键变化时不补前导空格；#136 见第一节。

## 四、whisper 通道 + 强制简体输出（多轮未碰面，【实测】）

- 模型热切换 base-q5_1（60MB，已就绪即用），识别语言中文，Force Simplified Chinese 开。
- 中文语音（今天下午3点开会预算是五千二百元）→ 落字/历史：`今天下午3点开会,预算是5200元`。
- 逐码点核验：预(U+9884)/会(U+4F1A) 均为简体，无繁体码点——**最终输出简体达标**；whisper 原始输出是否为繁体无法从外部观察，繁→简转换分支覆盖度【未验证】（仅验证了最终结果正确）。
- ITN 正常（3点/5200）。观察不立案：whisper 通道逗号是半角 `,`（U+002C），sensevoice 通道是全角 `，`——跨模型标点风格不一致，属模型原生输出差异，用户感知轻微。

## 五、核心链路回归（【实测】）

- RightCtrl 英文（parakeet）：`Normal restore check number one.` 等多句逐字落 Notepad。
- RightCtrl 中文：sensevoice 路径上轮刚全绿，本轮以 whisper-zh（第四节）作中文通道回归，ITN 全对。

## 六、清场

- speaktype.json / history.json 从 round74 备份还原（模型/语言/简体开关随之复位）；Notepad/竞态脚本停；SpeakType 退出进程 0；无 .part；剪贴板测试图片已被文本覆盖无残留；防火墙三 profile 保持 OFF。

## 七、下轮候选

1. P3-① 图片剪贴板还原落地后回归（含"用户在窗口内复制新图片"的组合竞态）。
2. 增强标点（punct-ct）通道实测（models 目录已有 punct-ct，若从未运行时验证过值得一轮）。
3. 云端成功路径补测（等 key，长期挂账）；真手机麦通道（挂账）。
