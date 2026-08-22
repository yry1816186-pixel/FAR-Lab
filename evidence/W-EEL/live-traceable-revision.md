# Live Traceable Revision Evidence (ACC-26, D-081 EEL)

**Date**: 2026-08-22 · **Route**: real OpenML dataset + real sklearn training + real zai live LLM revise · **One-off script** (deleted after run): `.far-run/tmp-live-revision.mjs`, mirroring `tests/experiment.test.ts` "traceable revision" case but with `defaultLiveProvider()` (zai, liveReady=true).

## Chain of evidence (verbatim script output)

1. Real experiment on OpenML iris (id 61), hypothesis predicting NO linear separation (deliberately falsifiable direction, `direction: below, threshold: 0`):
   - `experiment: completed | verdict: falsifies | feedback: 1`
2. Revise stage executed on the live provider:
   - `revise outcome: done ... created 1 revision(s) with version diff(s). rev rev_62hfj5j4phr6sq22a0tka7b80b <- fbk_ayear4krypjek7qzxhf7s7bdtf: hypothesis hyp_tav7r0ek8gzv1zmgrsnwbv05fc v0->v1 (statement+mechanism+assumptions+predictions+uncertainties+version); qualityDelta=improved`
3. Causal link verified mechanically:
   - `triggerFeedbackId: fbk_ayear4krypjek7qzxhf7s7bdtf === experiment feedback: true`
   - `causalReason: Feedback 'fbk_...' reports that hypothesis 'hyp_...' is falsified by comparison 'cmp-primary' because the observed accuracy (0.6) exceeded the required threshold, contradicting the prediction ...`
   - `operations: [ 'hypothesis:refine' ]` · `versionDiff entries: hypothesis:statement/mechanism/assumptions/predictions/uncertainties/version`
   - `hypothesis version after: 1` · revised statement: "iris species CAN be linearly separated ..." (direction reversal forced by measurement)

## Recorded product semantics (discovered live)

A `supports` verdict does not force object revisions — the live causal analyst returned no forced changes, which is scientifically correct (support upgrades confidence, not text). Traceable revisions fire under falsification/weakening pressure. First live pass (supports scenario) produced `revisions: 0`; the falsifiable-direction scenario above produced the full causal chain.

## Companion structural test

`tests/experiment.test.ts` "traceable revision: experiment feedback consumed by revise -> causal Revision + VersionDiff (ACC-26)" — same real experiment + real revise-stage code paths with a scripted LLM proposal (test-stub provider, purpose-keyed), asserting triggerFeedbackId identity, version bump, revision_created event, and signal-consumption closure (`applicable()` flips false).
