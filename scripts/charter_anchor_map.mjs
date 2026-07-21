#!/usr/bin/env node
/**
 * charter_anchor_map.mjs — 1.md 锚点导航系统
 *
 * 扫描仓库根 1.md 的 ^#{1,3} 标题(围栏感知,跳过代码块内的伪标题),
 * 按「编」分组成锚点并生成 agent/contracts/charter-anchor-map.yaml。
 * 1.md 变更后只需重跑本脚本;下游引用锚点而非硬编码行号。
 *
 * 用法:
 *   node scripts/charter_anchor_map.mjs            重新生成 yaml
 *   node scripts/charter_anchor_map.mjs --check    校验 yaml 与 1.md 的 md5 一致性(不一致 exit 1)
 *   node scripts/charter_anchor_map.mjs --anchor phase-b/§16   打印该锚点行区间
 *
 * 锚点命名:
 *   编级:   master | phase-a | phase-b | phase-ch | profile-linux | appendix | lifecycle
 *   节级:   <part>/§N      (如 phase-b/§16)
 *   小节级: <part>/§N.M    (如 phase-b/§16.7)
 *   无编号标题: <part>/§L<line>
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MD_PATH = path.join(ROOT, '1.md');
const YAML_PATH = path.join(ROOT, 'agent', 'contracts', 'charter-anchor-map.yaml');

/** level-1 「编」标题 → 锚点分组(按文中出现顺序) */
const PART_MAP = [
  [/^第一编/, 'phase-a'],
  [/^第二编/, 'phase-b'],
  [/^第三编/, 'phase-ch'],
  [/^第四编/, 'profile-linux'],
  [/^附编/, 'appendix'],
  [/^第[五六七八九]编/, 'lifecycle'], // 第五编至第九编同属 lifecycle
];

function readCharter() {
  const buf = fs.readFileSync(MD_PATH);
  const md5 = crypto.createHash('md5').update(buf).digest('hex');
  let text = buf.toString('utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return { md5, lines };
}

/** 围栏感知地提取 ^#{1,3} 标题;同时校验围栏最终闭合 */
function extractHeadings(lines) {
  const headings = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (m) headings.push({ line: i + 1, level: m[1].length, text: m[2] });
  }
  if (inFence) {
    console.error('ERROR: 1.md code fences are unbalanced (file ends inside a fence).');
    process.exit(2);
  }
  return headings;
}

/** 标题 → 锚点全表(按行号升序) */
function buildAnchors(headings, totalLines) {
  let currentPart = 'master';
  const partStarts = { master: 1 };
  const partTitles = { master: headings.length ? headings[0].text : 'master' };
  const hardCutters = []; // 编级边界(含 lifecycle 内部第六~九编)
  const entries = []; // {anchor, kind, title, start_line, part}
  const used = new Set();

  const push = (anchor, kind, title, line) => {
    let key = anchor;
    let n = 2;
    while (used.has(key)) {
      key = `${anchor}_dup${n++}`;
    }
    if (key !== anchor) console.error(`WARNING: anchor collision, renamed to ${key}`);
    used.add(key);
    entries.push({ anchor: key, kind, title, start_line: line, part: currentPart });
  };

  for (const h of headings) {
    if (h.level === 1) {
      const partHit = PART_MAP.find(([re]) => re.test(h.text));
      if (partHit) {
        currentPart = partHit[1];
        hardCutters.push(h.line);
        if (!(currentPart in partStarts)) {
          partStarts[currentPart] = h.line;
          partTitles[currentPart] = h.text;
        } else {
          // lifecycle 内部的第六~九编:作为无编号标题锚点保留
          push(`${currentPart}/§L${h.line}`, 'heading', h.text, h.line);
        }
        continue;
      }
      if (h.line === 1) continue; // 文档主标题 = master 编标题,不重复计
      push(`${currentPart}/§L${h.line}`, 'heading', h.text, h.line);
      continue;
    }
    const sub = /^(\d+)\.(\d+)(?=\s|$)/.exec(h.text);
    if (sub) {
      push(`${currentPart}/§${sub[1]}.${sub[2]}`, 'subsection', h.text, h.line);
      continue;
    }
    const sec = /^(\d+)\.(?=\s|$)/.exec(h.text);
    if (sec) {
      push(`${currentPart}/§${sec[1]}`, 'section', h.text, h.line);
      continue;
    }
    push(`${currentPart}/§L${h.line}`, 'heading', h.text, h.line);
  }

  // 编级行区间
  const partOrder = Object.entries(partStarts).sort((a, b) => a[1] - b[1]);
  const partRanges = {};
  for (let i = 0; i < partOrder.length; i++) {
    const [name, start] = partOrder[i];
    const end = i + 1 < partOrder.length ? partOrder[i + 1][1] - 1 : totalLines;
    partRanges[name] = { start, end };
  }

  // 各锚点 end_line
  const sectionStarts = entries.filter((e) => e.kind === 'section').map((e) => e.start_line);
  const allHeadingLines = headings.map((h) => h.line);
  const result = [];
  for (const [name, range] of Object.entries(partRanges)) {
    result.push({ anchor: name, kind: 'part', title: partTitles[name], start_line: range.start, end_line: range.end });
  }
  for (const e of entries) {
    const partEnd = partRanges[e.part].end;
    let end;
    if (e.kind === 'section') {
      // 下一个同级 section 或编级硬边界或编尾
      const next = [...sectionStarts.filter((l) => l > e.start_line), ...hardCutters.filter((l) => l > e.start_line), partEnd + 1];
      end = Math.min(...next) - 1;
    } else {
      // subsection/heading: 下一个任意标题或编尾
      const next = allHeadingLines.filter((l) => l > e.start_line);
      end = Math.min(next.length ? next[0] - 1 : partEnd, partEnd);
    }
    result.push({ anchor: e.anchor, kind: e.kind, title: e.title, start_line: e.start_line, end_line: end });
  }
  result.sort((a, b) => a.start_line - b.start_line || a.anchor.localeCompare(b.anchor));
  return result;
}

