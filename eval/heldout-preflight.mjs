/**
 * FA-SCI-04 held-out PRE-FLIGHT retrieval probe (plan-sciq S5 protocol step).
 *
 * Zero LLM: drives the four source adapters directly with domain-typical
 * queries for H1..H6 and records verifiable-source counts per family. Purpose:
 * starvation detection BEFORE the live runs — if a domain's retrieval surface
 * is thin, that is a disclosed finding (never a tuning license; the protocol
 * forbids prompt/param changes against this set).
 *
 * Usage: node eval/heldout-preflight.mjs  (writes eval/results/heldout-preflight.json)
 */
import { writeFileSync } from 'node:fs';
import { sourceAdapterFor, SOURCE_FAMILIES } from '../dist/sources/index.js';

/** Domain-typical queries per held-out problem (2 each: primary + counter angle). */
const PROBES = [
  { id: 'H1', domain: '材料物理', queries: [
    'hydrogen embrittlement pipeline steel HELP hydrogen enhanced localized plasticity',
    'hydrogen enhanced decohesion mechanism high strength steel evidence',
  ] },
  { id: 'H2', domain: '天体物理', queries: [
    'repeating fast radio bursts magnetar origin',
    'SGR 1935+2154 FRB 200428 concurrent X-ray burst association',
  ] },
  { id: 'H3', domain: '电化学/催化', queries: [
    'NiFe oxyhydroxide oxygen evolution electrocatalyst active site iron nickel',
    'dynamic active site Fe Ni edge oxygen evolution catalyst operando evidence',
  ] },
  { id: 'H4', domain: '计算化学', queries: [
    'machine learned interatomic potential water supercooled generalization',
    'neural network potential stretched water failure transferability',
  ] },
  { id: 'H5', domain: '劳动经济学', queries: [
    'minimum wage employment monopsony competitive model post-2010',
    'minimum wage natural experiment identification strategy employment effect',
  ] },
  { id: 'H6', domain: '能源系统', queries: [
    'grid scale battery storage natural gas peaker displacement CAISO',
    'battery deployment electricity market duck curve gas utilization',
  ] },
];

const run = async () => {
  const out = { at: new Date().toISOString(), purpose: 'FA-SCI-04 pre-flight starvation probe (zero LLM)', families: SOURCE_FAMILIES, results: [] };
  for (const p of PROBES) {
    const perQuery = [];
    for (const q of p.queries) {
      const perFamily = {};
      for (const family of SOURCE_FAMILIES) {
        try {
          const adapter = sourceAdapterFor(family, {});
          const res = await adapter.search(q, { limit: 5 });
          const docs = res.records ?? [];
          perFamily[family] = {
            ok: true,
            count: docs.length,
            withDoi: docs.filter((d) => (d.identifiers ?? []).some((i) => i.kind === 'doi')).length,
            sampleTitles: docs.slice(0, 2).map((d) => String(d.title ?? '').slice(0, 90)),
          };
        } catch (e) {
          perFamily[family] = { ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 120) };
        }
      }
      perQuery.push({ query: q, families: perFamily });
    }
    const totalOk = perQuery.flatMap((r) => Object.values(r.families)).filter((f) => f.ok).reduce((n, f) => n + (f.count ?? 0), 0);
    const familiesAllDead = perQuery.every((r) => Object.values(r.families).every((f) => !f.ok));
    out.results.push({
      id: p.id, domain: p.domain,
      verdict: familiesAllDead ? 'STARVED (all families failed)' : totalOk === 0 ? 'STARVED (zero results)' : totalOk < 6 ? 'THIN (<6 hits across families)' : 'OK',
      totalHits: totalOk,
      perQuery,
    });
    console.log(`${p.id} ${p.domain}: ${out.results.at(-1).verdict} (hits=${totalOk})`);
  }
  writeFileSync('eval/results/heldout-preflight.json', JSON.stringify(out, null, 2));
  console.log('written: eval/results/heldout-preflight.json');
};

run().catch((e) => { console.error('preflight failed:', e); process.exit(1); });
