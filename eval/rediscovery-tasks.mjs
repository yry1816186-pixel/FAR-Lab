/**
 * Shared task set + run access for the rediscovery eval (single source of truth for
 * rediscovery.mjs and judge-variance.mjs — Wave-9 D-029 refactor; previously the
 * task set lived inline in rediscovery.mjs and the render/wait helpers were copied).
 *
 * gtClaims = FIXED ground-truth decomposition (D-029 fixed-granularity protocol):
 * authored 2026-08-22 by the main agent from the recorded v1 median decomposition
 * pass (eval/results/rediscovery-v1-degraded.jsonl), reviewed claim-by-claim against
 * each task's establishedFinding. The judge NEVER re-decomposes the GT — the GT side
 * of the decomposition variance is eliminated by construction. Changing a gtClaims
 * list invalidates comparability with prior eval numbers: new comparisons only
 * within the same gtClaims revision (recorded in results as gtRev).
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve, join } from 'node:path';
import { isRepresentative } from '../dist/pipeline/stages/shared.js';

export const GT_REV = 'gt-fixed-2026-08-22';

export const TASKS = [
  {
    id: 'egfr-tki-resistance',
    question: 'What mechanisms drive acquired resistance to EGFR tyrosine kinase inhibitors in non-small cell lung cancer?',
    domain: 'oncology', goal: 'explanatory',
    establishedFinding:
      'The dominant acquired-resistance mechanism is the EGFR T790M gatekeeper mutation in the kinase domain, which sterically reduces inhibitor binding while preserving ATP affinity. A secondary mechanism is MET/HER3 pathway amplification that bypasses EGFR signaling blockade without a second EGFR mutation. Resistance emerges under the selective pressure of inhibitor treatment, expanding pre-existing resistant clones.',
    rationale: 'Textbook oncology; Jackman & Engelman reviews; established since ~2005.',
    gtClaims: [
      'The dominant acquired-resistance mechanism is the EGFR T790M gatekeeper mutation in the kinase domain.',
      'The T790M gatekeeper mutation sterically reduces inhibitor binding.',
      'The T790M gatekeeper mutation preserves ATP affinity.',
      'A secondary mechanism is MET/HER3 pathway amplification.',
      'MET/HER3 pathway amplification bypasses EGFR signaling blockade.',
      'MET/HER3 pathway amplification occurs without a second EGFR mutation.',
      'Resistance emerges under the selective pressure of inhibitor treatment.',
      'Inhibitor treatment expands pre-existing resistant clones.',
    ],
  },
  {
    id: 'antibiotic-cdiff',
    question: 'Why does antibiotic treatment predispose patients to Clostridioides difficile infection?',
    domain: 'microbiology', goal: 'explanatory',
    establishedFinding:
      'Antibiotics disrupt the gut microbiota, depleting bacteria that convert primary bile acids to secondary bile acids. Loss of secondary bile acids (which inhibit C. difficile germination and growth) together with accumulation of taurocholate-like germinants enables C. difficile spore germination and outgrowth. The infection is therefore a dysbiosis-driven loss of colonization resistance rather than a direct antibiotic effect on the pathogen.',
    rationale: 'Established mechanistic model (Buffie/Young & Abt reviews); bile-acid axis.',
    gtClaims: [
      'Antibiotics disrupt the gut microbiota.',
      'Antibiotics deplete bacteria that convert primary bile acids to secondary bile acids.',
      'Secondary bile acids inhibit C. difficile germination and growth.',
      'Accumulation of taurocholate-like germinants enables C. difficile spore germination and outgrowth.',
      'C. difficile infection is a dysbiosis-driven loss of colonization resistance.',
      'C. difficile infection is not a direct antibiotic effect on the pathogen.',
    ],
  },
  {
    id: 'arg-plasmid-transfer',
    question: 'What mechanisms drive the horizontal transfer of antibiotic resistance genes in hospital environments?',
    domain: 'microbiology', goal: 'explanatory',
    establishedFinding:
      'Conjugative plasmids are the dominant horizontal-transfer vector for resistance genes in hospital settings; integrons and transposons capture and mobilize resistance cassettes onto those plasmids; and sustained antibiotic selective pressure enriches resistant strains, maintaining and spreading the plasmid pool. Patient-to-patient transmission via hands and equipment amplifies spread but is not the gene-transfer mechanism itself.',
    rationale: 'Textbook medical microbiology (plasmid conjugation, integrons, selection).',
    gtClaims: [
      'Conjugative plasmids are the dominant horizontal-transfer vector for resistance genes in hospital settings.',
      'Integrons capture and mobilize resistance cassettes onto conjugative plasmids.',
      'Transposons capture and mobilize resistance cassettes onto conjugative plasmids.',
      'Sustained antibiotic selective pressure enriches resistant strains.',
      'Sustained antibiotic selective pressure maintains the plasmid pool.',
      'Sustained antibiotic selective pressure spreads the plasmid pool.',
      'Patient-to-patient transmission via hands amplifies spread of resistance genes.',
      'Patient-to-patient transmission via equipment amplifies spread of resistance genes.',
      'Patient-to-patient transmission via hands and equipment is not the gene-transfer mechanism itself.',
    ],
  },
  {
    id: 'crispr-offtarget',
    question: 'What mechanism causes CRISPR-Cas9 off-target genome editing?',
    domain: 'molecular biology', goal: 'explanatory',
    establishedFinding:
      'Off-target editing arises because the Cas9-guide RNA complex tolerates sequence mismatches between the guide and off-target genomic sites. Mismatch tolerance is highest distal to the PAM and lowest in the PAM-proximal seed region; off-target activity therefore correlates with genome-wide guide-sequence similarity and cannot be fully eliminated by requiring a perfect match in design.',
    rationale: 'Established since Doudna/Charpentier-era characterization; seed-region model.',
    gtClaims: [
      'Off-target editing arises because the Cas9-guide RNA complex tolerates sequence mismatches between the guide and off-target genomic sites.',
      'Mismatch tolerance is highest distal to the PAM.',
      'Mismatch tolerance is lowest in the PAM-proximal seed region.',
      'Off-target activity correlates with genome-wide guide-sequence similarity.',
      'Off-target activity cannot be fully eliminated by requiring a perfect match in design.',
    ],
  },
  {
    id: 'crc-ici-failure',
    question: 'Why does immune checkpoint blockade benefit only a minority of colorectal cancer patients?',
    domain: 'oncology', goal: 'explanatory',
    establishedFinding:
      'Most colorectal tumors are microsatellite-stable (MSS) with functioning mismatch repair, yielding low tumor mutational burden and few neoantigens, so there is insufficient T-cell priming for checkpoint blockade to amplify. The microsatellite-instable (MSI-high/dMMR) subset carries high mutational/neoantigen burden and is the minority that responds. Response failure is thus primarily an antigenicity/immunogenicity deficit, not a drug-delivery issue.',
    rationale: 'Established since 2015 (Le/Overman); MSI-TMB-neoantigen axis is textbook.',
    gtClaims: [
      'Most colorectal tumors are microsatellite-stable (MSS) with functioning mismatch repair.',
      'MSS tumors yield low tumor mutational burden.',
      'MSS tumors yield few neoantigens.',
      'The low neoantigen burden in MSS tumors results in insufficient T-cell priming for checkpoint blockade to amplify.',
      'The microsatellite-instable (MSI-high/dMMR) subset carries high mutational/neoantigen burden.',
      'The MSI-high/dMMR subset is the minority that responds to checkpoint blockade.',
      'Response failure in MSS CRC is primarily an antigenicity/immunogenicity deficit.',
      'Response failure in MSS CRC is not a drug-delivery issue.',
    ],
  },
];

// Honors FARLAB_DATA_DIR (same env the CLI uses) so fresh-run batches can
// generate + render in an isolated dir — the 72h soak owns the default
// .far-run workspace (2026-09-05).
export const DB_PATH = resolve(process.cwd(), process.env.FARLAB_DATA_DIR ? join(process.env.FARLAB_DATA_DIR, 'far.db') : '.far-run/far.db');

/** Deterministic top-hypothesis render (tournament winner; unchanged from v1/v2). */
export const renderTopHypothesis = (runId) => {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const objs = (kind) => db.prepare('SELECT json FROM objects WHERE kind=? AND run_id=?').all(kind, runId).map((r) => JSON.parse(r.json));
  const hyps = objs('hypothesis').filter(isRepresentative);
  const tournament = objs('tournament').at(-1);
  const plan = objs('plan').at(-1);
  db.close();
  if (hyps.length === 0) return { text: null, reason: 'no representative hypotheses' };
  let top = hyps[0];
  if (tournament && hyps.length > 1) {
    const order = tournament.standings.map((s) => s.hypothesisId ?? s.id).filter(Boolean);
    top = order.map((id) => hyps.find((h) => h.id === id)).find(Boolean) ?? hyps[0];
  }
  const f = top.falsification ?? {};
  const text =
    `Hypothesis: ${top.statement}\n` +
    `Mechanism: ${top.mechanism ?? ''}\n` +
    `Predictions: ${(top.predictions ?? []).join(' | ')}\n` +
    `Expected relation: ${f.expectedRelation ?? ''} (observable: ${f.observable ?? ''}).`;
  return { text, hypId: top.id, planObjective: plan?.objective ?? null };
};

/** Poll a run to terminal state (the CLI returns at creation; engine runs detached). */
export const waitForTerminal = (runId, maxMs = 20 * 60_000) => {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const deadline = Date.now() + maxMs;
  let status;
  for (;;) {
    const row = db.prepare('SELECT status FROM runs WHERE id=?').get(runId);
    status = row === undefined ? 'missing' : row.status;
    if (status !== 'running' && status !== 'created') break;
    if (Date.now() > deadline) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000);
  }
  db.close();
  return status;
};
