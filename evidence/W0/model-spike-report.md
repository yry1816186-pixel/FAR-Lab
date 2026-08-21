# W0 Model Spike Report — Model Execution Plane 可达性探测

- **日期**: 2026-08-21（UTC 2026-08-21T10:29:32Z canonical run）
- **执行环境**: Windows 10 (26200) x64, Git Bash, Node v24.14.0, 原生 fetch（无 HTTP 客户端依赖）
- **脚本**: `spikes/model-spike/probe.mjs`（ESM，可重跑，`--provider zai|deepseek|relay|all`）
- **canonical 证据文件**: `spikes/model-spike/runs/2026-08-21T10-29-32-646Z-all.json`（含全部原始响应 sha256）
- **复现命令**: `node spikes/model-spike/probe.mjs --provider all`（退出码 0 = 至少一个 provider 产出 schema-valid 的 live chat 调用）
- **密钥安全**: 所有 key 仅显示前 6 字符 + 长度；key 值未进入任何文件/日志

---

## 1. Z.ai / GLM（ZHIPU_API_KEY，`494667...`，49 字符）

### 1.1 模型列表

| 请求 | HTTP | 延迟 | 结果 |
|---|---|---|---|
| `GET https://api.z.ai/api/paas/v4/models` | 200 | — | OK，9 个模型 |
| `GET https://open.bigmodel.cn/api/paas/v4/models` | 200 | — | OK，同样 9 个模型 |
| `GET https://api.z.ai/api/paas/v3/models`（v3 旧路径） | 404 | — | 路径不存在 |

列出的模型（两域一致）：`glm-4.5, glm-4.5-air, glm-4.6, glm-4.7, glm-5, glm-5-turbo, glm-5.1, glm-5.2, glm-5.3`

### 1.2 结构化调用（BLOCKED：余额不足）

对 `POST {base}/chat/completions`（model=glm-4.5，T1 prompt-only 与 T2 `response_format=json_object` 各一次，两 base 共 4 次调用）全部返回：

- `https://api.z.ai/api/paas/v4` → HTTP **429**，`{"error":{"code":"1113","message":"Insufficient balance or no resource package. Please recharge."}}`
- `https://open.bigmodel.cn/api/paas/v4` → HTTP **429**，`{"error":{"code":"1113","message":"余额不足或无可用资源包,请充值。"}}`

### 1.3 相邻路径证据（非 OpenAI 兼容，补充记录）

`~/.zcode/v2/config.json` 显示本 key 同时配置在 coding-plan（Anthropic 协议）端点。实测：

- `POST https://open.bigmodel.cn/api/anthropic/v1/messages`（x-api-key 认证，glm-4.6）→ HTTP **429**，code **1310**：`您已达到每周/每月使用上限，您的限额将在 2026-08-22 10:03:58 重置`

**含义**: key 认证有效（否则 401），coding-plan 订阅存在但额度耗尽，**2026-08-22 10:03:58 后可重测**；paas/v4（OpenAI 兼容）路径则是独立计费的余额不足，充值后即可用。

### 1.4 结论

**BLOCKED（live chat）**: 认证通过、模型目录可列（证明 key 与路由有效），但两条 OpenAI 兼容路径均因 code 1113 余额不足无法产生 live 调用。属账户状态问题，非协议/网络问题。

---

## 2. DeepSeek（DEEPSEEK_API_KEY，`sk-947...`，35 字符）

### 2.1 模型列表

- 命令: `node spikes/model-spike/probe.mjs --provider deepseek`（并入 canonical all-run）
- `GET https://api.deepseek.com/models` → HTTP **200**，116 ms
- 模型（3 个）: `deepseek-v4-flash, deepseek-v4-pro, deepseek-v4-flash-vision-exp`
- 注意: 请求 `model=deepseek-chat` 时服务端实际路由到 **deepseek-v4-flash**（响应 `model` 字段回显），`deepseek-chat` 仍是有效别名。

### 2.2 结构化调用证据（T1/T2 均一次通过）

