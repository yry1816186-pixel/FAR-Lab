# zod v4 `z.toJSONSchema` 内部 — Wave-7 源码远征报告（主 Agent 亲测；子 Agent 因账户限速失败收归主线）

## 0. 元信息

- 实装 zod **3.25.76**（package.json `^3.24.0`）；`package.json` exports 含 `./v3`、`./v4`、`./v4/core` 等子路径——**同包内 API，用之不破 zod-only 不变量**。
- License：MIT（zod 仓库 LICENSE，既有依赖）。

## 1. 实测行为（node 实跑，命令级证据在会话记录）

| 探针 | 结果 |
|---|---|
| v4 基本投影 | draft-2020-12；object 输出 `required`（仅必填）+ `additionalProperties:false`（默认即开）；`minLength`/`minimum`/`maximum`/`default` 等约束**保留**（DeepSeek 严格子集禁） |
| optional 字段 | 不进 required（`count` 排除）；`.nullable().default()` 进 required 且带 `default` 键 |
| **v3 schema → v4 toJSONSchema** | **抛错** `Cannot read properties of undefined (reading 'def')`——v3 `_def` 对象与 v4 core `def` 内部结构不互通，无桥接 |
| `unrepresentable:'any'` + `z.date()` | 属性变 `{}`（裸对象）——恰是 DeepSeek beta 400 的形状（D-029 实证） |
| `z.record` | `propertyNames`+`additionalProperties:{type}`——超出 DeepSeek 子集 |
| `z.intersection` | `allOf`——超出子集 |
| 递归 schema | `$ref:"#"`/`$defs`——超出子集 |

## 2. 对 FAR-Lab 的判定

**方案 1 = KEEP 手写 zodToStrictJsonSchema（GO，维持现状）**：
- 我们的手写 walker 直接产出 DeepSeek 严格子集（全 required + additionalProperties:false + 无字符串/数值约束），带 UNPROJECTABLE 哨兵 + `assertStrictFcValid` 端点契约校验，live 验证 41/41（D-030）。
- v4 路线（方案 2）需要：① 全仓 schema 迁移 zod/v4（v3 桥不存在）；② 输出后处理变换器（剥约束键、optional→anyOf+补 required、$ref/allOf/propertyNames 检测→拒绝）——变换器的复杂度与风险 ≥ 手写 walker 的维护成本，而收益仅限我们不用的节点类型（date/intersection/tuple/record——这些本就该 UNPROJECTABLE 回退）。
- **v4 内部结构变化**（`_zod.def`、typeName 移除）意味着迁移会同时击中现有三个 `_def` 走查器（zodToStrictJsonSchema/describeShape/normalizeEnumFields）+ 全部 schema 文件——大爆炸迁移，无本 Wave 必要性。

**反转触发**（记录入注册表 B）：仓库因其他原因整体迁移 zod/v4 时，重开本评估——届时 z.toJSONSchema(……, {unrepresentable:'any'}) + 严格子集变换器可与手写 walker 合并出单一投影权威。

## 3. 顺带收获（v4 文档面）

- v4 `toJSONSchema` 的 `io:'input'|'output'` 语义提示我们一个潜在坑：z.default/z.transform 的输入形状≠输出形状——我们的投影走 input 侧（模型须交默认值前形状），与现实现一致（默认值字段按 anyOf+null 投影，zod parse 时再应用 default）。无行动项。
