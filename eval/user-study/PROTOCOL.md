# FAR-Lab User Study — Preregistered Protocol (FA-EVAL-02)

> Status: **DEVELOPED, EXECUTION BLOCKED_EXTERNAL** — participants and the drive
> are user-owned (mission §5: user feedback outranks self-verification). This file
> is preregistered BEFORE any participant session; deviations must be recorded in
> `DEVIATIONS.md` with reasons, never silently absorbed.
> Instrument artifact mapping: see `INSTRUMENTATION.md`.

## 1. Research questions

- RQ1 (usability): Can researchers complete real FAR-Lab golden-journey tasks
  without experimenter intervention? (task success rate)
- RQ2 (perceived usability): SUS score after the session (0–100).
- RQ3 (efficiency): Wall-clock time from task card to the study-defined
  completion criterion (time-to-task-completion), per journey.
- RQ4 (insight quality, exploratory): On Journey B/C outputs, do participants
  rate the system's evidence/hypothesis artifacts as useful (1–5) — collected as
  perception only, NOT as scientific-validity evidence.

## 2. Participants

- n ≥ 3 researchers (target 5); any domain; must NOT have contributed to FAR-Lab.
- Screening: can read zh or en; basic familiarity with literature tools.
- Recruitment materials: `MATERIALS.md` §1 (script + consent form).

## 3. Design

Within-subject, fixed order (Journey A → B → C), one session per participant,
60–90 min, screen + interaction recorded with consent; think-aloud optional.
Order is fixed (not counterbalanced) because the journeys build on each other
(A's corpus feeds B/C); this is recorded as a deliberate limitation (§8).

### Tasks (from the mission's Golden Journeys; cards in MATERIALS.md §2)

- **Journey A (question → plan)**: from a provided research question, reach a
  ranked hypothesis list with at least one admissible hypothesis attached to
  evidence. Completion criterion: participant declares done AND the study
  checklist item is objectively present in the run (hypothesis list length ≥ 3,
  ≥ 1 hypothesis with ≥ 2 evidence links).
- **Journey B (paper → reproduction plan)**: given a provided paper snapshot,
  produce a method-analysis with ≥ 1 identified limitation and a concrete
  improvement experiment draft through the study-detail surface.
- **Journey C (data → verdict)**: on a provided dataset, complete
  question→spec→execution→verdict with a preregistered comparison, and export
  the bundle; `far verify` must pass on the export.

## 4. Measures

| Construct | Instrument | Scale/Unit |
|---|---|---|
| Task success | binary per journey, per §3 criteria (experimenter-checked against run artifacts, not self-report) | 0/1 |
| Time-to-task-completion | first task-card visible → participant declares done | minutes |
| SUS | standard 10-item SUS, zh/en (MATERIALS.md §3), administered once after all journeys | 0–100 |
| Workload (secondary) | NASA-TLX raw (6 items, no weighting) | 0–100 |
| Artifact usefulness (RQ4) | 3 × 5-point Likert items per journey | 1–5 |
| Observational notes | friction events logged live by the experimenter (count + free text) | count |

Primary endpoint: **SUS ≥ 68** (industry average) and **task success ≥ 2/3
journeys per participant**. Preregistered success bar for the STUDY REPORT:
median SUS ≥ 68 across participants AND ≥ 60% of journeys completed without
experimenter intervention.

## 5. Procedure

1. Consent + demographics (2 min).
2. 5-min orientation video/screenshot tour (scripted, MATERIALS.md §4) — no live
   demo of the study tasks.
3. Journeys A→C with per-journey timing; experimenter intervenes ONLY on
   blocking software failure (logged as such; those journeys count as failures
   for RQ1 but are excluded from time-to-completion, disclosed per-journey).
4. Questionnaires (SUS + TLX + Likert).
5. Debrief interview notes.

## 6. Data handling

All raw artifacts (screen recordings, questionnaire forms, run exports) stay on
the study machine's `work/user-study/sessions/<id>/` (gitignored path class);
only anonymized aggregate numbers enter the repository
(`eval/user-study/RESULTS.md` when execution happens). No PII in git.

## 7. Analysis plan (preregistered)

- Descriptive per-participant table (success per journey, times, SUS, TLX).
- Median + range for SUS; per-journey success rate with exact n (no inferential
  stats at n=3–5; if n ≥ 5, report bootstrap 95% CI for median SUS).
- Negative results reported with the same prominence as positive ones.

## 8. Limitations (preregistered)

Fixed journey order; small n; single-machine; participants recruited by the
owner (selection risk); think-aloud optional. The study measures USABILITY and
PERCEIVED value only — scientific-output quality is measured by the separate
evaluation wave (FA-SCI-01..07), never by this study.

## 9. Execution status

BLOCKED_EXTERNAL (user-owned participants; mission FA-X-02 acceptance drive
may co-schedule). When a session runs: fill `sessions/<id>/CHECKLIST.md`, never
edit this protocol after the first participant starts — deviations go to
DEVIATIONS.md.
