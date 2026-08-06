# 11 · 生产化：Docker、安全边界、CI、供应链

> 学习目标：理解 FAR-Lab 如何从"能跑的 demo"走向"可部署的系统"；
> 掌握 Docker 镜像的设计决策；理解安全边界（secrets/模型中立/供应链）；
> 理解 7 个 CI workflow 各守什么门。
> 前置：08。产出：能解释"为什么默认镜像不需要 API key"这个设计决策。
> 代码：Dockerfile / docker-compose.yml / .github/workflows/。

---

## 11.1 生产化哲学：offline-first

FAR-Lab 的生产化有一条贯穿性红线：**默认完全离线，零凭据**。

- Docker 默认跑 `far demo tess-offline`——不需要任何 API key。
- 真实 LLM provider **只能**通过 `docker compose --env-file .env up`
  显式注入密钥（Dockerfile 注释原话："红线：绝不默认读取"）。
- `far doctor` 对缺失 key 只 WARN 不 FAIL——离线体验永不中断。

为什么？因为验证层必须**独立于任何商业 API 而工作**。一个验证系统如果
没有 API key 就跑不起来，那它本身就不可验证。

## 11.2 Docker 镜像设计（Dockerfile）

```
FROM node:24-slim
  + git ca-certificates build-essential python3   ← native 编译兜底
  + corepack enable + pnpm 10.29.3
  + COPY 源码 + pnpm install
CMD ["node", "src/cli/far.ts", "demo", "tess-offline"]
```

设计决策（注释里有完整论证）：
1. **保留 build-essential + python3**：better-sqlite3 优先 prebuilt binary，
   但 prebuild 网络失败时 node-gyp 需要本地编译链。移除会破坏兜底
   （实测：prebuild 网络失败 → node-gyp 无 Python → install 失败）。
2. **固定 pnpm 版本**：`corepack prepare pnpm@10.29.3 --activate`——
   供应链确定性（和 package.json `packageManager` 字段一致）。
3. **两个服务**（docker-compose.yml）：`far-demo`（一次性离线演示）、
   `far-api`（常驻 API @ :3000）。

## 11.3 安全边界（SECURITY.md + 代码）

| 层 | 机制 |
|---|---|
| **密钥** | `.env` 被 gitignore；提交密钥是硬规则（检测+吊销流程）；SECURITY.md §44-73 |
| **模型中立** | 内核无 qwen/dashscope 字面量（F3/C1 红线）；LLM 只生成不裁决 |
| **供应链** | pnpm.overrides 固定 CVE 版本；`check-supply-chain.mjs` 门禁；security-audit.yml 每周审计+签名 |
| **验证器净化** | AST 结构门：verifier 模块带顶层网络/IO/LLM 调用 → 加载即拒（05 章） |
| **授权** | JWT 中间件（api/auth/）；rate-limit；helmet |

> 学习点：**"模型中立"是安全边界而不是政治正确**——如果内核代码里出现
> provider 字面量，就说明裁决路径依赖特定供应商，可复现性被破坏。
> 所以它被写成 F3/C1 红线并由 CI 扫描强制。

## 11.4 CI：7 个 workflow 各守一门

| Workflow | 守什么门 |
|---|---|
| `ci.yml` | 主门：typecheck + lint + 全量测试 + 覆盖率门 |
| `build-integrity.yml` | 构建完整性：包结构、导出产物可验证 |
| `depth-evidence.yml` | 深度证据门：关键路径测试 |
| `depth-gate.yml` | 深度门禁 |
| `entry-protocol-check.yml` | 入口协议检查 |
| `security-audit.yml` | 每周依赖审计 + 签名验证 |
| `release.yml` | 发布流水线（release 资产 + install.sh） |

用户本地等价物：`pnpm run smoke-core`（test + test:py）。

## 11.5 供应链加固（2026-08-05 批次 1-A）

- `.npmrc save-exact` + package.json 精确版本固定（无 ^ 漂移）
- `scripts/check-supply-chain.mjs`：检查锁文件对齐/精确版本/CVE
- 已知 CVE 通过 `pnpm.overrides` 修复（brace-expansion / find-my-way / fast-uri，
  均 DoS 类，patch 级）
- `pnpm audit`：0 known vulnerabilities（基线实测）

## 11.6 动手练习

1. `docker compose up far-demo`（如有 Docker）——观察零凭据离线演示。
2. 读 `SECURITY.md` §44-73，说出 3 条密钥硬规则。
3. 跑 `node scripts/check-supply-chain.mjs`，看供应链门禁输出。
4. （进阶）读 `ci.yml`，画出 CI 的步骤依赖图。
5. （进阶）`docker compose up far-api`，curl `/health` 和 `/ready`。

## 自测

- [ ] 能解释为什么默认镜像不需要 API key（offline-first 红线）
- [ ] 知道 Dockerfile 为什么保留 build-essential + python3
- [ ] 能说出 3 层安全边界（密钥/模型中立/供应链）
- [ ] 知道 7 个 workflow 各守什么门
- [ ] 能跑供应链门禁并解释输出

→ 下一步：[12 扩展指南](12_EXTENDING.md) —— 加检测器/加种子/加命令。