function toYaml(anchors, md5, totalLines) {
  const q = (s) => JSON.stringify(String(s));
  const out = [];
  out.push('# AUTO-GENERATED by scripts/charter_anchor_map.mjs — DO NOT EDIT BY HAND.');
  out.push('# 1.md 变更后重跑: node scripts/charter_anchor_map.mjs');
  out.push(`generated_at: ${q(new Date().toISOString())}`);
  out.push(`source: ${q('1.md')}`);
  out.push(`source_md5: ${q(md5)}`);
  out.push(`line_count: ${totalLines}`);
  out.push(`anchor_count: ${anchors.length}`);
  out.push('anchors:');
  for (const a of anchors) {
    out.push(`  ${q(a.anchor)}:`);
    out.push(`    kind: ${q(a.kind)}`);
    out.push(`    title: ${q(a.title)}`);
    out.push(`    start_line: ${a.start_line}`);
    out.push(`    end_line: ${a.end_line}`);
  }
  return out.join('\n') + '\n';
}

function cmdGenerate() {
  const { md5, lines } = readCharter();
  const headings = extractHeadings(lines);
  const anchors = buildAnchors(headings, lines.length);
  fs.mkdirSync(path.dirname(YAML_PATH), { recursive: true });
  fs.writeFileSync(YAML_PATH, toYaml(anchors, md5, lines.length), 'utf8');
  const parts = anchors.filter((a) => a.kind === 'part');
  console.log(`charter-anchor-map.yaml written: ${anchors.length} anchors (${parts.length} parts), source_md5=${md5}`);
  for (const p of parts) {
    const n = anchors.filter((a) => a.kind !== 'part' && a.anchor.startsWith(`${p.anchor}/`)).length;
    console.log(`  ${p.anchor.padEnd(14)} L${p.start_line}-${p.end_line}  (${n} sub-anchors)`);
  }
}

function cmdCheck() {
  if (!fs.existsSync(YAML_PATH)) {
    console.error('ERROR: agent/contracts/charter-anchor-map.yaml missing — run: node scripts/charter_anchor_map.mjs');
    process.exit(1);
  }
  const yaml = fs.readFileSync(YAML_PATH, 'utf8');
  const m = /^source_md5:\s*"?([0-9a-f]{32})"?\s*$/m.exec(yaml);
  if (!m) {
    console.error('ERROR: charter-anchor-map.yaml has no valid source_md5 — re-run: node scripts/charter_anchor_map.mjs');
    process.exit(1);
  }
  const { md5 } = readCharter();
  if (m[1] !== md5) {
    console.error(`ERROR: 1.md changed since map generation (yaml=${m[1]}, actual=${md5}).`);
    console.error('Re-run: node scripts/charter_anchor_map.mjs');
    process.exit(1);
  }
  console.log(`OK: charter-anchor-map.yaml is in sync with 1.md (md5=${md5}).`);
}

function cmdAnchor(name) {
  const { lines } = readCharter();
  const headings = extractHeadings(lines);
  const anchors = buildAnchors(headings, lines.length);
  const hit = anchors.find((a) => a.anchor === name);
  if (!hit) {
    console.error(`ERROR: anchor not found: ${name}`);
    const frag = name.split('/').pop() || name;
    const near = anchors.filter((a) => a.anchor.includes(frag)).slice(0, 10).map((a) => a.anchor);
    if (near.length) console.error(`similar anchors: ${near.join(', ')}`);
    process.exit(1);
  }
  console.log(`anchor:     ${hit.anchor}`);
  console.log(`kind:       ${hit.kind}`);
  console.log(`title:      ${hit.title}`);
  console.log(`start_line: ${hit.start_line}`);
  console.log(`end_line:   ${hit.end_line}`);
}

const args = process.argv.slice(2);
if (args[0] === '--check') cmdCheck();
else if (args[0] === '--anchor' && args[1]) cmdAnchor(args[1]);
else if (args.length === 0) cmdGenerate();
else {
  console.error('usage: charter_anchor_map.mjs [--check] [--anchor <name>]');
  process.exit(2);
}
