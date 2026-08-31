# RELEASE_OPERATIONS.md — 发布与运维细则

> 读取时机：build / 打包 / 版本化 / 发布 / 部署 / 回滚 / 跨平台 / 工件完整性。Kernel 在根 AGENTS.md；本文件防止"本地测试通过"被误认为"已经发布"。

## 1. 环境阶梯（必须区分并如实标注）

| 环境 | 含义 | 验证最低要求 |
| --- | --- | --- |
| local | 本机开发运行 | 单元/聚焦测试 |
| development | 开发者联调环境 | 集成测试 |
| integration | 组件联通验证 | 集成 + 契约 |
| staging | 发布前完整演练 | 完整验收 + 数据演练 |
| release candidate | 候选版本 | 完整验收 + 独立审计 |
| production/release | 正式交付 | 发布验收 + 回滚预案 |

"本地跑通了"只能写 local，禁止越级宣称 production-ready 或"已发布"。

## 2. Build 与打包

- 构建可复现：锁文件、固定 Node/工具版本、无环境依赖的构建命令。
- 构建失败 = 发布失败；CI/脚本中构建错误必须阻断。
- 打包产物清单化：包含什么、排除什么（凭据/缓存/本地配置）。
- 安装/构建脚本审查后才执行（供应链纪律见 RELIABILITY_SECURITY.md）。

## 3. 版本化与 Changelog

- 采用一致、可解释的版本策略（语义化版本优先但非强制）；破坏性变更必须显式标注并与兼容/迁移策略一致。
- Changelog 记录行为变更（用户可见）与技术变更；与版本绑定。
- 版本号是发布事实，不随心情改。

## 4. 兼容性与迁移

- 破坏性变更前：兼容策略（双写/迁移窗口/弃用警告）明确并测试。
- 数据迁移：备份、可回滚、幂等、失败恢复；迁移脚本必须先在副本上验证。
- 对外契约（API/schema/协议）版本化；隐藏破坏性变更 = 缺陷。

## 5. 回滚

- 每个发布有回滚路径：旧版本可用、数据兼容、回滚步骤文档化。
- 回滚是发布流程的一部分，不是事后补救；无法回滚的发布必须提前声明风险。

## 6. 部署与跨平台

- 部署步骤确定化（脚本/清单），不依赖口头步骤。
- 跨平台差异（路径、shell、换行、编码、权限、Node 可用性）在目标平台实测，不假定。
- 远程/SSH/WSL 环境：插件与工具链不自动跟随，须重新验证（见 ZCODE_SETTINGS.md）。

## 7. 工件完整性

- 发布工件校验：哈希、清单、签名（如适用）；下载/拷贝后校验再使用。
- ReproducibilityBundle（科研交付）：脚本、数据、环境、种子、版本锁定，独立复现通过才算完整。

## 8. 依赖锁定与可复现

- 生产依赖锁定版本；构建环境固定（engine 字段/容器描述）。
- 可复现性验证：同一提交 → 同一产物（或列出已知非确定性源）。

## 9. 发布验收

- 发布前检查：验收门禁（`completion-gate.mjs`）、关键路径实测、回滚演练、已知 blocker 清单、残留风险声明。
- 发布记录写入 `.control/DECISIONS.jsonl` 或等价记录：版本、时间、范围、验证证据、回滚预案。

## 10. 本工作区的接线

- 如果正式施工开始时尚未初始化 Git，则建立仓库后再决定 pre-commit/CI 接线；`secret-scan.mjs` + `path-hygiene.mjs` 可作为提交/发布前检查，CI 有真实价值时加入 build/typecheck/相关测试/门禁。
- 未接 CI 前，发布动作由本文件流程 + 脚本人工执行，如实标注验证等级。
- 竞赛发布路径必须满足当前官方规则要求的模型调用方式，属于正式 release 合规要求；提交材料组装本身不是产品 runtime。

## 11. FAR-Lab 当前源码发布闭环

- 权威版本：根 `package.json`；Web、TUI、Python runtime、desktop npm/Tauri/Cargo
  必须同版，规则见 `VERSIONING.md`。发布标签必须是与之完全一致的 annotated
  `vMAJOR.MINOR.PATCH`，且 `CHANGELOG.md` 同版本节必须已有 ISO 日期；
  `UNRELEASED` fail closed。
- `node scripts/export-public.mjs` 只接受 clean Git tree。允许清单必须包含产品声明的
  root/Web/TUI/Python/desktop 腿；自检在复制后的目录内分别执行，原工作区预装依赖不能
  充当副本可用证据。
- 托管 `release-pack` 先等待 verify、浏览器矩阵、dependency audit 和多语言 CodeQL，
  再生成 CycloneDX SBOM、规范化 `.tar.gz`、逐文件 manifest 与 `SHA256SUMS`。
- 源码归档的路径顺序、mtime、uid/gid 与 pax 时间字段固定；同一提交应产生相同归档。
  SBOM 会记录扫描器版本/生成时间，是已声明的非确定性文件，但其精确字节受
  `SHA256SUMS` 与 SBOM attestation 约束。
- GitHub Actions OIDC 生成 build provenance 与 SBOM 两份签名 attestation；工作流随后
  用 `gh attestation verify` 真验 archive 与 `SHA256SUMS`。验证 bundle 作为自签名文件
  随发布物附带；不得再改写已被 attestation 绑定的 `SHA256SUMS`，从而避免签名循环。
- manual dispatch 只产生 attested release candidate artifact。只有通过上述门的 tag build
  才执行 `gh release create`；desktop 安装包在签名/updater/卸载闭环关闭前不进入该发布物。
- 消费者先对 `SHA256SUMS` 运行 `gh attestation verify`，再执行 `sha256sum --check`，
  并对 archive 单独验 attestation；可信源码树中的
  `node scripts/verify-release-artifacts.mjs <下载目录>` 进一步逐字节对照内容 manifest。
  回滚到上一已签名标签；
  若有数据迁移，必须先执行该版本 changelog 中另列的回滚演练，不能只替换二进制。
