# Provider: Qwen / DashScope / 百炼

> **`NEEDS_API_KEY`** —— 本页所有真实推理都**计费**，默认绝不运行。offline demo 与核心门**不**需要它。

## 何时需要

FAR-Lab 的核心是**确定性裁决内核**（R0–R9），**LLM 不参与裁决**。LLM（Qwen）只在以下场景被调用：

- `far ask "<q>" --profile competition_aliyun_qwen` —— 一次性 6-stage FSM，LLM 生成假设/证据
- `far stream "<q>" --profile ...` —— 同上但流式
- `far court "<claim>" --models ...` —— 跨模型法庭（多 LLM）
- `far arena "<hypothesis>" --refuters ...` —— 对抗竞技场
- CI `competition_qwen_smoke`（条件门，无 key graceful skip）

默认 profile 是 `offline_replay`（零密钥·fixture 回放），**不调任何真实 API**。

## 配置

```bash
# 1. 获取 key：阿里云百炼 / DashScope 控制台（https://bailian.console.aliyun.com）
# 2. 写入本地 .env（切勿提交，.gitignore 已忽略）
cp .env.example .env
# 编辑 .env：DASHSCOPE_API_KEY=sk-xxxxxxxx
# 3. 加载（按你的 shell）
export DASHSCOPE_API_KEY=sk-xxxxxxxx      # 或 source .env（若用 dotenv 工具）
```

`far doctor` 会检测 `DASHSCOPE_API_KEY` 是否**已设置且非空**（只检测存在性，**不读取值**）。
未设置只 WARN，不 FAIL。

## 运行

```bash
far ask "Does adapter A beat baseline on TESS-ASTRO?" --profile competition_aliyun_qwen
```

裁决仍由 R0–R9 内核给出（红线：LLM 非裁决者）。LLM 只产出 claim/evidence 候选，内核裁决。

## smoke 测试

```bash
far doctor --live-qwen-smoke     # 显式才调真实 API（复用 ci/competition_qwen_smoke.ts）
```

`--live-qwen-smoke` 是**显式参数**（默认 `far doctor` 零网络）。它会真实调用百炼端点验证连通
（4 模型 + thinking/json_schema 互斥实测）。无 key 时 FAIL 并指引。状态：`NEEDS_API_VALIDATION`
（真实计费调用，截图归档属 `NEEDS_HUMAN_OPERATION`）。

## 红线

- ❌ **不**在 CI / 安装脚本里默认调真实 API（条件门 / 显式参数才调）。
- ❌ **不**自动读取或上传用户密钥。`.env` 仅本地；`far doctor` 只检测存在性。
- ❌ **不**把 offline demo 当 live demo。
- ✅ 真实调用产生的 `request_id` / 成本 / 截图属敏感物（见 [SECURITY.md](../../SECURITY.md)），
  `evidence/dashscope_calls/` 已 gitignore。

## 相关

- adapter 实现：`src/llm_gateway/adapters/aliyun_qwen/`
- CI smoke：`ci/competition_qwen_smoke.ts`
- 配置模板：`.env.example`
