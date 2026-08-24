import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach } from 'vitest';
import { parseSvgPlot, SdmPlotPoints } from '../src/ingest/parsers/svgplot';
import { ingestSvgPlot, loadPlotPointsByRef } from '../src/ingest/service';
import { openArtifactStore } from '../src/persistence/artifacts';

/** Deterministic SVG plot digitization on hand-calibrated fixtures: every
 *  expected number below was placed into the fixture by construction, so the
 *  assertions check REAL calibration math, not round-tripped inputs. */

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'svg-plot-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** x: pixel 100..500 maps to value 0..4; y: pixel 400..100 maps to 0..3. */
const tickTexts = (): string =>
  [0, 1, 2, 3, 4].map((v) => `<text x="${100 + v * 100}" y="430" style="text-anchor:middle">${v}</text>`).join('') +
  [0, 1, 2, 3].map((v) => `<text x="60" y="${400 - v * 100}" style="text-anchor:end">${v}</text>`).join('') +
  `<text x="280" y="445">Time (s)</text><text x="10" y="250">Uptake (\u00b5mol)</text>`;

const LINEAR_SVG = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450">
<title>uptake curve</title>
<desc>Figure 1. Uptake over time.</desc>
${tickTexts()}
<polyline points="100,400 200,300 300,200" stroke="#1f77b4"/>
<circle cx="400" cy="100" r="3" fill="#d62728"/>
</svg>`;

const LOG_SVG = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450">
${[0, 1, 2, 3, 4].map((v) => `<text x="${100 + v * 100}" y="430">${v}</text>`).join('')}
${[['1', 400], ['10', 300], ['100', 200]].map(([v, y]) => `<text x="60" y="${y}">${v}</text>`).join('')}
<path d="M 100 250 L 200 350"/>
</svg>`;

describe('parseSvgPlot — linear calibration', () => {
  const r = parseSvgPlot(LINEAR_SVG, { name: 'fig.svg' });
  if (!r.ok) throw new Error(`fixture must parse: ${r.reason}`);

  it('extracts both axes with exact ranges and units parsed from the printed labels', () => {
    const f = r.sdm.figures[0]!;
    expect(f.perception.status).toBe('extracted');
    const x = f.perception.axes?.find((a) => a.kind === 'x');
    const y = f.perception.axes?.find((a) => a.kind === 'y');
    expect(x?.label).toBe('Time');
    expect(x?.unit).toBe('s');
    expect(x?.scale).toBe('linear');
    expect(x?.range).toEqual([0, 4]);
    expect(y?.label).toBe('Uptake');
    expect(y?.unit).toBe('\u00b5mol');
    expect(y?.range).toEqual([0, 3]);
  });

  it('recovers the polyline and scatter series with EXACT constructed values', () => {
    const byKind = new Map(r.points.series.map((s) => [s.kind, s]));
    expect(byKind.get('polyline')?.points).toEqual([[0, 0], [1, 1], [2, 2]]);
    expect(byKind.get('circle')?.points).toEqual([[3, 3]]);
  });

  it('stamps deterministic-calibration verification (the only sanctioned source)', () => {
    expect(r.sdm.figures[0]!.perception.verifiedBy).toBe('deterministic-calibration');
  });

  it('records the full calibration audit trail in the points doc (re-verifiable)', () => {
    const cal = r.points.axes.x.calibration;
    expect(cal.ticks).toEqual([[100, 0], [200, 1], [300, 2], [400, 3], [500, 4]]);
    expect(cal.slope).toBeCloseTo(0.01, 10);
    expect(cal.intercept).toBeCloseTo(-1, 10);
    expect(cal.maxResidual).toBeLessThan(1e-9);
    expect(SdmPlotPoints.safeParse(r.points).success).toBe(true);
  });

  it('is deterministic', () => {
    const again = parseSvgPlot(LINEAR_SVG, { name: 'fig.svg' });
    expect(again.ok).toBe(true);
    if (again.ok) expect(JSON.stringify(again.points)).toBe(JSON.stringify(r.points));
  });
});

describe('parseSvgPlot — log axis + path primitives', () => {
  const r = parseSvgPlot(LOG_SVG, { name: 'log.svg' });
  if (!r.ok) throw new Error(`fixture must parse: ${r.reason}`);

  it('detects the log scale from evenly-spaced decades', () => {
    const y = r.sdm.figures[0]!.perception.axes?.find((a) => a.kind === 'y');
    expect(y?.scale).toBe('log');
    expect(y?.range).toEqual([1, 100]);
  });

  it('maps points through the log calibration exactly (y=250 → 10^1.5, y=350 → 10^0.5)', () => {
    const s = r.points.series.find((sr) => sr.kind === 'path');
    expect(s?.points).toEqual([[0, 31.6228], [1, 3.16228]]);
  });
});

describe('parseSvgPlot — refusal honesty', () => {
  it('marks decorative SVGs unsupported (never guessed into numbers)', () => {
    const r = parseSvgPlot('<svg xmlns="http://www.w3.org/2000/svg"><text x="5" y="20">Hello logo</text><rect x="0" y="0" width="10" height="10"/></svg>', { name: 'logo.svg' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sdm.figures[0]!.perception.status).toBe('unsupported');
      expect(r.sdm.diagnostics.warnings.join(' ')).toMatch(/no aligned numeric tick groups/);
      expect(r.points.series).toHaveLength(0);
    }
  });

  it('refuses bezier paths whole — no fabricated straight lines through curve segments', () => {
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">${tickTexts()}<path d="M 100 400 C 150 350, 200 300, 300 200" stroke="#333"/></svg>`;
    const r = parseSvgPlot(svg, { name: 'curve.svg' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.points.series.filter((s) => s.kind === 'path')).toHaveLength(0);
      expect(r.sdm.diagnostics.warnings.join(' ')).toMatch(/curved\/arc/);
    }
  });

  it('notes bar rectangles as an explicit gap instead of digitizing bar tops', () => {
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">${tickTexts()}<rect x="150" y="200" width="40" height="200"/></svg>`;
    const r = parseSvgPlot(svg, { name: 'bars.svg' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sdm.diagnostics.warnings.join(' ')).toMatch(/bar/);
  });

  it('fails visibly on non-XML input', () => {
    const r = parseSvgPlot('this is not xml at all <', { name: 'x.svg' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not well-formed/);
  });
});

describe('ingestSvgPlot — artifact persistence round-trip', () => {
  it('persists the points artifact, wires pointsRef into the SDM, and reloads it by ref', async () => {
    const store = openArtifactStore(join(dir, 'artifacts'));
    const r = await ingestSvgPlot(store, 'fig.svg', LINEAR_SVG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pointsRef).toMatch(/^sha256:[0-9a-f]{64}$/);
    const fig = r.outcome.sdm.figures[0]!;
    expect(fig.perception.series?.every((s) => s.pointsRef === r.pointsRef)).toBe(true);
    const back = await loadPlotPointsByRef(store, r.pointsRef!);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.doc.series[0]!.points).toEqual([[0, 0], [1, 1], [2, 2]]);
  });

  it('without a store the perception is downgraded (numbers without a verifiable artifact are not evidence)', async () => {
    const r = await ingestSvgPlot(null, 'fig.svg', LINEAR_SVG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.sdm.figures[0]!.perception.status).toBe('not_extracted');
    expect(r.outcome.sdm.diagnostics.warnings.join(' ')).toMatch(/no artifact store/);
  });
});
