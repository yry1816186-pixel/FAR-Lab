# OSS 尽调：安全沙箱类（EEL 实验执行车道对照）

- 日期：2026-08-22。方法：Funnel A+B 只读尽调（GitHub API 实测、LICENSE 原文核验、zread 源码/文档读取、Microsoft Learn 官方文档），未安装未执行任何被调研项目。
- 调研人 Agent：OSS 尽调子 Agent（沙箱类）。证据等级：文中每条关键事实标注来源；未核验处显式标 UNVERIFIED。

## 0. 对照基线：KEEP 现行方案（D-084 + D-087，注意基线已演进）

本地 `.control/DECISIONS.jsonl` 实读（2026-08-22）：

- **D-084**：远程执行目标 = 构建机上 Docker Desktop/WSL2 下的 Linux 容器；网关把容器当真实 SSH 边界（key 认证、host-key 校验、最小权限用户）。
- **D-087**（新于本尽调任务书的描述）：网关传输已从 vendored ssh2 npm 包改为 **system OpenSSH 子进程（ssh/scp）**，理由是保持产品 zod-only Node 运行时不变量 + 规避 Windows 原生 libssh2 构建风险；**已在真实容器 live 验证**（远程 sklearn 训练 + numpy bootstrap + 篡改 host key 被拒，tests/gateway.test.ts 5.5s 绿）。

能力面（≤10 行）：OpenSSH 子进程网关 → Docker/WSL2 Linux 容器内执行 ExperimentSpec 生成的统计代码；`experiment-runtime/` 为隔离 sidecar（uv lockfile 锁版，ACC-25 环境钉版已实现）；超时/kill 由调度面（far-scheduler.db 在途）负责；kill-resume 验证待做；网络出域最小化（只放行数据集源与包源）为目标态、实现面待定。**基线不含快照/pause 原语、不含 per-domain egress 白名单、不含 metrics 计量**——这三点是与成熟沙箱项目的差距面，也是本次尽调的对照重点。

## 1. e2b-dev/E2B（+ e2b-dev/infra）——裁定：**REFERENCE**

### 1.1 事实（Funnel A）

| 项 | 事实 | 来源 |
|---|---|---|
| 许可 | E2B 主仓 LICENSE 原文核验 = **Apache-2.0**（Copyright 2023 FoundryLabs, Inc.）；infra 仓 GitHub API license = Apache-2.0 | LICENSE 文件全文实读；GitHub API 2026-08-22 |
| 活跃度 | E2B 主仓 13,516 stars、pushed 2026-08-22（当日）、约 58+ contributors（API 分页计数）；最新 release `e2b@2.45.0`（2026-08-21）。infra 仓 1,337 stars、pushed 2026-08-22、约 59+ contributors | GitHub API 实测 |
| 架构 | 主仓 = SDK monorepo（js-sdk/python-sdk/cli + envd 协议 spec + templates）；**基础设施在独立仓 e2b-dev/infra**（Go 服务 + Terraform + Nomad/Consul + Firecracker）。`self-host.md` 原文："E2B is using Firecracker for Sandboxes" | zread 仓库结构实读；self-host.md 全文实读 |

### 1.2 关键能力证据（Funnel B，`packages/js-sdk/src/sandbox/sandboxApi.ts` 全文实读）

- **生命周期/超时**：`SandboxLifecycle = { onTimeout: 'pause' | 'kill'（默认 kill）, autoResume?（仅 pause 时可 true）}`；`setTimeout` → `POST /sandboxes/{id}/timeout` 可动态延长/缩短；默认 `timeoutMs = 300_000`（5 分钟）；状态机 `Running --timeout(onTimeout=pause)--> Paused --connect()--> Running`。
- **pause/快照（kill-resume 语义）**：`pause()` → `POST /sandboxes/{id}/pause`（409=已暂停→优雅返回 false）；`createSnapshot()` → `POST /sandboxes/{id}/snapshots`，原文注释："The sandbox will be paused while the snapshot is being created. The snapshot can be used to create new sandboxes with the same state. The snapshot is a persistent image that survives sandbox deletion."；快照可列/可删（SnapshotPaginator / deleteSnapshot）。
- **网络出域控制**（对本车道最对口的能力）：`SandboxNetworkOpts = { allowOut?: string[] | (ctx)=>string[]（CIDR/IP/hostname 数组）, denyOut?, rules?（per-domain 规则+header transform）}`；`allowInternetAccess: false` 语义 = `denyOut: ['0.0.0.0/0']`（**默认 true**，反面即我们的默认应收紧）；`updateNetwork` → `PUT /sandboxes/{id}/network` 运行中原子替换 egress 配置；`ALL_TRAFFIC='0.0.0.0/0'` 常量在 `packages/js-sdk/src/sandbox/network.ts`。
- **metrics**：`SandboxMetrics { cpuUsedPct, cpuCount, memUsed, memTotal, memCache, diskUsed, diskTotal, timestamp }` 时间序列接口。
- **envd 守护进程**：容器内 agent（Connect-RPC over HTTP/2，filesystem/process 服务、健康探测、超时错误映射 TimeoutError）。

