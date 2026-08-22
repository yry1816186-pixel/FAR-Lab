# open-compass 侦察报告（Wave-9，2026-08-22）

**License 已验证**：Apache-2.0（LICENSE 全文，Copyright 2020 OpenCompass Authors）。**正确仓**：`open-compass/opencompass`（`open-compass/open-compass` 不存在）。zread 逐文件实读；未执行上游代码。

## Top 机制

1. **预测/评分分离 + 幂等重评** `opencompass/tasks/openicl_eval.py`（`OpenICLEvalTask.run/_score`）——从 `predictions/` 读 JSON→evaluator 评分→写 `results/`；`if osp.exists(out_path): continue` 幂等跳过。删 results 留 predictions 即可换阈值/judge/统计重评历史产出，零重复推理。
2. **分片合并契约** 同文件 `_load_predictions` + `tools/prediction_merger.py`——`xxx_0.json…` 顺序拼接；离线合并校验 `len(preds)==len(dataset.test)` 长度守恒，mismatch 拒绝。
3. **污染分层评估** `openicl/icl_evaluator/icl_hf_evaluator.py AccContaminationEvaluator`——按 `is_clean` 分桶（clean/input-contam/input-and-label-contam）逐桶打分加前缀输出。
4. **污染标注 join** `datasets/ceval.py`——外部 GPT-4 判定标注（liyucheng09/Contamination_Detector releases）本地缓存，row_id `{name}-{index}` join，未标注 fallback 'not labeled'（显式保留）。
5. **污染分层加权 rollup** `configs/summarizers/contamination.py` + `summarizers/circular.py`——每桶逐子集 weighted_average 对照表。
6. **Min-K% 成员推断** `icl_inferencer/icl_mink_percent_inferencer.py` + tmp 检查点续跑（需 logprobs，FAR-Lab 适用面有限）。
7. **summary_groups 通用 rollup** `summarizers/default.py`——指标白名单定序+跨模型指标集一致性 assert+缺指标显式 `{'error': 'missing metrics'}` 不静默。
8. **Prompt-hash 溯源** `utils/prompt.py get_prompt_hash`——归一化 infer_cfg 的 sha256，摘要表每行 6 位指纹列。
9. **n-replica + G-Pass@k** `icl_evaluator/icl_base_evaluator.py compute_g_pass_at_k`——超几何 survival function（需自实现 sf，纯确定性数学）。
10. **指标确定性纪律** `HuggingfaceEvaluator.score`——算前 save random state→seed(0)→算后恢复；HF 指标 vendor 本地加载。
11. **judge 换位 double 判** `partitioners/sub_naive.py`（infer_order∈{random,double,None} 断言）+ `tasks/subjective_eval.py`（judgement 翻倍+偶数长度断言）。
12. **judge prompt 契约族** `datasets/subjective/mtbench.py`（pair_v2/pair_math_v1/single_v1）——反位置偏置明示措辞+按类别附 reference+`[[A]]/[[B]]/[[C]]` 强制契约。
13. **多 judge → meta-judge 两段** `replicate_tasks_with_judge_models` + meta_judge——每 judge 判决独立落盘（`judged-by--{judge}` 目录），meta 读取全部再裁决（`summarized-by--`），两阶段各自可 resume。
14. **解析率守门** `summarizers/subjective/utils.py get_judgeanswer_and_reference`——解析失败丢弃，提取数 <95% 总数 → 醒目告警 "please check!"。
15. **本地优先数据 + MD5 完整性** `utils/datasets.py get_data_path`（绝对路径直通/COMPASS_DATA_CACHE/DATASET_SOURCE=ModelScope 开关）+ `utils/fileio.py`（md5/sha256 校验+原子临时文件）。

## 关键诚实声明

- **仓内无 n-gram/embedding 污染检测实现**——其污染能力=外部预计算标注 join + 分层评估器 + Min-K%/PPL（需 logprob）。n-gram/embedding 检测需自研或另寻来源。
- retry 语义=「resume-by-artifact」（输出存在性跳过，三处一致）而非 in-flight retry。
- `ceval_clean_ppl.py` 的 `analyze_contamination=True` 消费方未追踪到（UNVERIFIED）。

## FAR-Lab 融合

已融合（等价物）：judge-variance replay 即预测/评分分离重放层；votesFailed 计数即解析率守门等价。
DEFERRED：污染分层汇报（需先标 GT/语料污染位，W-P2 候选）；换位 double 判+meta-judge（live 3-vote 升级）；分片长度守恒（大规模跑分时）。
