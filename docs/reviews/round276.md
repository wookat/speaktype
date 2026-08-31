# SpeakType 第 276 轮：P2-275-1 主进程内存斜率根因诊断（qa-engineer 诊断专项）

- 日期：2026-08-31（UTC）
- 被测版本：main @ 6a0f1f0，打包版 `desktop/release/win-unpacked/SpeakType.exe`（v0.17.0, packaged=true）
- 方法：打包版带 `--inspect=9229` + fake mic 循环中文样本，Alt+Q 免按连续听写 70.1 分钟（history 5→422 条，≈6 条/min，全程无中断）；每 60s 采样各进程 WS/PM；inspector 每 60s 取 `process.memoryUsage()` + `v8.getHeapStatistics()`；t≈12min / t≈70min 各取一次 heap snapshot 对比。

## 结论

**P2-275-1 判定为分配器/预热行为（情形 c），非真泄漏，降级为观察项，无需代码修复。**

## 证据（实测）

- 主进程 JS 侧全程平坦：heapUsed 16–18MB 无趋势、arrayBuffers 恒 0、external 5–10MB 振荡无趋势（排除 JS 泄漏）。
- heap snapshot 对比：总 self-size 20.33→20.58MB（+0.25MB，全部来自 `code` 类 JIT 代码缓存 +227KB），节点数 334226→334129 持平，无滞留对象类别增长。
- 主进程 PM 斜率（最小二乘，剔除 snapshot 写盘与关机采样点）：全程 0.128 MB/min；前 30 min 0.223；**后 30 min −0.011（≈0，收敛）**；PM 484→494MB 后平台在 ≈495MB。
- WS 全程锯齿 330–350MB 无趋势（与 275 轮「WS 末值低于首值」一致）。
- 渲染/gpu/network 进程 PM 均在基线内（renderer +5~6MB/70min）。

## 对第 275 轮 +0.885 MB/min 的解释

其 37 分钟窗口基本落在预热段（本机前 30 min 也有 0.223 MB/min），且端点差值法在短窗口上会高估斜率。本机 70 分钟后段斜率归零 + JS heap/snapshot 双证据平坦，故不立修复案。

## 方法学建议（沉淀进回归基线）

- 后续 soak 基线判定统一使用「后 30 分钟最小二乘斜率」，预热段单列。
- heap snapshot 序列化本身会使 RSS/PM 瞬时 +60~70MB，斜率计算须剔除该采样点。
- 带 `--inspect` 且调试客户端仍连接时，托盘 Quit 不会完成退出（inspector 特性非产品 bug）；断开客户端后数秒内全部干净退出。

## 环境清理（已执行）

SpeakType/Notepad/fake mic/采样进程 0 残留；未修改产品代码/防火墙/hosts；未提交 secrets。