### 1.3 自持部署的真实成本（self-host.md 全文实读）

- 前置：Cloudflare 账号 + Cloudflare 域名 + PostgreSQL + Packer + Terraform 1.7.5 + Docker/Buildx；可选 Grafana/Posthog。
- "E2B is using Firecracker" + 原文排障条目："**Firecracker requires bare metal or nested virtualization support**"；AWS 部署要求 region "must support nested virtualization for Firecracker"。
- AWS 默认节点池：3x t3.medium（Nomad/Consul servers）+ t3.xlarge（API/ingress/proxy/loki）+ **m8i.4xlarge（Firecracker orchestrator，嵌套虚拟化）** + m8i.2xlarge（build）+ t3.xlarge（ClickHouse）≈ 7 台云 VM + 拉起的 Nomad/Consul/Redis/Loki/OTel 全家桶。GCP 路线配额：≥2500G SSD + 24 CPU。
- **hosted 服务**（api.e2b.app + API key）是 SDK 的默认路径；自持需 SDK 传 `domain`。

### 1.4 与 KEEP 差异表 + 裁定

| 维度 | KEEP（ssh/scp + Docker/WSL2） | E2B |
|---|---|---|
| 隔离原语 | Docker 容器（共享 WSL2 内核） | Firecracker microVM（独立 guest 内核） |
| 部署面 | 单机已 live 验证 | 7+ 云 VM + Cloudflare + Postgres + Nomad 集群 |
| KVM 依赖 | 无 | 必须（裸金属或嵌套虚拟化）→ WSL2 默认不可用 |
| 生命周期 | kill（调度面） | kill/pause/autoResume/timeout 动态续期 |
| 快照/resume | 无原语 | createSnapshot（持久镜像，跨删除复活） |
| 网络出域 | 目标态待实现 | allowOut/denyOut + per-domain rules + 运行时原子更新 |
| 供应链 | ssh2 已移除（D-087），面极小 | TS SDK 本身干净，但自持 infra 引入 Terraform/Nomad/Consul/ClickHouse 巨面 |

**裁定：REFERENCE。** 理由：(a) 自持部署成本与单用户 WSL2 环境完全不成比例，违反最小充分架构原则；(b) Firecracker 硬依赖 KVM/嵌套虚拟化，宿主默认不满足；(c) hosted SaaS 依赖 = 竞赛合规/数据出境风险（产品需可自持）；(d) 但其 **SDK 的生命周期/快照/egress API 语义是同类中最完整且 Apache-2.0 可自由借鉴的设计**，直接抄语义到 Docker 车道（见 §8 借鉴点）。
**反转触发**：竞赛合规/威胁模型升级为"完全不可信任意代码 + 强隔离证明"；或拿到裸金属 Linux 云机且需要横向多租户沙箱——届时 E2B infra 或 Kata/Firecracker 路线重开。

## 2. microsandbox（现 superradcompany/microsandbox）——裁定：**DEFER**

### 2.1 事实（Funnel A）

