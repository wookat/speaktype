# 第 145 轮体验官审查：任务栏位置 × 悬浮条锚定 + 历史导出特殊字符对抗

- 基线：main @ be22f6e（#228 为 skill 文档，产品不变），win-unpacked 沿用（0.15.0 packaged）
- 方法：真实打包应用 + Notepad + fake mic；任务栏位置用 StuckRects3 第 13 字节（0=左 1=顶 3=底）+ 重启 explorer；对抗历史用 app 停止时注入 history.json（5 条含 `|`、`#`、``` 代码块、`<script>`、多行含空行、200+ 字符长 URL，personaName 亦含 `|#$`）；全程录屏
- 结论：**全部通过，无新立案**

## 逐项结果

### A1 任务栏顶部 × 悬浮条/字幕/toast
通过。StuckRects3 置顶 + explorer 重启后：
- RightCtrl 录音：悬浮条贴屏幕底部居中（底边距屏底 ~12px），字幕气泡在其上方，完整可见不被遮挡不跑飞；
- toast（短按触发「Didn't catch that / No speech detected」）位于底部区域（y≈屏高-92-176），完整可见。
- 代码口径：dockPanel/dockToast 按鼠标所在屏 workArea 计算（windows.ts L177-195），任务栏在顶时 workArea 底=屏底，实测一致。

### A2 任务栏左侧 × 悬浮条/字幕
通过。左侧任务栏下录音：悬浮条+字幕仍贴底居中、完整可见、不与左侧任务栏重叠。

### A3+C 还原底部 + RightCtrl 中文回归
通过。任务栏还原底部（pos byte=3）后 RightCtrl 整句中文落字 Notepad（Ln2 Col29）。
- ⚪ 测试者注记：explorer 重启后任务栏图标顺序变化，曾误点 SpeakType 图标产生一次落在应用窗口的听写（stats +1，已随 bak145 还原），不影响断言。

### B 历史导出特殊字符对抗
通过。
- **UI 渲染**：5 条注入条目全部纯文本渲染——`<script>alert(1)</script><b>bold</b><img onerror=…>` 逐字显示不执行不消失（XSS 负向证据）；`|`/`#`/``` 原样；多行含空行正常分行；长 URL 自动换行不撑破页面。
- **导出 md**（Downloads\speaktype-history-2026-08-17.md）：
  - BOM 存在（首 3 字节 EF BB BF，#198 回归通过）；文件头 `# SpeakType History`；
  - 恰好 5 个 `- ` 顶级条目（搜索过滤后导出），条目边界清晰，未因 `|` 或 ``` 断裂错位；
  - 多行条目续行两空格缩进保持在同一列表项（含空行处理为缩进空行）；
  - `<script>`、`rm -rf /` 代码块、长 URL、`params0123…` 全部逐字节完整（脚本正则逐项核验 True）。
- ⚪ 观察（不立案，口径记录）：导出不做 Markdown 转义，`|`/`#`/``` 在**渲染态** md 查看器中可能改变排版观感（如条目内代码块生效），但条目边界与数据完整性不受影响，纯文本/往返可读性成立。

## 清场核验（全绿）
- 任务栏 pos byte=3（底部）、explorer 运行中
- speaktype.json/history.json 从 bak145 还原：lang=zh、theme=system、hold=RightCtrl、mwr=False、provider=local；hist=43、stats 122/7089/1018238（注入条目全清除）
- 导出文件已删除；系统 mute=False；flag 无；failed-audio=0
- SpeakType/notepad 进程 0；43117/43998/18099 无 LISTENING；防火墙三 profile False
- VB-CABLE 保留；未改产品源码