| 测试 | 模式 | HTTP | 延迟 | responded model | usage (p/c/t tokens) | finish | 响应体 sha256 | JSON 解析 | schema 校验 |
|---|---|---|---|---|---|---|---|---|---|
| T1 | prompt-only 严格 JSON 指令 | 200 | 2962 ms | deepseek-v4-flash | 124 / 248 / 372 | stop | `2f7f16f588c1bc204be1064d8094bf844cc97563f722004607c07a5afd539d10` | 直接 `JSON.parse` 成功 | **SCHEMA_VALID**（0 错误、0 多余字段） |
| T2 | `response_format={"type":"json_object"}` | 200 | 2563 ms | deepseek-v4-flash | 144 / 218 / 362 | stop | `9df33459b93e19e8d3eb292d388b66d1e5527ecf7b7df1e12e3994716209883d` | 直接 `JSON.parse` 成功 | **SCHEMA_VALID**（0 错误、0 多余字段） |

固定 schema（4 字段）: `hypothesis`(非空 string) / `confidence`(0–1 number) / `supporting_evidence`(≥2 项 string 数组) / `falsification_test`(非空 string)。两次调用均无 markdown 围栏、无多余文本、无额外字段，temperature=0.2。

### 2.3 失败行为（故意错误模型名）

`model="nonexistent-model-probe"` → HTTP **400**，OpenAI 风格错误信封：
`{"error":{"message":"The supported API model names are deepseek-v4-pro, deepseek-v4-flash, and deepseek-v4-flash-vision-exp, but you passed nonexistent-model-probe.","type":"invalid_request_error","param":null,"code":"invalid_request_error"}}`
（错误可编程消费：含 type/code 字段，且消息直接列出合法模型名。）

### 2.4 结论

**REACHABLE + LIVE_VERIFIED**: 当前环境唯一产出真实 live 调用证据的 provider。结构化输出在 prompt-only 与原生 json_object 两种模式下均 100% 严格通过 schema 校验；延迟 ~2.6–3.0 s/次；用量字段完整。

---

## 3. RELAY 网关（RELAY_API_KEY，`sk-kKk...`，51 字符）— base URL 探测

### 3.1 发现线索来源

1. `~/.zcode/v2/config.json`（仅提取 URL，key 全程遮蔽）: 有 `https://api.z.ai/api/anthropic`、`https://zcode.z.ai/api/v1/zcode-plan/anthropic`、`https://api.deepseek.com/anthropic`、`https://open.bigmodel.cn/api/anthropic`、`https://token.nuaa.edu.cn/v1/messages`，**无任何 51 字符 key 对应的 provider，无 OpenAI 兼容 relay base URL**
2. 环境变量: `ZCODE_BASE_URL=https://zcode.z.ai`、`ZAI_BUSINESS_BASE_URL=https://api.z.ai`、`https://chat.z.ai`
3. `task_plan.md` L27-28: RELAY_API_KEY 为中转网关，base URL 明确标注「待 W0 探测」，且无 DASHSCOPE_API_KEY
4. `~/.zcode/v2/acp-traffic-proxy/captures/*.ndjson`、历史会话转录: 无 relay URL 记录

### 3.2 候选探测结果（全部失败）

| 候选 base | 请求 | 结果 |
|---|---|---|
| ZCODE_BASE_URL | `GET https://zcode.z.ai/v1/models` | HTTP 404（Next.js 站点 404 页，非 API） |
| ZCODE_BASE_URL | `GET https://zcode.z.ai/api/v1/models` | HTTP 404（同上；`/api/v1/zcode-plan/*` 亦 404） |
| 常见命名 | `GET https://relay.z.ai/v1/models` | **DNS NXDOMAIN**（域名不存在） |
| 常见命名 | `GET https://api.relay.z.ai/v1/models` | **DNS NXDOMAIN** |
| z.ai paas 域 | `GET https://api.z.ai/api/paas/v4/models` | HTTP 401 `token expired or incorrect`（key 不被识别） |
| bigmodel 域 | `GET https://open.bigmodel.cn/api/paas/v4/models` | HTTP 401（同上） |
| z.ai coding 域 | `GET https://api.z.ai/api/coding/paas/v4/models` | HTTP 401（同上） |
| config 中的校园中转 | `GET https://token.nuaa.edu.cn/v1/models` | HTTP 483 + HTML WAF 拦截页（校外网络不可达） |

