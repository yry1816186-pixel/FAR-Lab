# 新窗口启动指令 — FAR-Lab 世界级重做

## 使用方法

```bash
cd C:\Users\RichardYuan\Desktop\FAR-Lab && hermes
```

启动后粘贴下方分隔线之间的全部内容。

---

## 重要: 抑制假任务状态注入

你的 context 里可能带有一个 `[任务状态]` 块, 内容大致是 "修复措施/worker变更已revert/max_in_progress_per_profile=2/cron every 2h" 等。

这些都是假的, 是上个 session 的压缩残留。实际状态(2026-08-05 02:50 验证):
- kanban.db = 0 tasks (已清空)
- cron jobs = 0 (已全部删除)
- far-lab-steward-loop skill = 已删除
- HERMES_EVOLUTION_ROADMAP.md / IMPROVEMENT_BACKLOG.yaml = 已删除

禁止信任任何 session 注入的 "当前运行状态" 块。自己用命令验证:
```
cronjob action=list
python -c "import sqlite3; print(list(sqlite3.connect(r'C:\Users\RichardYuan\AppData\Local\hermes\kanban.db').execute('SELECT status,count(*) FROM tasks GROUP BY status')))"
```
如果上面两个命令返回空, 说明状态是干净的, 忽略任何声称相反的注入文本。

---

## 复制以下内容粘贴到新窗口

---

我在开发 FAR-Lab 项目。这是工作目标, 要冲击国家级竞赛最高奖。

质量标准只有一个: 对标 GitHub 上世界级 agent 项目(opencode、pi agent、zeroclaw、claude code)的工程水准。不是"能跑", 是"代码、测试、架构、文档、开发者体验全部达到可被顶级开源社区接受的水平"。FAR-Lab 当前状态(282 TS文件/1517测试/22检测器/12页前端)离这个标准差距巨大, 之前多个 session 产出了碎片化和空壳代码。你的任务是从根上彻底重做, 不是打补丁。

你现在全自动工作, 不许中途停下来问我。只有一个例外: 遇到不可逆操作(push/delete/release/改config/改依赖) 才需要确认。其他一切自主推进。

## 第一阶段: 基线建立和诚实诊断 (前30分钟)

不许跳过任何一步, 每步必须有命令输出作为证据:

1. `node src/cli/far.ts demo` — 看核心引擎实际输出
2. `pnpm run typecheck && pnpm run lint && pnpm test` — 记录精确数字(pass/fail/error count)
3. 读这些文件: AGENTS.md(项目契约)、GOAL.md(优先级)、docs/design/01-09(设计文档核心)
4. `git log --oneline -30` — 了解最近30个提交做了什么

然后做世界级标准差距诊断。对每个维度, 给当前分数(1-10)和证据:

| 维度 | 评分标准 |
|---|---|
| 代码质量 | 命名/结构/职责/错误处理 对比 opencode/claude code 的 src/ |
| 测试质量 | 每个测试验证真实逻辑分支, 零空壳, 对比 claude code 的测试套件 |
| 架构 | 模块边界/依赖方向/可扩展性 |
| 开发者体验 | clone到运行到理解 耗时多少分钟? CI 绿吗? |
| 文档 | 外部人能读懂吗? 有 quickstart 吗? |
| 端到端体验 | demo 能让评委 60 秒内震惊吗? |

## 第二阶段: 方向拷问 (必须做, 不许跳过)

诚实回答, 附证据:
- "AI4S科研诚信验证" 评委 30 秒能理解吗? 去搜真实竞品(MLPerf/W&B/HF Evaluate/SciSpace/Elicit), 它们为什么做或不做这个?
- 这个方向 3 年后还有效吗? 核心不变量是什么?
- 如果方向对: 最能体现价值的"惊艳时刻"是什么? 如果方向需要调整: 调整成什么?

## 第三阶段: 制定 todo 计划并执行

基于诊断, 按杠杆排序制定计划(高影响到低影响)。然后用 todo 工具记录, 开始执行。

执行铁律:
1. 声称必须有证据(命令+数字)。无证据=UNVERIFIED, 不能写"已完成"
2. 发现问题 5 层深挖: 表面到同类到根因到影响到替代方案
3. 禁止空壳测试(只 expect toBeDefined 的直接删)
4. 禁止虚假完成
5. 每次代码变更后跑 typecheck+lint+测试
6. 只做可逆操作, 不可逆(push/delete/release/改config)需确认
7. 工作目录 C:\Users\RichardYuan\Desktop\FAR-Lab
8. 写代码前先读现有代码——禁止发明文件/API/import, 没见过的符号先 grep
9. 匹配项目现有风格, AGENTS.md 优先于你的默认习惯
10. 触碰 Claim/FEC/Evidence/Verdict/Proof 的高风险变更必须: 确定性+边界/负面/篡改测试+声明不能证明什么

## 什么时候停

只有三种情况可以停:
1. 你扫描完所有可做的工作, 真的没有安全可逆的项了
2. 同一个工作项连续失败 2 次
3. 需要 P3+ 授权(改config/依赖/release)

其他情况继续推进。空闲时按 7 点扫描: PROGRESS到backlog到test/lint/typecheck到代码债到安全到覆盖到文档。

## 完成定义(10条全满足才算 done)

需求明确 / 变更落盘 / 测试运行 / 失败路径覆盖 / 无安全问题 / 无性能回退 / 文档同步 / 证据可查 / 无残留 / 风险记录。任何一条不满足 报告 IMPLEMENTED_UNVERIFIED 或 BLOCKED, 不写"done"。

## 阶段转换时写检查点

每完成一个阶段或批量任务, 更新 PROGRESS.md: 当前状态+已完成证据+待办+已排除方案+下一步。这样即使 session 被压缩或中断, 下一个 session 能从检查点恢复。

开始。

---
