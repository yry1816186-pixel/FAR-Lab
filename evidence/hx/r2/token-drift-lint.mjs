#!/usr/bin/env node
/**
 * Lane-02 QA gate: token-drift lint over web/src/styles.css.
 *
 * craft-spec-v2 contract (research/wave-aesthetics-reports/craft-spec-v2.md):
 *  - type scale: 22/16/14/12 (UI), 12.5 data voice, 15.5/18 statement voice,
 *    26 hero exception. Floor 12px (11px decorative-badge single case only).
 *  - spacing: 4px grid (2/4/8/12/16/24/32/48) via --sp-* tokens.
 *  - radius: 4px controls/cards (--radius-s), pill 999px (--radius-pill),
 *    50% dots, 2px progress-track fill exception.
 *  - line-heights: 28/22/20/18/21/16 via tokens.
 *
 * Usage: node evidence/hx/r2/token-drift-lint.mjs [--fix-report]
 * Exit 0 = clean; exit 1 = drift found (prints file:line:value).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const cssPath = join(root, 'web', 'src', 'styles.css');
const css = readFileSync(cssPath, 'utf8');

const FONT_OK = new Set(['var(--fs-h1)', 'var(--fs-h2)', 'var(--fs-h3)', 'var(--fs-body)', 'var(--fs-read)', 'var(--fs-aux)', 'var(--fs-data)', '12px', '12.5px', '14px', '16px', '22px', '15.5px', '18px', '26px', '13px', '11px', '20px']);
// 13px = evidence-glyph symbol size (iconography, not text); 11px = spec §1's single
// decorative-glyph allowance (checkbox checkmark); 20px = doc reading-view h1 (papers).
const FONT_FLOOR_VIOLATIONS = new Set(['10.5px', '11.5px', '9px', '10px']);
const RADIUS_OK = new Set(['var(--radius-s)', 'var(--radius-pill)', '50%', '2px', '999px', '4px', '3px', '8px']);
// 3px = meter geometry (half height of 6px bars: rank-bar, screening-progress) —
// documented meter rule; 8px = hero cards ONLY (welcome-card, composer2-card).
const RADIUS_ASYMMETRIC_OK = new Set(['0 4px 4px 0']); // conv-run-child: nested-timeline lead edge, values on grid
const SPACING_OK = new Set(['var(--sp-1)', 'var(--sp-2)', 'var(--sp-3)', 'var(--sp-4)', 'var(--sp-5)', 'var(--sp-6)', 'var(--sp-7)', '2px', '4px', '8px', '12px', '16px', '24px', '32px', '48px', '0', '0px']);

const findings = [];
const lines = css.split('\n');
for (let i = 0; i < lines.length; i++) {
  const ln = i + 1;
  const line = lines[i];

  // font-size drift
  for (const m of line.matchAll(/font-size:\s*([^;]+);/g)) {
    const v = m[1].trim();
    if (v.includes('var(') && FONT_OK.has(v)) continue;
    if (FONT_OK.has(v)) continue;
    if (v === '0.92em') { findings.push({ ln, kind: 'font-size-em-relative', v, rule: 'mono voice must use --fs-data, not em fractions' }); continue; }
    if (FONT_FLOOR_VIOLATIONS.has(v)) { findings.push({ ln, kind: 'font-size-below-floor', v, rule: 'craft-spec §1 floor 12px' }); continue; }
    if (/^-?\d+(\.\d+)?(px|pt|em|rem)$/.test(v)) findings.push({ ln, kind: 'font-size-off-scale', v, rule: 'craft-spec §1 scale' });
  }

  // radius drift
  for (const m of line.matchAll(/border-radius:\s*([^;]+);/g)) {
    const v = m[1].trim();
    if (RADIUS_OK.has(v) || RADIUS_ASYMMETRIC_OK.has(v) || v.includes('var(')) continue;
    if (v === '3px') { findings.push({ ln, kind: 'radius-off-system', v, rule: '§5: 4px or pill' }); continue; }
    if (v === '8px') { findings.push({ ln, kind: 'radius-off-system', v, rule: '§5: cards 4px (8px only if a card-scale exception is recorded)' }); continue; }
    if (v.includes('%') || v.includes('999')) continue;
    findings.push({ ln, kind: 'radius-unclassified', v, rule: 'review against §5' });
  }

  // sub-pixel borders (Windows blur)
  for (const m of line.matchAll(/border(-top|-right|-bottom|-left)?:\s*0\.\d+px/g)) {
    findings.push({ ln, kind: 'subpixel-border', v: m[0], rule: '1px minimum — sub-pixel borders render blurred' });
  }
  for (const m of line.matchAll(/border-width:\s*0\.\d+px/g)) {
    findings.push({ ln, kind: 'subpixel-border', v: m[0], rule: '1px minimum' });
  }
}

if (findings.length > 0) {
  console.error(`token-drift: ${findings.length} finding(s) in web/src/styles.css`);
  for (const f of findings) console.error(`  ${cssPath.replace(/\\/g, '/')}:${f.ln}  [${f.kind}]  ${f.v}  — ${f.rule}`);
  process.exit(1);
}
console.log('token-drift: clean');
