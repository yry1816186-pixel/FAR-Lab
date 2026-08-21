// Fulltext phase-A endpoint probe (2026-08-22): verify keyless access + response shapes.
const probes = [
  { name: 'arxiv-html-has-html', url: 'https://arxiv.org/html/2505.23685' },
  { name: 'arxiv-html-no-html', url: 'https://arxiv.org/html/2401.04088' },
  { name: 'arxiv-html-v-suffix', url: 'https://arxiv.org/html/2505.23685v2' },
  { name: 'epmc-fulltext', url: 'https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11032673/fullTextXML' },
  { name: 'epmc-not-oa', url: 'https://www.ebi.ac.uk/europepmc/webservices/rest/PMC4c0000/fullTextXML' },
];
for (const p of probes) {
  try {
    const t0 = Date.now();
    const res = await fetch(p.url, { headers: { 'User-Agent': 'FAR-Lab/0.1 (probe)' }, redirect: 'follow' });
    const body = await res.text();
    const isLtx = /class="ltx_|ltx_document/.test(body.slice(0, 20000));
    const isJats = /<article/.test(body.slice(0, 2000));
    const lic = body.match(/<license[^>]*>([\s\S]{0,120}?)<\/license>/)?.[1]?.replace(/\s+/g,' ').slice(0,80);
    console.log(JSON.stringify({
      name: p.name, status: res.status, ms: Date.now() - t0, len: body.length,
      contentType: res.headers.get('content-type'), finalUrl: res.url.slice(0, 80),
      ltx: isLtx, jats: isJats, license: lic ?? null,
      head: body.slice(0, 120).replace(/\s+/g, ' '),
    }));
  } catch (e) {
    console.log(JSON.stringify({ name: p.name, error: String(e).slice(0, 150) }));
  }
}
