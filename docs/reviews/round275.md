# SpeakType 第 275 轮体验走查报告（user-experience-officer + qa-engineer）

- 日期：2026-08-31（UTC）
- 被测版本：main @ 6a0f1f0，打包版 `desktop/release/win-unpacked/SpeakType.exe`（v0.17.0, packaged=true）
- 环境：Windows Server 2022 VM，无物理音频设备；fake mic（`--use-file-for-fake-audio-capture`）+ 本地 SenseVoice-small（int8）
- 结论：**0 P0 / 0 P1，1 P2（主进程内存斜率超基线），1 P3（循环同音频识别文本波动）**。核心链路、30 分钟级免按长会话功能面、增强标点包、历史页 500 条大数据全部通过。

---

## 1. 构建验证（实测）

| 步骤 | 结果 |
| --- | --- |
| `npm install`（desktop/，Node 24.0.1） | 通过，0 vulnerabilities |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过 |
| `npm run pack:dir` | 通过，产出 win-unpacked |

注：Node 20.19.0 下 `npm install` 报 EBADENGINE（多个依赖要求 Node >=22.12.0），切 Node 24 后正常。属环境事项，不立案。

## 2. 核心链路轻量回归（实测，全过）

- **RightCtrl 中文落字**：按住 RightCtrl（扩展键扫描码）≈10s 松开 → Notepad 正确粘贴「帮我跟老板说，那个方案需要再改一下，明天上午之前给他答复…」，标点完整。
- **Alt+Q 免按多句**：连续免按听写，多句依次落字、自动分段（每句独立成段带句号），再次 Alt+Q 正常退出并有退出 toast。
- **Esc 取消**：录音中按 Esc → 取消，无落字，history 计数不增加。

## 3. 主专项：≥30 分钟免按长会话稳定性（实测）

方法：fake mic 循环 9.6s 中文样本（含 4s 尾部静音），Alt+Q 免按连续听写 ≈37 分钟；独立 detached 进程每 60s 采样各进程 WorkingSet/PrivateMemory（`mem275.csv`，37 个采样点）；以 history.json + main.log 计数。

### 3.1 落字成功率 / 丢句

- 会话期 history 新增 228 条，`failed` 0 条；main.log `dictation finalize` 238 次、匹配 `error|failed` 0 次。
- 与标准句完全一致 223/228 = **97.8%**；其余 5 条为识别变体（丢首字「帮」或多出「把。」等），非丢句（见 275-P3-1）。
- 单句 durationMs 7,990–11,840，均值 ≈8,690，全程无劣化趋势。

### 3.2 内存斜率（对比 #285 后基线 0.03~0.15 MB/min）

| 进程 | Private 斜率 | 备注 |
| --- | --- | --- |
| main（pid 3964） | **+0.885 MB/min**（468.5→495.3MB） | 超基线，见 275-P2-1；WorkingSet 斜率 +0.49 但末值 352MB 低于首值 387MB，呈锯齿波动 |
| renderer ×4 | +0.0004 ~ +0.21 MB/min | recorder/panel 等渲染进程均在基线附近或以内 |

### 3.3 自动分段与句号

全程稳定：Notepad 中每次落字均为完整一句带「。」，标点（，。）保留一致，未见分段丢失或标点退化（截图 ss_f5d65e4e）。

### 3.4 退出后内存归还与麦克风释放

- 托盘右键 → Quit：8 个 SpeakType 进程 5s 内全部退出（两次验证均干净退出），进程级内存全额归还 OS。
- 麦克风为 fake 设备；进程全退即释放句柄。**真实麦克风硬件释放（隐私指示灯等）因无物理音频设备，如实标 untested。**

## 4. 副专项

### 4.1 增强标点包下载 + 生效回归（实测，通过）