### 3.3 结论

**BLOCKED**: 8 个候选 base 全部不可达/不识别该 key，且本地所有配置源（ZCode config、环境变量、workspace 文档、流量捕获、会话转录）均无该 relay 的 base URL 记录。**Qwen 系列因此无法在本环境 live 验证**（`qwen-max/qwen-plus/qwen3` 未在任何可达模型目录中出现；z.ai 目录 9 个模型全为 GLM 系，DeepSeek 目录 3 个全为 DeepSeek 系）。解除路径：向 key 发放方索取 base URL，或申请 DASHSCOPE_API_KEY 直连百炼。

---

## 4. 结论表

| Provider | 认证 | OpenAI 兼容可达性 | live 结构化调用 | 结构化输出可靠性 | Qwen |
|---|---|---|---|---|---|
| DeepSeek | 有效 | **REACHABLE**（api.deepseek.com） | **LIVE_VERIFIED**（T1+T2 双通过，usage/sha256 齐全） | 2/2 直接 JSON.parse + schema 零错误；400 错误信封可编程消费 | 无 |
| Z.ai / GLM | 有效（列模型 200） | 端点可达但 **BLOCKED**（429/1113 余额不足；coding-plan 1310 限额 2026-08-22 10:03 重置） | 无（不可伪造） | 未测到（无 live 输出） | 无 |
| RELAY | 未知（无 base 可验证） | **BLOCKED**（8 候选全败：404/NXDOMAIN/401/483） | 无 | 未测到 | **不可验证** |

## 5. 对 R1 生产路由的建议（基于本次实证）

1. **R1 生产主干唯一 live 可用路由 = DeepSeek**（`https://api.deepseek.com`，`deepseek-chat` 别名 → deepseek-v4-flash，另有 deepseek-v4-pro 可选）。结构化输出双模式可用，建议生产优先 `response_format=json_object`（T2 略快且协议保证更强），prompt-only 作为降级。错误处理按 `{error:{message,type,code}}` 信封编程。
2. **Z.ai/GLM 作为第二路由保留适配器**：协议层已验证可达（列模型 200），充值 paas/v4 或等待 coding-plan 限额重置（2026-08-22 10:03:58）后重跑 `probe.mjs --provider zai` 即可补齐 live 证据。
3. **Qwen/百炼路径按 BLOCKED 如实标注**：保留 relay/dashscope 适配器接口位，不伪造 live 证据；拿到 base URL 或 DASHSCOPE_API_KEY 后一条命令补测。
4. Model Execution Plane 的 usage/receipt 字段设计可直接依赖 DeepSeek 实测字段形状：`model`（实际路由模型名）、`usage.{prompt,completion,total}_tokens`、`choices[0].finish_reason`，均稳定存在。

## 6. 证据与复现

- 脚本: `spikes/model-spike/probe.mjs`
- canonical run（三 provider 全量探测 + 全部响应 sha256）: `spikes/model-spike/runs/2026-08-21T10-29-32-646Z-all.json`
- 同期 stdout/stderr: `runs/final-stdout.json`、`runs/final-stderr.txt`（逐 provider 进度日志）
- 历史: 首轮按 provider 分跑的退出码实测为 zai=2、deepseek=0、relay=2；其 run 文件已被 canonical all-run 取代并清理，本文以 all-run 为唯一证据源
- canonical run 退出码: **0**（DeepSeek live 调用成功）
- 重放注意: Z.ai coding-plan 限额 2026-08-22 10:03:58 (UTC+8) 重置后，`node spikes/model-spike/probe.mjs --provider zai` 可直接复测；RELAY 候选表已固化在脚本中，拿到 base URL 后向 `probeRelay()` 的 `candidates` 追加即可