| 项 | 事实 | 来源 |
|---|---|---|
| 仓库转移 | **github.com/microsandbox/microsandbox 已 301 重定向至 `superradcompany/microsandbox`**（API Moved Permanently → repository id 867192625）。治理变更信号：项目所有权/组织变更 | GitHub API 实测 2026-08-22 |
| 许可 | LICENSE 原文核验 = **Apache-2.0** | LICENSE 全文实读 |
| 活跃度 | 7,859 stars、created 2024-10-03（<2 年）、pushed 2026-08-22（当日）、约 53 contributors、最新 release **v0.6.13**（2026-08-21，0.x 阶段）、open issues 73 | GitHub API 实测 |
| 架构 | Rust workspace（cli/core/portal/server/utils），libkrun microVM + smoltcp 用户态网络栈，OCI 镜像兼容，`msb server`（自持，文档标 BETA）；TS SDK 存在（`npm install microsandbox`，sdk/javascript + docs/references/typescript-sdk.md 全文实读） | zread 结构 + 文档实读 |

### 2.2 关键能力证据（Funnel B）

- **生命周期/超时/资源**（typescript-sdk.md 全文实读）：`PythonSandbox.create()/start(image, memoryMB, cpus, timeoutSec)/stop()`；`run(code, {timeout})`；`command.run(cmd, args, timeoutSec)`；`metrics.cpu()/memory()/disk()/isRunning()`；REPL 状态跨 `run` 持久。默认 memory 512MB、cpus 1、启动超时 180s。
- **快照/resume：不存在公开 API。** 三语言 SDK 参考文档（typescript/rust/python）均无 snapshot/pause/resume 方法；README "Warm Workers: Snapshot a toolchain" 为愿景性示例。存在性 UNVERIFIED（可能内部能力，但非公开契约）。
- **网络出域控制：粗粒度。** MSB_V_DOCKER.md 原文："Simplified network controls — `local`, `public`, `any`, or `none`"（4 档 scope，Sandboxfile `scope` 字段）；**无 per-domain/IP 白名单文档证据**（zread 全文档搜索 "network outbound egress firewall" 零结果）。对"只放行数据集源与包源"的细粒度需求不匹配。
- **宿主要求**（SELF_HOSTING.md 全文实读）：macOS 需 Apple Silicon；**Linux 需 KVM virtualization enabled**（原文，链接 issue #224）；**Windows 标注 "Coming soon!"**（链接 issue #47）——与 README 宣称的 "Windows 10+ (WHP)" 矛盾。issue #47（2024-11 开）已关闭并链接 PR #1019（WHP 后端），但文档未更新，落地成熟度 UNVERIFIED。
- **供应链面**：安装脚本 `curl -sSL https://get.microsandbox.dev | sh`；libkrun 为自建脚本构建（scripts/build_libkrun.sh）；deny.toml（cargo advisory）存在。

### 2.3 与 KEEP 差异 + 裁定

| 维度 | KEEP | microsandbox |
|---|---|---|
| 隔离原语 | Docker（共享内核） | libkrun microVM（独立内核，KVM/Hypervisor.framework） |
| 宿主可行性 | 已 live 验证 | Linux 需 KVM → WSL2 默认不可用；Windows 原生"coming soon"未落地文档 |
| 快照/resume | 无 | 无公开 API |
| 网络 | 目标态待实现 | 4 档 scope，无 per-domain |
| TS 集成 | 自有 gateway | npm SDK 完整 |

**裁定：DEFER。** 理由：(a) 0.x + 仓库组织刚转移（治理/持续性不确定度中高）；(b) Linux KVM 硬需求撞上 WSL2 默认无 /dev/kvm（见 §5 环境事实）；(c) 无快照/resume 公开 API、网络控制粒度不足，替换 Docker 的收益不覆盖成本；(d) TS SDK 与资源限制设计可作为未来参考。
**反转触发**：(a) 执行宿主迁至裸 Linux 服务器（KVM 可用）且威胁模型升级；(b) 项目出 1.0 + Windows/WHP 支持文档化落地 + per-domain egress 或 snapshot API 出现。

## 3. google/gvisor ——裁定：**REFERENCE**（≤10 行定位）

- Apache-2.0，19,136 stars，pushed 2026-08-22，约 317+ contributors（Google 维护，GitHub API 实测）。
- 定位：用户态"应用内核"（Go 实现 Linux 接口，拦截于应用与宿主内核之间），非 seccomp 过滤器、非传统 VM；要求 Linux 5.6+、x86_64/ARM64。
- 对本车道的意义：**runsc 可作为 Docker 的替代 runtime**（保持 Docker/OCI 接口不变获得更强内核隔离），且其非 KVM 平台模式理论上可在无嵌套虚拟化的 WSL2 内运行——具体平台（systrap/ptrace）在 WSL2 内核的兼容性 UNVERIFIED（本次按要求未深读）。
- 用途：KEEP 方案若未来需升级隔离原语，runsc 是改动面最小的路径（换 runtime 而非换编排栈）。

