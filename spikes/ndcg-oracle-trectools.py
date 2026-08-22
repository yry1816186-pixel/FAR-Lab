"""W6 metric-oracle cross-validation: compute nDCG@k with trectools (BSD-3) over the
SAME fixtures tests/retrieval-baseline.test.ts hand-computes, plus randomized cases.
Prints one JSON line per case: {name, k, trectools_ndcg}. Never touches secrets."""
import json
import random

from trectools import TrecRun, TrecQrel

def ndcg_pair(ranked_ids, qrels, k):
    import pandas as pd
    qid = "q0"
    run = TrecRun()
    run.run_data = pd.DataFrame(
        [[qid, "Q0", d, i + 1, float(len(ranked_ids) - i), "oracle"] for i, d in enumerate(ranked_ids)],
        columns=["query", "q0", "docid", "rank", "score", "system"],
    )
    qr = TrecQrel()
    qr.qrels_data = pd.DataFrame(
        [[qid, "Q0", d, rel] for d, rel in qrels.items()],
        columns=["query", "q0", "docid", "rel"],
    )
    res = run.get_ndcg(qr, {k}, remove_unjudged_docids=False)
    return float(list(res.values())[0][0])

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
    print(json.dumps({"name": name, "k": k, "trectools_ndcg": round(ndcg_pair(ranked, qrels, k), 10)}))
