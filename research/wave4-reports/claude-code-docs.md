# Breadth report: Claude Code (public docs only) (Wave-4, 2026-08-22)

Source: docs subagent (Explore) using ONLY official public materials (no leaked/decompiled content, per proprietary-software red line). 4/25 direct fetches succeeded (anthropic.com/engineering×4); 14 more identified via search metadata (code.claude.com timed out from this environment); 7 404s.

## Successfully fetched primary sources

1. https://www.anthropic.com/engineering/how-we-contain-claude (containment/security architecture)
2. https://www.anthropic.com/engineering/claude-code-best-practices (~15K words)
3. https://www.anthropic.com/engineering/claude-code-auto-mode (auto-mode classifier design)
4. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

## Mechanism inventory (public-docs-attested; 主 Agent 已校正 FAR-Lab 对照——子 Agent 的对照列含多处不准确推测，如称 FAR-Lab 缺验证环/可观测性，实际 FAR-Lab 有 guard/verify 阶段、completion-gate、receipt 体系)

| 组 | 机制 | 来源 | 要点 | FAR-Lab 实际对照（主 Agent 校正） |
|---|---|---|---|---|
| A | Plan mode | best-practices | .claude/plans/ 计划文档先审后执行；.claude/ 永需批准 | FAR-Lab plan 阶段产物入 sqlite+导出；无人工审批门（feedback 阶段承担修订环） |
| A | 权限模式三层 | auto-mode 博客+permissions 文档 | default(逐工具问)/auto(分类器)/plan | 不适用（FAR-Lab 无交互工具面） |
| B | CLAUDE.md 四层层级 | memory 文档 | Managed>Root>User>Directory，低层覆盖高层 | 缺失（记 B：运行期项目指令层级） |
| B | Auto-memory 三后台合成代理 | memory/context-eng 博客 | extractMemories/sessionMemory/autoDream 每响应后触发合成 MEMORY.md；200 行上限+oldest-pointer 驱逐 | 缺失（hermes background-review 同族；记 B：方法论沉淀，需 live 模型） |
| B | Auto-compact + microcompact | context-eng 博客 | 窗口满触发摘要压缩；microcompact 选择压缩低信息工具结果 | 不适用当下（单次调用）；microcompact 思想≈工具结果截断 |
| B | 工具结果截断+标记 | context-eng 博客 | [truncated] 标记+按需重取 | 相关（FAR-Lab 截断标记约定缺失——融合候选） |
| C | Read-before-Edit 契约 | best-practices | 编辑需先读过或精确 old_string | 不适用（无编辑面） |
| C | 并行工具调用 | context-eng 博客 | 独立调用同轮并行 fan-out/fan-in | 缺失（FAR-Lab 阶段内检索源可并行——候选评估） |
| D | 子代理上下文隔离 | context-eng 博客 | sandbox/worktree/directory 三隔离；主代理只见摘要 | 缺失（最小架构不变量：暂不引入） |
| D | TodoWrite 纪律 | best-practices | 显式任务状态机 | 部分（orchestrator stage 记录即此角色） |
| D | 验证环+完成判定 | verification-loops 博客 | implement→verify→fix→verify；完成=全检过（非"看起来完成"） | **已有等价**（guard/verify 阶段+completion-gate+far verify——FAR-Lab 此维领先） |
| E | 秘密自动脱敏 | containment 博客 | 工具输入输出进上下文前检测脱敏 | 相关（FAR-Lab 错误路径脱敏——小融合候选） |
| E | 不可信内容标记+指令层级 | containment 博客 | 工具结果标记 untrusted；层级防注入 | **已有等价**（随机 fence D-026 时代前即有 F-2） |
| F | Hooks PreToolUse/PostToolUse | hooks 文档 | exit 0/1/2 或 stdout JSON 改参；子代理统一触发 | 缺失（记 B：orchestrator 事件钩子） |
| I | Prompt caching | context-eng 博客 | 系统提示+早期轮次缓存计价 ~10% | 缺失（DeepSeek 自动上下文缓存服务端已覆盖——无需客户端机制） |
| I | 无自动模型路由（设计选择） | issue #27665 | 每轮全上下文单模型，可预测优先 | FAR-Lab 同设计 |
| J | 最佳实践文档化 | best-practices | ~15K 词机构知识 | 部分（README/START_HERE 有，密度低于此） |

## Top-5（子 Agent 排序，主 Agent 期望值校正）

1. 子代理隔离——**缓延**（最小架构；触发：真实并行需求+权属设计）
2. 验证环+完成判定——**已有**（FAR-Lab 领先项，无需移植）
3. Auto-memory 后台合成——**缓延**（需 live 模型；与 hermes background-review 合并为同一注册表项）
4. Hooks 生命周期——**缓延**（无扩展生态需求）
5. Auto-mode 分类器——**不适用**（无逐调用审批面）

## 净结论（主 Agent）

Claude Code 公开材料对 FAR-Lab 的直接可移植机制少（产品形态差异），但其**工程判断**验证了 FAR-Lab 既有设计的正确性：验证环优先、fail-visible、单模型可预测性、untrusted-data 边界。新增可收割点仅：截断显式标记约定 与 错误路径秘密脱敏（与 codex sanitizer 合并评估）。
