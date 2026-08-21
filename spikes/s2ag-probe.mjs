// S2AG citation-contexts probe (2026-08-22): keyless access, contexts+intents coverage.
const dois = [
  '10.1038/s41586-021-03819-2', // AlphaFold2 - heavily cited
  '10.1126/science.aay5051',    // another big one
];
for (const doi of dois) {
  const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${doi}/citations?fields=title,year,contexts,intents&limit=20`;
  try {
    const t0 = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': 'FAR-Lab/0.1 (probe)' } });
    const body = await res.text();
    if (res.status !== 200) { console.log(JSON.stringify({ doi, status: res.status, head: body.slice(0, 120) })); continue; }
    const j = JSON.parse(body);
    const cites = j.data ?? [];
    const withContexts = cites.filter((c) => (c.citing?.contexts ?? c.contexts ?? []).length > 0);
    const withIntents = cites.filter((c) => (c.citing?.intents ?? c.intents ?? []).length > 0);
    const contrast = cites.filter((c) => (c.citing?.intents ?? c.intents ?? []).some((i) => /contrast|background/i.test(i)) || (c.citing?.contexts ?? []).some((x) => /in contrast|however|contradict|fail/i.test(x)));
    console.log(JSON.stringify({ doi, status: res.status, ms: Date.now() - t0, returned: cites.length, withContexts: withContexts.length, withIntents: withIntents.length, contrastish: contrast.length,
      sampleIntent: withIntents[0] ? (cites[0].citing?.intents ?? cites[0].intents) : null,
      sampleContext: (withContexts[0]?.citing?.contexts ?? [])[0]?.slice(0, 100) ?? null }));
  } catch (e) {
    console.log(JSON.stringify({ doi, error: String(e).slice(0, 120) }));
  }
}