## 4. firecracker-microvm/firecracker ——裁定：**REFERENCE**（≤10 行定位）

- Apache-2.0，36,205 stars，pushed 2026-08-21，约 255+ contributors（AWS 维护，GitHub API 实测）。
- 定位：开源 VMM，用 KVM 创建 microVM（容器级速度 + 硬件虚拟化隔离）；**Linux-only 宿主、KVM 必须**，生产测试基线为裸金属 EC2（Intel/AMD/Graviton）。
- 对本车道：它是 E2B 的底层原语；在 WSL2（默认无 /dev/kvm）内不可用；仅作为"强隔离原语谱系"的上界参考。

## 5. 宿主环境事实：WSL2 内 KVM 可用性（所有 microVM 方案的共同闸门）

- Microsoft Learn 官方文档（learn.microsoft.com/en-us/windows/wsl/wsl-config）：`.wslconfig` 存在 `[wsl2] nestedVirtualization` 设置，控制是否向 WSL2 VM 暴露虚拟化扩展（VMX/SVM），这是 `/dev/kvm` 工作的前提。
- 社区证据：嵌套虚拟化官方支持 Windows 11 / Windows Server 2022+；默认关闭；AMD 宿主有历史性 SVM 暴露问题（microsoft/WSL#4193 长期跟踪）。
- **结论：默认状态下 WSL2 内无 /dev/kvm → Firecracker/microsandbox/Kata/QEMU-microVM 全部不可用；启用需用户改 .wslconfig + 重启 WSL + Win11 + CPU 支持。本机（用户构建机）实际可用性 UNVERIFIED（尽调为只读，未探测）。** 这是"KEEP Docker"裁定最硬的环境约束证据。

## 6. 补扫候选

### 6.1 daytonaio/daytona ——裁定：**REJECT**

- 71.9k stars（GitHub 页面）但 README 原文声明 **"This repository is no longer maintained"（2026-06 起开发转入私有代码库）**；GitHub API `license: null`，**根目录仅 README.md + assets，无 LICENSE 文件**（contents API 实测）——README 所称 "under the LICENSE" 的许可文件在仓库中不存在，法律上默认版权保留，不可安全复用。
- Quick Start 依赖 hosted app.daytona.io（账号+API key）；隔离原语未明示（"dedicated kernel" 措辞）。
- 结论：无许可文件 + 停止维护 + 核心私有化 + hosted 依赖，四重否决。无反转触发（除非官方重新开源并补许可）。

### 6.2 kata-containers/kata-containers ——裁定：**REFERENCE**

- Apache-2.0，8,586 stars，pushed 2026-08-22，约 326+ contributors（GitHub API 实测）；"轻量 VM 表现如容器"，containerd shimv2 runtime，可与 Docker/K8s 容器管理器集成。
- 需硬件虚拟化（Intel VT-x / AMD SVM，`kata-runtime check` 自检）；hypervisor 选项含 QEMU/Firecracker/dragonball → 同样撞 WSL2 无 KVM 闸门。
- 用途：与 gvisor runsc 同为"Docker 接口不变、隔离升级"的未来路径选项，且是 CNCF 治理的成熟项目；记录备查，不改变当下决策。

### 6.3 modal ——裁定：**REJECT**（任务书已排除）

闭源商业 hosted 平台（无自持能力、数据出境、按量付费），与"竞赛产品需自持可部署"冲突。直接排除，不再展开。

## 7. 每仓裁定汇总

