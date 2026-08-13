# Walking Skeleton(Phase C · Gate C · C5)

**使命**:证明真实生产路径最小贯通,跨越客户端/接口、控制、Agent/工作流、执行、数据证据与观测层(1.md 行 9511)。

**驱动脚本**:`scripts/walking_skeleton.mjs`(重跑即重建本目录,幂等,不采信缓存)。

**测试接入**:`tests/scripts/walking_skeleton.test.mjs`(node --test)。

## 链路(全部现有真实命令,非 Demo 旁路)

| 步 | 命令 | 覆盖层 |
|---|---|---|
| WS-1 | `node src/cli/far.ts doctor` | 观测层(环境自检,真实退出码) |
| WS-2 | `node src/cli/far.ts demo` | 执行层(GV14 裁决内核 + legacy UNTESTED 链 + hero 真实 z-test) |
| WS-3 | `node src/cli/far.ts ask "..." --mode quick --export ...` | Agent/工作流(6-stage FSM→裁决→证据链→导出) |
| WS-4 | `node src/cli/far.ts export far-proof --demo-chain --out ... --force` | 数据证据层(claim→FEC→seal→九分量导出) |
| WS-5 | `node src/cli/far.ts verify demo.far-proof` | 独立复算(必需文件+脱敏链+proofHash 复算) |
| WS-6 | `node src/cli/far.ts verify ask.far-proof` | 独立复算(agent 路径 bundle) |

## 诚实声明(防误读)

- 离线 MINIMAL_OFFLINE 模式下 LLM 由 `offline_replay` fixture 适配器提供;证据链、R0-R9 裁决内核、seal、导出、verify 全部为真实生产代码路径。
- 本骨架证明"链路贯通",不证明任何科学结论;legacy demo 链恒为 UNTESTED(诚实标注),真实统计裁决见 hero 链(z-test→CONFIRMED→ASK-9 降级 INCONCLUSIVE)。
- Live LLM 路径属外部合同 IC-14(BLOCKED_EXTERNAL),不在本骨架范围。

## 产物

- `run_log.txt` — 全量命令日志(含退出码)
- `skeleton_evidence.yaml` — 逐步证据登记(命令/退出码/耗时/层映射)
- `demo.far-proof/`、`ask.far-proof/` — 导出 bundle;`ask.far-proof.rundb` — 文件数据库
