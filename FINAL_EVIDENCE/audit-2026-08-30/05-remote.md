# 远程执行/HPC 审计（2026-08-30，只读）

> 来源：终局接管第一轮并行审计（Explore 子代理，33 次工具调用）。

```
CAP-01 | SSH/远程执行传输与认证 | PASS(限定 localhost 容器目标) | gateway.ts(系统 ssh/scp 子进程)；devices.ts(设备注册表) | 仅 exec 式 OpenSSH；无持久连接/复用；无代理跳板；known_hosts 无 key rotation/revoke 生命周期 | 中 | ControlMaster 复用 + host-key 生命周期流程 | gateway.ts:36-44(StrictHostKeyChecking=yes+BatchMode+专用 known_hosts), devices.ts:13-27
CAP-02 | 远程执行语义 | PARTIAL | remote-executor.ts:137-152; gateway.ts:50-61,109,129 | 输出 execFile 全量缓冲(maxBuffer 16MB)无流式；exec 无重试(仅 probe/putFile 各3次)；运行中无远端健康监测 | 中高 | 流式逐行回收+keepalive 探测 | gateway-discipline.test.ts:8-17 | 退出码 124/137 区分、spec 超时+15s 客户端兜底、remoteTimeoutWrap 已解孤儿进程
CAP-03 | 远程任务 checkpoint/resume | PARTIAL | scheduler.ts:207-243(fence token+heartbeat TTL)、397-459(worker)；executor.ts:336-363(本地 cell 指纹去重) | remote-executor 无 previousCells 指纹去重——远程任务重试=从头重训；失败路径不清扫 /tmp/farlab/<id>；scheduler.ts:19-20 注释声称的指纹缓存重放对远程执行器不成立 | 高 | 把 executor.ts:336 的指纹去重抽共享并接入 remote-executor | 对比 executor.ts:356(cached 查找)与 remote-executor.ts:127(顺序全量) | 本地侧 attempts+dead-letter+requeueDead 完整，drill-4 证据 attempts=2 回收成功
CAP-04 | artifact 传输 | PARTIAL | gateway.ts:63-86(putFile=scp+3次重试) | 仅 scp 单文件上传；无 rsync/sftp/断点续传；传输后无 checksum 校验；结果经 stdout JSON 回收(16MB 上限) | 中 | 传输后 sha256 校验+分块/压缩传输 | gateway.ts:69-84 | scp 参数走 execFile 数组(本地无 shell 注入面)
CAP-05 | 远端 environment fingerprint | PARTIAL | remote-executor.ts:114-117,161-164; python.ts:36-42(本地 uv.lock sha256) | 远端仅记 python 版本+numpy 布尔值，无 lockfile hash；无硬件采集(本地 sidecar 有 env.hardware)；ResultCell 指纹含 device+remotePython(诚实声明同设备确定性) | 中 | 远端 pip freeze/sklearn 版本 hash+硬件指纹入 environment | python.ts:37-42 vs gateway.ts:89-102 | D-086-3 跨设备不声称 bit-identity 诚实声明
CAP-06 | 远端资源配额 | PARTIAL | ssh-target/up.mjs:42-43,68-75(--memory/--cpus)；remote-executor.ts:143-146(超时预算) | 配额完全依赖运维 docker 参数；spec.compute.maxParallel 被远程执行器忽略(纯顺序 for)；无按用户配额/抢占 | 中 | probe 上报远端实际配额入 provenance；尊重 maxParallel | drill-5 证据:512m 容器 cap 触发 exit 124 | rg -n maxParallel 仅 spec-from-plan 默认值
CAP-07 | Slurm/PBS scheduler | FAIL(不存在) | 全仓 rg 仅 RESEARCH_BASELINE.md 文档提及 | 无任何 HPC 工作负载管理器接入 | 高(对 HPC 定位) | 接入点现成:scheduler.ts:409-415 executeVia 钩子 + cli/experiment.ts:117-133 + devices.ts kind 扩 'slurm' | sbatch 提交+squeue 轮询+scancel 取消映射 shouldCancel | devices.ts zod literal('ssh') 为唯一远程 kind
CAP-08 | GPU/CPU capability discovery | FAIL(不存在) | rg gpu/nvidia/cuda 仅 supervisor.ts 博客引用+UI 文案 | probe 只测 python3+numpy；无 nvidia-smi/CPU/内存探测；device 绑定完全人工声明 | 中高 | probe 增加 nvidia-smi/lscpu/mem 采集入 provenance 并驱动 device 匹配 | gateway.ts:89-102 | 无任何 GPU 证据文件
CAP-09 | ACC-25 live_verified 证据强度 | PARTIAL(措辞强于证据) | evidence/r2-10-scientific-execution/(drill-1~5)；tests/{gateway,remote-executor}.test.ts；up.mjs | "real Linux target"实为本机 Docker 容器(node:24-slim+sshd，127.0.0.1)，非物理远端/HPC；ACCEPTANCE_STATUS 引用的 suite-2026-08-26 无持久化 suite 日志；drill 证据时间戳 08-24 | 中(声明精度) | 措辞降为 "containerized Linux target live_verified; physical/HPC untested" + 存档 suite 日志 | 审计实时 docker info → daemon 未运行，测试将诚实 skip | 可复现路径存在且脚本齐全，当前不可复现(BLOCKED_EXTERNAL: Docker Desktop 未启动)
CAP-10 | 远程安全面 | PARTIAL | gateway.ts:120(shellQuote)；Dockerfile(PasswordAuthentication no)；devices.ts(gitignored .far-run/devices.json) | remote-executor.ts:120 mkdir / :215 rm -rf 为未引用插值（当前 id 服务端生成不可注入，属潜在模式）；ed25519 密钥无 passphrase；TOFU 靠 docker exec 带外 | 中 | 所有远端命令统一过 shellQuote；真实主机提供 keyscan+人工确认 | gateway.test.ts:141-150(篡改 host key fail-closed) | 凭据面干净
```

## Top 3 最高杠杆改进

1. **远程指纹去重接入 remote-executor（CAP-03）**：executor.ts:336-363 的 previousCells 逻辑抽共享并在 remote-executor 复用——远程重试从"全量重训"变"cell 级 resume"，同时消除 scheduler.ts:19-20 注释与实现的偏差（唯一一处注释声称与实现不符）。
2. **probe 升级为完整 capability/environment 指纹（CAP-05+08 联动）**：一处改动同时补远端依赖版本 hash、硬件（CPU/GPU/内存）入 provenance，为 Slurm 插件与调度决策提供数据底座。
3. **ACC-25 措辞与证据对齐（CAP-09）**：明确为 "containerized same-host Linux target"；为 suite 运行存档可复查日志；注明复现前置条件。

## 证伪清单（live_verified 声称的证据强度）

- 可证实：gateway/remote-executor 测试为真实路径 e2e（真 docker build、真 sshd、真 scp、真训练、真 MITM 篡改拒绝）；五个 drill 输出含真实 run/job id。
- 已证伪/降级：(1) "real Linux target" ≠ 物理远端——是 127.0.0.1 Docker 容器；(2) suite-2026-08-26 无持久化日志，evidence/ 不存在该产物；(3) 当前不可复现：docker info 连接失败，此刻重跑将 skip 而非 green——"live_verified" 是历史时点属性；(4) remote-executor.test.ts 曾有 ~30% 环境级 flake。
- 无法证伪（设计上诚实）：跨设备 bit-identity 明确不声称；同容器非安全沙箱三处注释一致披露。