| 仓库 | 许可 | 活跃度 | 隔离原语 | KVM 依赖 | 裁定 |
|---|---|---|---|---|---|
| e2b-dev/E2B (+infra) | Apache-2.0（原文核验） | 极活跃（当日 push，v2.45.0） | Firecracker microVM | 必须 | **REFERENCE**（API 语义借鉴） |
| superradcompany/microsandbox | Apache-2.0（原文核验） | 活跃但 0.x + 仓库转移 | libkrun microVM | Linux 必须 | **DEFER** |
| google/gvisor | Apache-2.0 | 极活跃 | 用户态内核（runsc） | 非必须（平台相关，UNVERIFIED） | **REFERENCE** |
| firecracker-microvm/firecracker | Apache-2.0 | 极活跃 | KVM microVM | 必须 | **REFERENCE** |
| daytonaio/daytona | 无 LICENSE 文件 | 已停止维护 | 未明示 | 未知 | **REJECT** |
| kata-containers/kata-containers | Apache-2.0 | 极活跃 | 轻量 VM（shimv2） | 必须 | **REFERENCE** |
| modal | 闭源商业 | — | hosted | — | **REJECT**（任务排除） |

## 8. 净结论

**EEL E5 远程执行不需要比 Docker 更强的隔离原语：KEEP（ssh/scp + Docker/WSL2 + lockfile sidecar），辅以对 E2B API 语义的局部借鉴。** 依据：

1. **威胁模型不匹配**：执行的是本产品生成的统计代码（sklearn 管线 + 第三方数据集加载），非完全不可信的任意恶意代码；主要风险是意外资源耗尽与意外出域，cgroup/namespace + 超时 kill + 出域白名单已覆盖。microsandbox MSB_V_DOCKER.md 列举的容器逃逸 CVE（CVE-2024-23653/21626、CVE-2023-27561、CVE-2024-26584）是共享内核面的真实风险清单，但对应威胁场景（对手级攻击者构造的镜像/构建上下文）超出当前 EEL 面。
2. **环境硬约束**：全部 microVM 方案（E2B/Firecracker/microsandbox/Kata）依赖 KVM/嵌套虚拟化，WSL2 默认不可用（§5），启用需用户侧系统配置且未验证；Docker 路线已 live 验证（D-087）。
3. **工程成本不成比例**：E2B 自持 = 7+ 云 VM + Cloudflare + Postgres + Nomad/Consul 全家桶；对单用户工作区是负收益复杂度。

### 具体借鉴点（KEEP 内落地，均有真实出处）

1. **超时状态机语义**（E2B `sandboxApi.ts` 的 `SandboxLifecycle`）：`onTimeout: 'kill' | 'pause'`（默认 kill）+ 可动态续期 `setTimeout` + 默认 5 分钟——映射到 far-scheduler 的 deadline 设计：硬 kill 超时 + 运行中可续期 + pause 档位。出处：`packages/js-sdk/src/sandbox/sandboxApi.ts`（GitHub: e2b-dev/E2B）。
2. **快照/resume 分层语义**（E2B `createSnapshot` 注释原文：快照期间源暂停、快照是可跨删除复活的持久镜像）——kill-resume 验证设计照此分层：轻档 = `docker pause/unpause`（cgroup freezer，进程驻留）；重档 = `docker commit` + 新容器（即 E2B "snapshot → create 同状态新沙箱" 语义）。CRIU 全状态 checkpoint 在 WSL2 内核的可用性 UNVERIFIED，不作依赖。
3. **出域控制模型**（E2B `SandboxNetworkOpts`）：默认收紧（E2B 默认 `allowInternetAccess: true` 的反面）、`allowOut/denyOut` 接受 CIDR/IP/hostname 数组、运行中原子更新（`PUT /sandboxes/{id}/network`）——我们的白名单模型直接采用"默认 deny-all + 显式 allowOut 列表（OpenML 源 + PyPI 源）"，Docker 实现面：internal network + 出站代理/iptables。出处：同文件 + `packages/js-sdk/src/sandbox/network.ts`。
4. **metrics 计量字段**（E2B `SandboxMetrics`：cpuUsedPct/memUsed/memCache/diskUsed + timestamp）——StatReport 的资源计量字段参考（`docker stats` 可取同语义数据）。
5. **升级路径备案**：若威胁模型升级，改动面最小的隔离升级是 **gvisor runsc 换 Docker runtime**（无需 KVM、接口不变），其次 Kata（需 KVM）——已在本报告 §3/§6.2 备案，不需要当下行动。

### 全局反转触发（何时重开沙箱类决策）

- EEL 执行面开始运行完全不可信的第三方/用户上传代码（非模型生成统计代码）；
- 宿主迁至裸金属 Linux / KVM 可用环境；
- 竞赛合规明确要求强隔离证明；
- 我们实际栈中命中容器逃逸类 CVE。
