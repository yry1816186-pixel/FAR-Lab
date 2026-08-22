/** Wave-5 F4 premise probe: duplicate/diversity failure prevalence in recorded runs. */
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.far-run/far.db', { readOnly: true });
const hyps = db
  .prepare("SELECT run_id as run, json as j FROM objects WHERE kind='hypothesis'")
  .all()
  .map((r) => ({ run: r.run, h: JSON.parse(r.j) }));
const total = hyps.length;
const dups = hyps.filter((x) => (x.h.derivation?.rationale ?? '').includes('duplicate-of-representative:'));
console.log('hypotheses total:', total, '| marked duplicates:', dups.length);

const byRun = new Map();
for (const x of hyps) byRun.set(x.run, (byRun.get(x.run) ?? 0) + 1);
const dupByRun = new Map();
for (const x of dups) dupByRun.set(x.run, (dupByRun.get(x.run) ?? 0) + 1);
console.log('runs with >=1 duplicate:', dupByRun.size, '/', byRun.size);
for (const [run, n] of [...dupByRun.entries()].slice(0, 10)) {
  console.log('  run', run.slice(0, 16), ':', n, 'dups of', byRun.get(run), 'hyps');
}

// representatives per run (diversity floor check, MIN_REPRESENTATIVES=3)
const repByRun = new Map();
for (const x of hyps) {
  if ((x.h.derivation?.rationale ?? '').includes('duplicate-of-representative:')) continue;
  repByRun.set(x.run, (repByRun.get(x.run) ?? 0) + 1);
}
const shortRuns = [...repByRun.entries()].filter(([, n]) => n < 3);
console.log('runs with <3 representatives (diversity shortfall):', shortRuns.length, '/', byRun.size);

const ev = db.prepare("SELECT count(*) c FROM events WHERE payload LIKE '%diversity shortfall%'").get();
console.log('diversity-shortfall event mentions:', ev.c);

// cluster size distribution among representatives (1 cluster = 1 rep)
const clusterByRun = new Map();
for (const x of hyps) {
  const ck = x.h.clusterKey;
  if (!ck) continue;
  if (!clusterByRun.has(x.run)) clusterByRun.set(x.run, new Map());
  const m = clusterByRun.get(x.run);
  m.set(ck, (m.get(ck) ?? 0) + 1);
}
let clustersGT1 = 0;
let clustersTotal = 0;
for (const m of clusterByRun.values()) {
  for (const n of m.values()) {
    clustersTotal += 1;
    if (n > 1) clustersGT1 += 1;
  }
}
console.log('clusters with >1 member (paraphrase groups found):', clustersGT1, '/', clustersTotal);
