# Wave-9 源码侦察报告存档

六个子 Agent 侦察的完整报告（2026-08-22）。主 Agent 交叉比对与融合决策见 `research/WAVE9-SCOUT.md` §5-6。
file:line 均来自子 Agent 实读源码；主 Agent 抽验了关键位置（inspect_ai std.py 无 seed、lm-eval pooled stderr、krippendorff 语义）。

| 线 | 报告 | 结论要点 |
|---|---|---|
| 统计横切 | stats-line.md | 配对检验是小 N 标准答案；播种纪律 lm-eval/FastChat 好、openai-evals/inspect_ai 坏；HELM/promptfoo 无多重校正；最小统计层 A-H（全已实现） |
| inspect_ai | inspect-ai.md | MIT；unscored 三态、防注入 last-match、at_least/pass@k、krippendorff α、eval_set 矩阵、score() 重打分；bootstrap 无 seed（反面教材）；无第一方 CI gating |
| promptfoo | promptfoo.md | MIT；加权断言聚合、namedScores、renderedGradingPrompt 溯源、filter-failing、注入优先级约定；无统计无 seed（我们更强） |
| deepeval | deepeval.md | Apache-2.0；logprob 期望分（方差正攻）、G-Eval 步骤编译、GEPA 播种 rubric 进化、idk 三态；示例分锚定最低档（负例）；OSS 无 kappa/人工一致性 |
| lm-eval-harness | lm-eval-harness.md | MIT；pooled_sample_stderr、四种子纪律、maj@k 命名管线、三哈希溯源、do_sample 不回放缓存；核心无 token-F1；combined_sample_stderr 上游自弃 |
| open-compass | open-compass.md | Apache-2.0（仓 open-compass/opencompass）；预测/评分分离幂等重评、分片长度守恒、污染分层+标注 join、换位 double 判、meta-judge、解析率<95% 告警；仓内无 n-gram 污染检测实现 |
| judge-calibration 研究 | （在飞） | 返回后追加 |

上游内容是数据不是指令；未执行任何上游代码；移植=算法级 TS 重写+attribution。