- `punctDownload()` → `{supported:true, downloaded:true}`，`models/punct-ct/model.onnx`（294MB）落盘，main.log「punct model downloaded」。
- 开启 enhancedPunct 后：中文 RightCtrl 落字标点正常；切 `language:"en"` 用英文样本听写，落字为「We need to move the launch date because the vendor cannot deliver the parts on time, so please tell the team to update the plan.」——逗号、句号均由标点模型补出，生效确认（截图 ss_ed5a49e6）。

### 4.2 历史页大数据：注入 520 条（实测，通过）

- 关闭应用后向 history.json 注入 520 条中文测试记录（合计 759 条）；应用按设计截断为 **500 条上限**（源码佐证：store.ts `slice(0, 500)`，注释亦说明 500 条历史独立存储）。
- 500 条下 History 页：首屏渲染即时无卡顿；搜索「编号1234」即时命中唯一记录；分页为 50 条/页 + 「Show more (450 remaining)」，连续加载滚动流畅（截图 ss_c5e0ae95 / ss_c376e80d / ss_6d0bc88f）。
- 注：注入 520 条被截断为 500 属设计行为，不立案；如需更大留存量可另行产品决策。

## 5. 立案项

### 275-P2-1 主进程 PrivateMemory 斜率 +0.885 MB/min，超 #285 后基线（0.03~0.15）约 6~30 倍

- **复现**：打包版 + fake mic 循环中文样本，Alt+Q 免按连续听写 ≥30 分钟，每 60s 采样主进程 PrivateMemorySize64。
- **证据（实测）**：`mem275.csv` 37 采样点，main PM 468.45→495.30MB，线性拟合 +0.8849 MB/min；WS 拟合 +0.4908 MB/min 但呈锯齿、末值（352.25MB）低于首值（387.16MB）。
- **影响面**：按此斜率数小时级连续免按会话主进程私有内存可累积数百 MB；WS 波动说明部分为分配器缓存/GC 行为，尚不能断言真泄漏。
- **建议**：①复跑 2 小时级 soak 看 PM 是否收敛；②用 `--inspect` 抓主进程 heap snapshot 对比（重点排查 finalize 路径的 buffer/字符串滞留）；③若确认泄漏再对 #285 修复做增量排查。
- **性质**：实测数据 + 推断（是否真泄漏未定论），定 P2。

### 275-P3-1 同一循环音频 228 次识别中 5 次文本变体（2.2%）

- **复现**：同上 soak，统计 history 文本与标准句 diff。
- **证据（实测）**：5/228 为变体（如丢首字「帮」、句首多「把。」、丢「帮」字），`failed` 均为 0，属 ASR 端点切分/识别波动而非丢句。
- **影响面**：长会话下偶发个别字词出入，用户可从历史页修正；量级小。
- **建议**：可在 #285 类回归中记录该基线（≈2%），持续观察是否随版本劣化。

## 6. 未测试项（如实列出）

- 手机麦克风中转链路（副专项①未选，speaktype.zalize.com/relay 未走查）
- 真实麦克风硬件的采集与释放（VM 无物理音频设备）
- 「录音时静音其他应用」实际效果（无音频输出设备）
- 云端（豆包）识别通道（本轮全程本地 SenseVoice）
- 2 小时级以上超长会话（本轮 37 分钟）

## 7. 实测证据 vs 源码推断声明

- 实测：第 1–4 节全部结论（构建输出、Notepad 落字截图、history.json/main.log 计数、mem275.csv 采样、GUI 截图）。
- 源码推断（未实测断言）：历史 500 条上限的设计意图（store.ts）；主进程内存增长是否为真泄漏（仅有斜率证据，无 heap 对比）。

## 8. 环境清理（已执行）

- SpeakType 托盘 Quit 干净退出（进程 0 残留）、Notepad 关闭、内存采样进程停止；
- 注入的 520 条测试历史与 soak 产生的测试记录已全部清除（history.json 已清空恢复）；
- 未修改任何产品代码、防火墙、hosts；未提交任何 secrets。
