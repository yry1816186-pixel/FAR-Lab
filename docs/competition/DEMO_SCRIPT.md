# FAR-Lab 赛道一·方向一·A 演示视频脚本（目标 ≤10 分钟）

> 录制环境：Windows 11 · PowerShell 7+ · 终端字号调大（录制清晰度）。
> 每屏标注时长预算；全程总计 ≤10 分钟。所有命令真实执行、真实输出（不剪辑伪造）。
> live Qwen 部分在 key 轮换后补录（第 4 屏）。

---

## 第 0 屏 · 开场定位（30 秒）

**画面**：仓库 README 顶部 + 终端。
**台词**：「FAR-Lab 是一个证据约束、可证伪、可迭代、可追溯的开源 AI Scientist 科研系统，
面向赛道一·方向一·A：科学假设生成与研究计划设计。核心主张一句话：LLM 负责提出，
确定性内核负责裁决，第三方可以独立重算。」

**命令**：
```powershell
git log --oneline -3
node src/cli/far.ts doctor
```
**镜头点**：`far doctor` 的自我诊断输出（key 缺失只 WARN 不阻塞——诚实边界）。

---

## 第 1 屏 · 纵向切片（90 秒）

**台词**：「一条命令跑完整切片：研究可行性门 → 真实文献检索（支持+反证）→ 3 个机制
不同的候选假设 → 独立批判 → 确定性评分 → 可执行研究计划。」

**命令**（检索 live·无需 key）：
```powershell
node src/cli/far.ts research start "Does stellar activity inflate hot Jupiter radii?" --out run.json
```
**镜头点**（逐段停 2 秒）：
- `gate: RESEARCHABLE · domain=astronomy`
- `receipts: 9 stage receipts · env git=…`
- 3 个候选假设卡片（Pareto 标注 + 各维度 grade）
- 研究计划（objectives/statisticalMethods/humanApprovalRequired）
- 红行提示：评分确定性 + 引用必须绑定语料

---

## 第 2 屏 · 真实数据分析闭环（120 秒）

**台词**：「计划不是纸上谈兵：下一步是真实数据。我们用 NASA Exoplanet Archive 的
live TAP 接口抓取真实参数表，计算热木星半径与辐照度的真实相关。」

**命令**：
```powershell
node src/cli/far.ts research analyze run.json --live
node src/cli/far.ts research compare run.json
node src/cli/far.ts research evaluate run.json
```
**镜头点**：
- `observation collected (PARTIAL, n=392, mode=LIVE)` + `r=0.587, p<0.001, CI[0.518, 0.649]`
- 措辞特写：`association, not causation`（相关性≠因果的诚实表述）
- compare 的修订 diff（冻结计划快照前后对比）
- evaluate 的 13 项程序化指标 + `deterministicRecompute: PASS`

---

## 第 3 屏 · 反馈修订 + 导出验证（90 秒）

**台词**：「专家反馈不是聊天记录追加，而是不可变修订；导出包可以被第三方独立验证，
篡改会被检测出来。」

**命令**：
```powershell
# 反馈 → 修订（计划真实重写）
'{ "source":"human", "actor":"reviewer-1", "text":"Pre-register a control analysis on activity-corrected vs uncorrected subsamples.", "triggers":["plan_rewrite"] }' | Set-Content feedback.json
node src/cli/far.ts research feedback run.json --file feedback.json
node src/cli/far.ts research compare run.json

# 导出 + 独立验证 + 篡改检测
node src/cli/far.ts research export run.json --out bundle
node bundle\verify.mjs          # INTEGRITY PASS（零依赖独立脚本）
# 篡改一个字节：
Add-Content bundle\research-run.json " "
node bundle\verify.mjs          # INTEGRITY FAIL → exit 7
```
**镜头点**：修订 diff（objectives +1 / analysisDag +3 / multiplicityHandling 变化）→
INTEGRITY PASS → 篡改后 exit 7。

---

## 第 4 屏 · live Qwen 全链路（120 秒·待 key 轮换后补录）

**台词**：「前面都是检索与数据的 live；现在补上模型的 live——Qwen 经百炼调用，
生成与批判在同一 live 链路里完成，运行模式横幅变为 LIVE。」

**命令**：
```powershell
$env:FAR_DASHSCOPE_API_KEY="sk-..."
node src/cli/far.ts research start "Does dark matter self-interact?" --profile competition_aliyun_qwen --json
node src/cli/far.ts research baseline "Does dark matter self-interact?" --profile competition_aliyun_qwen
```
**镜头点**：
- `runMode: LIVE (model=LIVE · retrieval=LIVE · experiment=NOT_EXECUTED)`
- 收据中的 provider request id / token usage（provider 报告了什么就记录什么）
- 四基线对比表（direct/rag/no_kernel/full 同模型同问题；N/A 诚实标注）
- 「引用绑定率 1.0 是确定性约束的结果，不是模型自觉」

---

## 第 5 屏 · Web 工作台 + 收尾（60 秒）

**台词**：「同样的闭环在 Web 工作台可用——同一个 application service，三个入口一致。
最后：整个仓库 2600+ 测试零失败，零容忍扫描全绿。」

**命令**：
```powershell
pnpm api        # http://localhost:3000/research
pnpm test       # 2604 (2598p/0f/6s)
node scripts/zero_tolerance_scan.mjs   # ok
```
**镜头点**：浏览器 /research 页（创建→假设比较表→修订时间线→评估指标）→ 测试数字特写。

---

## 剪辑要求

1. 终端字号 ≥14pt；终端主题高对比度。
2. 每个命令的真实输出**不剪辑拼接**（长输出可加速，标注 ×2）。
3. 片尾 5 秒静态页：仓库地址 + 「提交截止 2026-09-05 · 题目 XH-202619」。
4. 总时长硬上限 10:00；预算合计 8.5 分钟，留剪辑余量。
