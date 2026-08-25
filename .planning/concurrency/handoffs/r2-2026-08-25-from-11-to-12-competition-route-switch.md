# Handoff 11 → 12: competition route 开关的 API/设置面暴露

- **Urgency:** medium（功能已可用，缺产品面）
- **Requested by:** lane 11 (model-plane), 2026-08-25
- **Owner:** lane 12 (platform-data-api: src/server/api.ts, settings surface; UI 呈现再由 12 → 01 转手)

## Requested change

lane 11 在 `src/app/provider-resolver.ts` 落地了 opt-in 竞赛路由门（R2 交付）：

- meta key `competition_route_mode`（`COMPETITION_ROUTE_META_KEY`，值 `'on'` / 删除=off）
- 读写 API：`readCompetitionRouteMode(store)` / `writeCompetitionRouteMode(store, on)`
- 语义：ON 时 `resolveRunProvider` 对解析出的每条路由（主配置+全部声明的 fallback）
  强制官方规则（Qwen 家族模型 + `*.aliyuncs.com` 百炼端点）；违规或未选配置 →
  返回 fail-closed `competition-route-gate` provider（可见 provider_error，绝不静默换路，
  并封死 env-chain 默认 zai 的合规泄漏）。OFF（默认）= 完全旧行为。每次解析重读 meta，
  设置修改对 live run 下一 stage 立即生效。

请 12 暴露到通用 settings API（与 `workspace_spend_limit_usd` 同层），语义建议：
`GET` 返回 `{competitionRouteMode: 'on'|'off'}`；`PUT` 幂等写。UI（01）应展示为
「竞赛提交路由（仅千问 via 百炼）」开关，并在 ON 时对不合规的当前默认配置给出前置警示
（判定函数 `competitionViolationOf` 目前为模块私有；如需共享可请 11 导出）。

## Tests / evidence

tests/competition-route-gate.test.ts（12 用例，offline SQLite）已覆盖：OFF=旧行为、
ON 各违规分支、fallback 链完整性、no-config 封堵、run 级配置优先、开关联动即时生效。
