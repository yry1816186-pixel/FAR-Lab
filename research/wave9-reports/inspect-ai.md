# inspect_ai 侦察报告（Wave-9，2026-08-22）

**License 已验证**：MIT, Copyright (c) 2024 UK AI Security Institute（LICENSE 全文实读）。仓库已迁 `UKGovernmentBEIS/inspect_ai`（zread 未索引，源码经 raw.githubusercontent.com 逐文件带行号读取；未执行任何上游代码）。

## Top 机制（file:line 实读）

1. **model_graded_qa judge 三件套** `src/inspect_ai/scorer/_model.py:101-313` — 模板化 judge + CoT-first + regex verdict；完整 prompt/回复存 `Score.metadata.grading`（L283-293）审计留痕。
2. **Grade 越界拒绝 + last-match 防 CoT 注入** `_model.py:213-230,273-282,369-397` — permissive regex 取最后一个 GRADE（greedy `.*` 防 reasoning 内注入劫持，L220-225 注释明确此向量）；verdict 越界 → None → unscored，绝不静默 fallback。
3. **Score.unscored NaN 三态** `scorer/_metric.py:114-134` + `log/_log.py:745-750` — judge 失败/拒答 ≠ 0 分；scored/unscored 分开计数。
4. **异构 judge panel** `_model.py:148-176` — `model=[m1,m2,m3]` + `multi_scorer(mode)`；与同模型 3-vote（采样方差）正交。
5. **Reducer 库** `scorer/_reducer/reducer.py:12-161` — mode/at_least(k)/pass@k（Codex arXiv:2107.03374 无偏公式 L146-148）。
6. **krippendorff_alpha** `scorer/_metrics/krippendorff.py:84-210` — nominal/ordinal/interval；ordinal 匹配 1-5 Likert；kappa 的多 judge 泛化。
7. **ci metric** `scorer/_metrics/std.py:168-255` — t 区间（cluster 下 clusters-1 自由度）+ cluster bootstrap（整簇重采样）；t_inv_cdf 手工实现不依赖 scipy。
8. **ScoreEdit/Score.history** `_metric.py:64-112` — 评分修订链不覆写。
9. **score() 存量重打分** `_eval/score.py:79-150,500-534` — 换 judge/scorer 对已完成 log 离线重评，新旧分共存。
10. **eval_set 矩阵 + cell 复用** `_eval/evalset.py:140-206,873-943,1223-1256` — manifest 记 (task,model) cell；epochs/reducer/shuffle 漂移检测后未变 cell 复用。
11. **retry_on_error + error_retries 留痕** `_eval/task/run.py:2447-2510`。
12. **fail_on_error 三态错误预算** `_eval/task/error.py:5-60` — bool/比例/绝对数。
13. **Epochs(n,reducer) 重复与聚合解耦** `_eval/task/epochs.py:4-29`。
14. **model_role "grader" 角色解耦** `_model.py:41,83-88`。
15. **aggregate(key,agg) 缺值三态** `scorer/_metrics/aggregate.py:17-60` — on_missing error/skip/zero；skip 改变 stderr 分母的陷阱有明示。

## 关键判定

- **bootstrap 无 seed**（`std.py:48` 裸 np.random.choice）——反面教材，FAR-Lab seeded 层严格更优，不照抄。
- **无第一方 CI gating**（无官方 Action/score-regression 工具）——社区自建模式，与 FAR-Lab completion-gate 同构，无需移植。

## FAR-Lab 融合（主 Agent 决策）

已融合：at_least/mode reducer、krippendorff（nominal/ordinal）、unscored 计数语义。
DEFERRED（live 后）：异构 panel+α、eval_set 矩阵、score() 重打分产品化、t 区间/cluster bootstrap 变体。
