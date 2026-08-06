# 12 · 扩展指南：加检测器、加种子、加命令

> 学习目标：掌握 FAR-Lab 的三条扩展路径——新增反剧场检测器、新增 demo seed、
> 新增 CLI 子命令；理解每条的完整生命周期（写代码 → 测试 → 注册 → 验证）。
> 前置：03-10（至少 03/05/10）。产出：动手新增一个检测器或种子并通过测试。
> 这是学习路线的终点：**你已经从"看懂"走到了"能改"**。

---

## 12.1 扩展全景

| 扩展类型 | 改哪里 | 注册哪里 | 测试放哪里 |
|---|---|---|---|
| 新增检测器 | `src/anti_theater/detectors/<name>.ts` | `detectors/index.ts` 的 `DETECTORS` 数组 | `tests/anti_theater/<name>.test.ts` |
| 新增 demo seed | `src/demo_seeds/<prefix>_<name>.ts` | `registry.ts`（problemId 升序） | `tests/demo_seeds/` |
| 新增 CLI 命令 | `src/cli/commands/<name>.ts` | `src/cli/far.ts` 命令分发 + HELP_TEXT | `tests/cli/<name>.test.ts` |

三条路径共享同一纪律：**纯函数优先、确定性、零容忍（无 any/空 catch/桩）、
预注册冻结模式**。

## 12.2 路径 A：新增反剧场检测器（推荐入门）

### 步骤

1. **定义攻击语义**：先写清楚攻击者做什么、检测器抓什么、为什么零误报。
   参考 `metric_swap.ts` 的注释风格（攻击语义 → 算法 → 误报率保证）。

2. **实现检测器**（模板）：

```ts
export function detect_my_attack(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const frozen = input.preregistrationRecord.xxxHash;   // 冻结端
  const executed = hashCanonicalJson({ xxx: input.fec.xxx });  // 运行期重算
  if (frozen !== executed) {
    return [makeFinding({
      attackId: 'AT-MY-ATTACK',
      outcome: 'FAIL',
      reasonCode: 'XXX_MODIFIED',
      evidenceRef: 'preregistrationRecord.xxxHash',
      message: '...',
      affectedProofHashInputs: ['fec.xxx'],
      remediation: '...',
    })];
  }
  return [];
}
```

3. **注册**：在 `detectors/index.ts` 的 `DETECTORS` 数组追加
   `detect_my_attack, // AT-MY-ATTACK`，并加入 re-export 列表。

4. **测试**：`tests/anti_theater/` 新建测试——至少覆盖：攻击被抓住（FAIL）、
   干净输入无发现（[]）、边界输入（空/缺字段）。

5. **验证**：`pnpm typecheck && pnpm lint && node --test tests/anti_theater/`。

### 为什么这是入门路径？

检测器是**纯函数**：输入 → 输出，无 IO，测试直接。你能立即看到自己的代码
影响 verdict（FAIL → UNTESTED 链）。而且 22 个现成例子随便抄模式。

## 12.3 路径 B：新增 demo seed

### 步骤

1. **选真实问题**：必须有真实证据来源（DOI/arXiv）+ 明确的可证伪声明。
   抄 `p1_room_temp_superconductor.ts` 的骨架：RAW_INPUT → SOURCE_CARD →
   六阶段 payload → verdict 设计 → reproHash。

2. **实现**：run 函数走 `runAgentLoop` + `assemblePaper` + `verifyChainHead`
   （p1 是完整参考，369 行）。

3. **注册**：`registry.ts` 按 problemId 升序追加条目（title/domain/tag）。

4. **测试**：`tests/demo_seeds/` 验证 run 函数产出预期 verdict 且链完整。

5. **验证**：`far bench run` 应包含新种子。

### 注意

- verdict 必须"诚实"：真实问题该是什么结局就是什么结局，**不许**为了凑齐
  5 值分布硬编一个 verdict。
- 覆盖广度是加分项但不是目标——目标是每个种子都是真实可验证的科学问题。

## 12.4 路径 C：新增 CLI 命令

### 步骤

1. `src/cli/commands/<name>.ts`：导出 `run<Name>` 函数，返回退出码
   （0/1/2/7 契约）。
2. `src/cli/far.ts`：import + 命令分发 if 分支 + `HELP_TEXT` 帮助段。
3. `docs/cli-reference.md`：补充命令文档。
4. `tests/cli/<name>.test.ts`：覆盖正常路径 + 错误路径 + 退出码。
5. 验证：`node src/cli/far.ts <name> --help` + 测试。

### 纪律

- 无凭据默认：除非命令本质是 LLM 交互（如 ask），否则必须离线可用。
- 退出码契约：别发明新码，用 0/1/2/7。
- 参数解析：用 `parse_options.ts` 的 OptionSchema（fail-fast）。

## 12.5 扩展时的红线清单

- [ ] 纯函数（不读 DB、不调网络、不碰 LLM）——内核/检测器层
- [ ] 确定性（同输入必同输出）
- [ ] 零容忍（无 any / @ts-ignore / 双重断言 / 空 catch / 桩）
- [ ] 预注册冻结模式（freeze → recompute → compare）
- [ ] 测试覆盖：正常 + 失败 + 边界
- [ ] `pnpm typecheck && pnpm lint && pnpm test` 全绿
- [ ] 数字/文档同步（README/DOCS_INDEX/cli-reference）

## 12.6 毕业练习（学完这条路线的最终挑战）

**任务**：新增一个检测器 `AT-DATA-LEAK`，检测"训练数据泄漏进评估集"
（评估集与训练集身份重叠）。要求：

1. 先写测试（RED）：构造一个泄漏的攻击夹具 → 检测器必须 FAIL；
   干净夹具 → []。
2. 实现检测器（GREEN）：复用 `dataset_drift.ts` 或 `overfit.ts` 的模式。
3. 注册 + 全量验证（REFACTOR）。
4. 更新 `docs/concepts/anti-theater.md` 的检测器表格（+1 行）。

做完这个，你就完整走了一遍 FAR-Lab 的扩展生命周期——
**这就是学习路线的毕业证**。

## 自测

- [ ] 能说出三条扩展路径各自的 注册点 和 测试位置
- [ ] 知道检测器为什么是入门路径（纯函数 + 现成模式）
- [ ] 知道新增 seed 的诚实纪律（不许硬编 verdict）
- [ ] 记住扩展红线清单 7 条
- [ ] （挑战）完成 12.6 的毕业练习

---

## 学习路线完成 🎉

到这里，你从"AI4S 可复现性危机是什么"走到了"我能给 FAR-Lab 加一个新检测器"。
回到 [00 从这里开始](00_START_HERE.md) 复习地图，或深入：
- 想补数学：04 统计引擎 → `src/statistics/` 源码
- 想补系统：02 走查 → 08 CLI → 11 生产化
- 想补领域：10 Benchmark → 挑一个种子精读
- 想补前沿：`docs/learning/` 之外还有 V2 收据协议（`src/v2_domain/`）等你探索
