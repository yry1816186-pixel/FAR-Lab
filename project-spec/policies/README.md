# `project-spec/policies/` — 按需读取的工程细则

> 常驻规则在根 `AGENTS.md`（Kernel），本目录只放"进入领域才读"的细则。**不要**在任务开始时整目录加载；只加载任务实际进入的领域。每项规则只有一个权威位置：本目录不复制 AGENTS Kernel，AGENTS 不展开本目录细则。

## 读取时机（Load Map）

| 任务进入的领域 | 读取文件 |
| --- | --- |
| 重大架构 / 大型重构 / 行为退化 / 独立评审 | `ENGINEERING_CONDUCT.md` |
| 任何用户接触面：Web / Desktop / CLI / 终端 / 报表 / 可视化 | `PRODUCT_HCI.md` |
| 写测试、评估方案、基准、验收验证 | `TESTING_EVALUATION.md` |
| 科研推理、引用、证据链、研究方案、假设评分 | `SCIENTIFIC_TRUTH.md` |
| 失败处理 / 重试 / 并发 / 安全 / 秘密 / 可观测性 | `RELIABILITY_SECURITY.md` |
| build / 打包 / 发布 / 部署 / 回滚 / 版本化 | `RELEASE_OPERATIONS.md` |

跨域任务只读取相关章节；每份 Policy 内部按章节组织，可只读相关节。

## 与 Kernel 的边界

- AGENTS.md：每轮施工必须记住的不变量（真实、证据、完成、优先级、架构、UX、失败、安全、科学）。
- Policy：展开的领域规则、禁止清单、检查清单——默认不注入，进入领域才读。
- `zcode-harness/scripts/`：确定性规则的可执行实现（secret 扫描、路径卫生、完成门禁）。
- `.control/`：动态执行状态（状态、门禁、blocker、决策），不存规则。

## 维护纪律

- Policy 超长（>250 行）→ 去重、合并、压缩；失去触发价值 → 删除。
- 新失败模式重复出现两次以上 → 先在对应 Policy 记录，再评估是否升级为确定性检查。
- 规则不得在 AGENTS、Policy、Skill、`.control` 之间重复出现。
