"""W6 metric-oracle cross-validation via pytrec_eval — the SAME library BEIR
delegates nDCG to (beir/retrieval/evaluation.py:98-101, ndcg_cut.<k>).
Runs the exact fixtures from tests/retrieval-baseline.test.ts (hand-computed)
plus 10 seeded-random rankings; prints JSON lines for the TS-side comparison."""
import json
import random

import pytrec_eval

def oracle_ndcg(ranked_ids, qrels, k):
    run = {"q0": {d: float(len(ranked_ids) - i) for i, d in enumerate(ranked_ids)}}
    qr = {"q0": {d: int(r) for d, r in qrels.items()}}
    ev = pytrec_eval.RelevanceEvaluator(qr, {"ndcg_cut." + str(k)})
    return ev.evaluate(run)["q0"]["ndcg_cut_" + str(k)]

cases = [
    ("ideal_abc_k3", ["a", "b", "c"], {"a": 3, "b": 2, "c": 1}, 3),
    ("ideal_abc_k10", ["a", "b", "c"], {"a": 3, "b": 2, "c": 1}, 10),
    ("reversed_k3", ["c", "b", "a"], {"a": 3, "b": 2, "c": 1}, 3),
    ("late_hit_xa_k2", ["x", "a"], {"a": 3, "b": 2, "c": 1}, 2),
    ("early_hit_ax_k2", ["a", "x"], {"a": 3, "b": 2, "c": 1}, 2),
    ("no_relevant", ["x", "y"], {"a": 1}, 2),
    ("empty_qrels", ["x", "y"], {}, 2),
]
rng = random.Random(42)
for n in range(10):
    ids = [f"d{i}" for i in range(8)]
    rng.shuffle(ids)
    qrels = {d: rng.randint(0, 3) for d in ids}
    cases.append((f"rand{n}", ids, qrels, rng.choice([3, 5, 8])))

for name, ranked, qrels, k in cases:
    print(json.dumps({"name": name, "k": k, "pytrec_ndcg": round(oracle_ndcg(ranked, qrels, k), 10)}))
