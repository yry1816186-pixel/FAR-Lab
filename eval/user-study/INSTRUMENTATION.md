# User Study Instrumentation Map (FA-EVAL-02)

How each preregistered measure is derived from artifacts the system ALREADY
records — no new telemetry surface was added for the study (that would be
instrumentation theater); every number below traces to an existing durable
record.

| Measure | Source of truth | Derivation |
|---|---|---|
| Task success (per journey) | run export per session (runs/events/objects via `far export`) + live checklist | experimenter verifies the §3 criteria against the exported artifacts; binary per PROTOCOL.md |
| Time-to-task-completion | session CHECKLIST.md timestamps (card visible / participant declares done) | wall-clock subtraction; blocking-failure journeys excluded and disclosed |
| Journey C verify | `far verify` on the participant's export bundle | exit code + check list pasted verbatim into the checklist |
| Intervention count | CHECKLIST.md live log | count of experimenter interventions, with reason tags (blocking-failure vs none-other) |
| SUS / TLX / Likert | questionnaire forms (paper or local form file) | manual transcription into RESULTS.md aggregate; raw forms stay in sessions/<id>/ |
| Run-level context | receipts (provider/model/latency), event timeline | appended as context columns in RESULTS.md to interpret times (e.g. model latency share) |

**Honest limits:** no eye-tracking, no keystroke telemetry, no automated
time-on-task (participants declare done; declaration moments are recorded by the
experimenter, not by the app). Run artifacts prove WHAT was produced, not HOW
the participant got there — that is what the checklist + notes are for.
