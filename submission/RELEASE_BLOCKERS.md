# RELEASE_BLOCKERS.md — release/submission blocker list (live as of 2026-08-27)

Single published gap list for release readiness. Dynamic per-item acceptance detail stays in
`.control/ACCEPTANCE_STATUS.json` (never published); this file is the release-facing view and
is updated by lane 15 at governance milestones.

## Blockers (release-blocking)

| ID | Blocker | Owner | Needed action | State |
| --- | --- | --- | --- | --- |
| B-QWEN-LIVE-ROUTE | ACC-02 (target live_verified, at tested): competition-mandated Qwen-via-Bailian live route with receipts does not exist; original DeepSeek live evidence superseded (DeepSeek banned in project) | user (credential) + lane 11 (route) | user provides Bailian/DashScope credential; one real-route run with provider/model/request receipts captured (调用凭证/截图) | OPEN — external; no fabrication allowed; live-API policy forbids spending any key "to feel sure" |
| S-1 | 技术方案文档 PDF (≤20 pages, adjudicated 2026-08-25) | drafts + agent updates, user approves | user final review + print | DRAFTED — v3 (2026-08-27, @486fe73) aligned with the Research Map architecture (§5 rewritten from the retired sidebar/brief flow; case-G evolution note; trust surfaces restated at their real locations); rendered to submission/技术方案文档.pdf, still 5 pages; awaiting user review; after B-QWEN lands only the live-route line needs updating |
| ~~ACC-40~~ | RESOLVED 2026-08-27: lineage projection rebase landed; ACCEPTANCE_STATUS shows ACC-40 at target (`tested`) with 12/12 lineage tests green — kept here as a strikethrough record, no longer release-blocking | — | — | RESOLVED |

## User-owned submission actions (not engineering blockers; deadline 2026-09-05)

- ≤10 分钟演示视频 (演示归用户 policy).
- 网盘 upload + 链接/提取码/上传时间截图 attachment doc.
- 盖章报名表 PDF (info must match the registration system exactly).
- Final package naming 学校-姓名-作品名-联系电话; submit via https://survey.aliyun.com/apps/zhiliao/A4e_qqNGu.

## Explicitly NOT blockers (recorded to prevent re-litigation)

- Page-limit 30-vs-20 discrepancy: ADJUDICATED ≤20 (COMPETITION.md, 2026-08-25). Re-open only on new official text.
- Live-API testing policy: offline/deterministic validation is the norm; the ONLY allowed live spend is the B-QWEN-LIVE-ROUTE receipt run above (and user-designated debug keys, which do not satisfy ACC-02).
- Public release allowlist (`zcode-harness/public-release-manifest.json`): excludes competition-strategy and workspace-fact material by design; not an omission.
