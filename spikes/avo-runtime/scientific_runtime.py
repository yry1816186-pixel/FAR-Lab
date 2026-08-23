"""FAR-Lab Scientific Runtime Sidecar (S7 spike).

Stdio JSON-lines protocol, mirroring experiment-runtime/farlab_experiment_runtime/__main__.py:
Request:  {"id": <int>, "op": <str>, "payload": {...}}
Response: {"id": <int>, "ok": true, "result": {...}} | {"id": <int>, "ok": false, "error": {...}}
Log frame: {"log": "<line>"} -- never a result channel.

Ops:
- ping             -> liveness + runtime info
- inspect_run      -> reads a REAL far.db run (question, hypotheses, evidence
                      relations, experiments) and returns a structured
                      scientific-state summary. Exercises typed-object state,
                      pass-by-reference (db handle held by the process), and
                      deterministic methods.
- plan_next_action -> AVO principle probe: given the run scientific state,
                      CHOOSE the next high-information action (not a fixed
                      stage order). Offline mode uses a deterministic heuristic
                      so the spike is reproducible without an LLM key; this op
                      is where a live LLM plugs in later.
"""
from __future__ import annotations

import json
import sqlite3
import sys
import traceback
from pathlib import Path

RUNTIME_INFO = {
    "runtime": "farlab-scientific-avo",
    "agent_framework": "nooa @ NVIDIA-NeMo/labs-OO-Agents@97f52de",
    "paper_basis": ["arXiv:2607.20709", "arXiv:2603.24517"],
}


def _open_db(payload: dict) -> sqlite3.Connection:
    db_path = payload.get("dbPath")
    if not db_path:
        raise ValueError("payload.dbPath is required")
    p = Path(db_path)
    if not p.is_file():
        raise FileNotFoundError(f"no such db file: {db_path}")
    conn = sqlite3.connect(str(p))
    conn.row_factory = sqlite3.Row
    return conn


def _rows(conn: sqlite3.Connection, sql: str, args: tuple = ()) -> list[dict]:
    return [dict(r) for r in conn.execute(sql, args).fetchall()]


def op_ping(_payload: dict) -> dict:
    return {**RUNTIME_INFO, "ok": True}


def op_inspect_run(payload: dict) -> dict:
    """Read a real run from far.db and build the scientific-state view."""
    run_id = payload.get("runId")
    if not run_id:
        raise ValueError("payload.runId is required")
    conn = _open_db(payload)

    run = _rows(
        conn,
        "select id, question_id, status, current_stage, created_at from runs where id=?",
        (run_id,),
    )
    if not run:
        raise KeyError(f"run not found: {run_id}")
    run = run[0]

    question = _rows(
        conn, "select json from objects where kind='question' and id=?", (run["question_id"],)
    )
    q_text = ""
    if question:
        q_text = json.loads(question[0]["json"]).get("text", "")

    hypotheses = [
        json.loads(r["json"])
        for r in _rows(
            conn,
            "select json from objects where kind='hypothesis' and run_id=? limit 50",
            (run_id,),
        )
    ]
    evidence_counts = _rows(
        conn,
        "select json_extract(json,'$.relation') as relation, count(*) as n "
        "from objects where kind='evidence_relation' and run_id=? group by relation",
        (run_id,),
    )
    experiments = [
        json.loads(r["json"])
        for r in _rows(
            conn, "select json from objects where kind='experiment_spec' and run_id=?", (run_id,)
        )
    ]
    events_tail = _rows(
        conn, "select at, type from events where run_id=? order by seq desc limit 10", (run_id,)
    )

    return {
        "run": run,
        "questionText": q_text,
        "hypothesisCount": len(hypotheses),
        "hypothesesPreview": [
            {"id": h.get("id"), "statement": str(h.get("statement", ""))[:160]} for h in hypotheses[:8]
        ],
        "evidenceByRelation": {r["relation"]: r["n"] for r in evidence_counts},
        "experimentSpecs": len(experiments),
        "lastEvents": events_tail,
    }


# Deterministic next-action heuristic -- the OFFLINE stand-in for the agentic
# choice. Priority encodes falsification-loop discipline: untested plans before
# more retrieval; counter-evidence adjudication before confirmation work.
COUNTER_RELATIONS = ("contradicts", "weakens", "fails_to_replicate", "alternative_explanation")


def _choose_next_action(state: dict) -> dict:
    evidence = state.get("evidenceByRelation", {}) or {}
    counter = sum(n for rel, n in evidence.items() if rel in COUNTER_RELATIONS)
    supporting = evidence.get("supports", 0)
    if state["experimentSpecs"] == 0 and state["hypothesisCount"] > 0:
        action, why = "draft_experiment", "top-ranked hypothesis has no preregistered test"
    elif counter > 0 and state.get("run", {}).get("current_stage") not in ("feedback",):
        action, why = (
            "review_counter_evidence",
            f"{counter} counter-evidence relations await adjudication",
        )
    elif supporting > 0:
        action, why = "deepen_evidence", "supporting base exists; seek discriminating evidence"
    else:
        action, why = "retrieve_more", "thin evidence base"
    return {
        "action": action,
        "reason": why,
        "chosenBy": "deterministic-heuristic-v0 (offline; LLM plug-in point is this op)",
        "inputs": {
            "counterEvidence": counter,
            "supporting": supporting,
            "specs": state["experimentSpecs"],
        },
    }


def op_plan_next_action(payload: dict) -> dict:
    state = op_inspect_run(payload)
    return {
        "scientificState": {
            "hypotheses": state["hypothesisCount"],
            "evidence": state["evidenceByRelation"],
        },
        "nextAction": _choose_next_action(state),
    }


OPS = {
    "ping": op_ping,
    "inspect_run": op_inspect_run,
    "plan_next_action": op_plan_next_action,
}


def main() -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            sys.stdout.write(
                json.dumps({"id": -1, "ok": False, "error": {"kind": "protocol", "message": str(exc)}}) + "\n"
            )
            sys.stdout.flush()
            continue
        rid, op = req.get("id", -1), req.get("op")
        handler = OPS.get(op)
        if handler is None:
            sys.stdout.write(
                json.dumps(
                    {
                        "id": rid,
                        "ok": False,
                        "error": {"kind": "unknown_op", "message": f"known: {sorted(OPS)}"},
                    }
                )
                + "\n"
            )
        else:
            try:
                result = handler(req.get("payload", {}))
                sys.stdout.write(
                    json.dumps({"id": rid, "ok": True, "result": result}, ensure_ascii=False, default=str) + "\n"
                )
            except Exception as exc:  # visible failures only -- never swallowed
                tb = traceback.format_exc(limit=6)
                sys.stdout.write(
                    json.dumps(
                        {
                            "id": rid,
                            "ok": False,
                            "error": {
                                "kind": "execution",
                                "message": f"{type(exc).__name__}: {exc}",
                                "traceback": tb,
                            },
                        }
                    )
                    + "\n"
                )
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
