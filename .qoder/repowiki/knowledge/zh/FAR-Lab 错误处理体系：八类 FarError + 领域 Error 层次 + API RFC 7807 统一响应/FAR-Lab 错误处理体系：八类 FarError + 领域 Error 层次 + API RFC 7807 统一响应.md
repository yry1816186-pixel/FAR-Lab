---
kind: error_handling
name: FAR-Lab 错误处理体系：八类 FarError + 领域 Error 层次 + API RFC 7807 统一响应
category: error_handling
scope:
    - '**'
source_files:
    - src/platform/errors.ts
    - src/api/errors/error_handler.ts
    - src/api/server.ts
    - src/falsifiability/errors.ts
    - src/math/errors.ts
    - src/anti_theater/errors.ts
    - tests/api/error_handling.test.ts
    - tests/platform/config_error.test.ts
---

## 1. 总体方案

仓库采用**分层错误模型**：
- **平台层（SSOT）** `src/platform/errors.ts` 定义统一的 `FarError` 对象、八类错误分类、CLI exit code 映射、消息脱敏与机器可读的 `ERROR_CATALOG`。
- **领域层** 各子系统维护独立的 `Error` 子类层次（如 `FalsifiabilityError` / `MathVerificationError` / `AntiTheaterError`），用于表达业务不变量违反。
- **API 层** `src/api/errors/error_handler.ts` 提供 `ApiError` 及 `notFound/badRequest/internalError/serviceUnavailable` 构造器，并通过 Fastify 的 `setErrorHandler` 将全部异常收敛为 RFC 7807 Problem Details 子集 `{ error_code, message, source_anchor, detail? }`，Content-Type 固定为 `application/problem+json`。

## 2. 关键文件与包

| 文件 | 职责 |
|---|---|
| `src/platform/errors.ts` | 八类 `ERROR_CLASSES`、`buildFarError`、`classifyErrorClass`、`retryableFor`、`exitCodeFor`、`redactErrorMessage`、`serializeFarError`、`ERROR_CATALOG`、`verifyErrorCatalog` |
| `src/api/errors/error_handler.ts` | `ApiError`、4xx/5xx 构造器、Fastify `errorHandler` |
| `src/falsifiability/errors.ts` | 裁决域 `FalsifiabilityError` 及其子类（`FalsifiabilityGateError`、`EmptyScopeSlipError`、`EmptyUntestedReasonError`、`UnknownVerdictError`、`ConfirmedEvidenceMissingError`） |
| `src/math/errors.ts` | 数学验证域 `MathVerificationError` 及其子类（`FatalMathError`、`InvalidBackendResultError`） |
| `src/anti_theater/errors.ts` | 反剧场测试域 `AntiTheaterError` 及其子类（`AntiTheaterInputError`、`AntiTheaterInvariantError`） |
| `src/api/server.ts` | 注册 `app.setErrorHandler(errorHandler)`，并在 `/api/v1` preSerialization hook 中禁止对 4xx+ 响应二次包装 |
| `tests/api/error_handling.test.ts` | 验证 `ApiError` 携带 `source_anchor`、404/400/500 行为、`application/problem+json` 内容类型 |
| `tests/platform/config_error.test.ts` | 覆盖八类枚举、`buildFarError` 脱敏/序列化、`classifyErrorClass` 启发式、`verifyErrorCatalog` 目录一致性 |

## 3. 架构与约定

### 3.1 平台层 `FarError`（ENG-ERROR-001）
- **八类枚举**：`transient`、`permanent`、`degraded`、`policy_blocked`、`invalid_input`、`unsupported_version`、`budget_exhausted`、`fatal_integrity`。
- **不可变契约**：通过 Zod `FarErrorSchema` 校验，强制 `code` 为 SCREAMING_SNAKE、`message` 经 `redactErrorMessage` 脱敏、`retryable` 由 `cls` 推导（禁止对象自带矛盾值）、`cause` 仅一层引用。
- **确定性序列化**：`serializeFarError` 递归排序 key，保证同对象同串。
- **分类启发式**：`classifyErrorClass` 基于 `httpStatus`、`errorName`、文本模式（429/rate/timeout、schema validation、budget、unsupported version、corrupt/tamper/integrity、policy blocked）保守映射到类别 + 稳定 code + remediation；未知信号回退到 `permanent`。
- **CLI exit code 映射**：`invalid_input→2`、`policy_blocked→7`、`degraded→3`、其余→1，与既有 CLI 约定对齐。
- **错误目录**：`ERROR_CATALOG` 是机器可读契约，`verifyErrorCatalog` 校验 code 唯一、SCREAMING_SNAKE、remediation 非空；新增错误必须登记。

### 3.2 领域层 Error 层次
每个核心域（falsifiability、math、anti_theater）独立定义 `XxxError extends Error` 基类及具体子类，语义集中在注释中说明（如 `DEGRADED_SCOPE` 必须附带 scope-slip、`CONFIRMED` 必须有证据）。这是**纯 throw 模式**（非 Result/Outcome），与平台层 `FarError` 解耦——领域错误在边界处被转换为 `FarError` 或 API 错误。

### 3.3 API 层统一响应
- `ApiError` 携带 `statusCode`、`errorCode`、`sourceAnchor`（fileId/stageId/callRecordId 三元定位，24 红线）。
- Fastify `errorHandler` 优先级：`ApiError` → `ZodError`（400 VALIDATION_FAILED）→ ajv `validation`（400 VALIDATION_FAILED）→ 429 RATE_LIMITED → 兜底 500 INTERNAL_ERROR。
- 所有错误响应使用 `application/problem+json`，禁止裸 `{ error: "..." }`。
- `/api/v1` preSerialization hook 对 4xx+ 不二次包装成功信封，确保 RFC 7807 错误不被吞掉。

### 3.4 调用路径
路由内部主动抛 `ApiError`（如 `evidence.ts` 中的 `notFound('evidence', id)`、`new ApiError({...})`），由全局 `errorHandler` 捕获并格式化；领域层抛出的领域 `Error` 应在边界处被捕获并转换为 `FarError` 或 `ApiError`。

## 4. 约定与约束

- **零容忍合规**：所有错误相关文件注释声明“无 any / @ts-ignore / 桩代码返回”，测试断言覆盖分支。
- **消息脱敏**：`buildFarError` 构造时强制调用 `redactErrorMessage`，密钥形状检出即整体替换为 `[redacted: ... detected in error message]`。
- **fail-closed**：未知 verdict 字符串抛出 `UnknownVerdictError`；`CONFIRMED` 缺证据抛出 `ConfirmedEvidenceMissingError`；配置未知键拒绝。
- **重试性 SSOT**：`retryableFor` 是唯一来源，`transient`/`degraded` 可重试，其余不可重试。
- **目录即契约**：新增错误码必须登记到 `ERROR_CATALOG`，CI 可通过 `verifyErrorCatalog` 检查。
- **HTTP 状态码与错误码一一对应**：404→NOT_FOUND、400→BAD_REQUEST/VALIDATION_FAILED、429→RATE_LIMITED、500→INTERNAL_ERROR、503→SERVICE_UNAVAILABLE。
- **source_anchor 必填**：所有 `ApiError` 必须携带 fileId/stageId/callRecordId 三元定位，便于审计追踪。
- **测试覆盖**：`tests/api/error_handling.test.ts` 验证 `ApiError` 结构、`tests/platform/config_error.test.ts` 覆盖八类枚举、脱敏、序列化、分类启发式与目录一致性。