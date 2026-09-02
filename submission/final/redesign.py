# -*- coding: utf-8 -*-
"""Redesign doc.html → blueprint design system (single pass, idempotent via markers).
- New CSS (page furniture via running elements, plate frames, section openers)
- New cover (blueprint composition)
- h1 → numeral + icon + title opener, followed by running header div
- figures → plate frames; notes → icon chips; P1 → stats strip
"""
import re
from pathlib import Path

HERE = Path(__file__).parent
p = (HERE / "doc.html").read_text(encoding="utf-8")
if "BLUEPRINT-REDESIGN-V1" in p:
    print("already redesigned"); raise SystemExit

NEW_CSS = r"""
/* BLUEPRINT-REDESIGN-V1 — 科研蓝图设计系统 */
body { margin: 0; padding: 0; }
@page {
    size: A4;
    margin: 2.35cm 1.9cm 2.15cm 1.9cm;
    @top-center { content: element(rh); }
    @bottom-center { content: "—  " counter(page) "  —"; font-size: 8.5pt; color: #9AA4B5; font-family: "Microsoft YaHei"; letter-spacing: 1px; }
}
@page cover { margin: 0; @top-center { content: none; } @bottom-center { content: none; } }
@page plain { @top-center { content: none; } }
.cover { page: cover; }
.toc-page { page: plain; }

/* ---------- running header ---------- */
.rh { position: running(rh); width: 172mm; text-align: center;
      border-bottom: 1.6px solid #0B3D91; padding-bottom: 5px;
      font-size: 7.8pt; color: #0B3D91; letter-spacing: 0.8px; }
.rh .rb { color: #9AA4B5; padding: 0 7px; }
.rh .rd { color: #D97706; padding-right: 8px; }

/* ---------- typography ---------- */
body {
    font-family: "Microsoft YaHei", "DengXian", "PingFang SC", sans-serif;
    font-size: 10pt; line-height: 1.78; color: #22304A;
    text-align: justify; text-align-last: left;
    background: #FCFCF9;
}
h1.sec {
    display: flex; align-items: center; gap: 13px;
    margin: 24px 0 12px 0; padding: 9px 14px 9px 12px;
    background: linear-gradient(90deg, #EDF3FD 0%, rgba(237,243,253,0) 82%);
    border-left: 4px solid #0B3D91;
    page-break-after: avoid; line-height: 1.3;
}
h1.sec .secnum {
    font-size: 27pt; font-weight: 800; letter-spacing: 1px;
    color: rgba(11,61,145,0.10);
    -webkit-text-stroke: 1.3px #0B3D91;
    font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
    flex: 0 0 auto;
}
h1.sec .secbody { display: flex; align-items: center; gap: 9px; }
h1.sec .sectitle { font-size: 14.5pt; font-weight: 700; color: #0B3D91; }
h1.sec .ic { width: 21px; height: 21px; color: #0B3D91; flex: 0 0 auto; }
h2.sub {
    font-size: 11.5pt; font-weight: 700; color: #173A6B;
    margin: 14px 0 6px 0; page-break-after: avoid;
    padding-left: 9px; border-left: 3px solid #B9CCEC;
    letter-spacing: 0.4px;
}
p { margin: 5px 0; }
strong, b { color: #0B3D91; }
code {
    font-family: Consolas, "Courier New", monospace; font-size: 8.6pt;
    background: #EFF3FA; padding: 0 4px; border: 0.5px solid #D6E0F0; border-radius: 3px; color: #14335E;
    word-break: break-word;
}
ul { margin: 4px 0 6px 0; padding-left: 1.55em; }
li { margin: 2.5px 0; }
li::marker { color: #0B3D91; }
a { color: #0B3D91; text-decoration: none; word-break: break-all; }

/* ---------- cover（蓝图构图） ---------- */
.cover {
    width: 210mm; height: 297mm; margin: 0; position: relative; overflow: hidden;
    page-break-after: always;
    background: linear-gradient(152deg, #071A3E 0%, #0B3D91 52%, #1258BC 82%, #0E7490 100%);
    color: white;
}
.c-svg { position: absolute; top: 0; left: 0; width: 210mm; height: 297mm; }
.c-rule { position: absolute; left: 22mm; top: 34mm; width: 46px; height: 5px; background: #FFB020; }
.c-comp { position: absolute; left: 22mm; top: 44mm; font-size: 12pt; letter-spacing: 1px; color: rgba(255,255,255,0.95); font-weight: 600; }
.c-comp2 { position: absolute; left: 22mm; top: 52.5mm; font-size: 9.5pt; color: rgba(255,255,255,0.62); letter-spacing: 0.5px; }
.c-track { position: absolute; left: 22mm; top: 92mm; display: flex; }
.c-badge { border: 1.2px solid rgba(255,255,255,0.55); border-radius: 999px; padding: 4px 16px; font-size: 9.5pt; margin-right: 12px; color: #fff; background: rgba(255,255,255,0.08); letter-spacing: 0.5px; }
.c-wm { position: absolute; left: 16mm; top: 108mm; font-size: 92pt; font-weight: 800; letter-spacing: 2px;
        color: rgba(255,255,255,0.05); -webkit-text-stroke: 1.2px rgba(255,255,255,0.20);
        font-family: "Segoe UI", "Microsoft YaHei", sans-serif; }
.c-title { position: absolute; left: 22mm; top: 126mm; width: 170mm; font-size: 32pt; font-weight: 800; line-height: 1.32; letter-spacing: 1px; }
.c-sub { position: absolute; left: 22mm; top: 178mm; width: 165mm; font-size: 13pt; line-height: 1.7; color: rgba(255,255,255,0.92); font-weight: 600; }
.c-sub2 { position: absolute; left: 22mm; top: 188mm; width: 165mm; font-size: 9pt; color: rgba(255,255,255,0.60); font-family: Consolas, monospace; letter-spacing: 0.5px; }
.c-key { position: absolute; left: 22mm; top: 206mm; width: 168mm; }
.c-key span { display: inline-block; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.26); border-radius: 3px; padding: 5px 12px; font-size: 9pt; margin: 0 7px 7px 0; color: rgba(255,255,255,0.94); letter-spacing: 0.5px; }
.c-meta { position: absolute; left: 22mm; right: 22mm; bottom: 24mm; font-size: 9.5pt; color: rgba(255,255,255,0.80); line-height: 2.0;
          border-top: 1px solid rgba(255,255,255,0.28); padding-top: 12px;
          display: flex; justify-content: space-between; font-family: Consolas, "Microsoft YaHei", monospace; }
.c-meta b { color: #fff; font-weight: 600; }

/* ---------- TOC ---------- */
.toc-page { page-break-after: always; }
.toc-title { font-size: 17pt; font-weight: 800; color: #0B3D91; margin: 4mm 0 2mm 0; letter-spacing: 6px; }
.toc-sub { font-size: 8pt; color: #9AA4B5; letter-spacing: 2px; font-family: Consolas, monospace; margin-bottom: 6mm; }
ul.toc { list-style: none; padding: 0; margin: 0; }
ul.toc li { margin: 0; padding: 4.5px 0; border-bottom: 1px dotted #B9C6DA; font-size: 10.5pt; }
ul.toc li a { color: #22304A; display: block; position: relative; }
ul.toc li a::after { content: target-counter(attr(href url), page); position: absolute; right: 0; color: #0B3D91; font-weight: 700; }

/* ---------- figure plates（图版框） ---------- */
figure { margin: 11px 0 13px 0; text-align: center; page-break-inside: avoid; }
.plate { position: relative; border: 1px solid #C7D4E8; background: #FFFFFF; padding: 9px 10px; }
.plate::before { content: ""; position: absolute; top: -1px; left: -1px; width: 13px; height: 13px;
                 border-top: 2.2px solid #0B3D91; border-left: 2.2px solid #0B3D91; }
.plate::after { content: ""; position: absolute; bottom: -1px; right: -1px; width: 13px; height: 13px;
                border-bottom: 2.2px solid #0B3D91; border-right: 2.2px solid #0B3D91; }
.plate img { max-width: 100%; max-height: 56vh; }
figcaption { font-size: 8.8pt; color: #5A6B84; margin-top: 7px; line-height: 1.6; text-align: left; }
figcaption::before {
    content: attr(data-label); font-weight: 700; color: #FFFFFF; background: #0B3D91;
    padding: 1px 8px; border-radius: 2px; margin-right: 8px; font-size: 8pt; letter-spacing: 0.5px;
}

/* ---------- tables ---------- */
table { width: 100%; max-width: 100%; border-collapse: collapse; margin: 6px 0 13px 0;
    border-top: 1.8px solid #0B3D91; border-bottom: 1.8px solid #0B3D91; font-size: 8.8pt; line-height: 1.58;
    background: #FFFFFF; }
thead { display: table-header-group; }
thead th { background: #E8F0FC; color: #0B3D91; font-weight: 700; padding: 5px 7px; border-bottom: 1px solid #0B3D91; text-align: left; letter-spacing: 0.3px; }
tbody td { padding: 5px 7px; border-bottom: 0.6px solid #DFE7F2; vertical-align: top; }
tbody tr:nth-child(even) td { background: #F6F9FE; }
tr { page-break-inside: avoid; }
caption { font-size: 8.8pt; color: #5A6B84; margin: 3px 0 6px 0; text-align: left; caption-side: top; }
caption::before {
    content: attr(data-label); font-weight: 700; color: #FFFFFF; background: #0B3D91;
    padding: 1px 8px; border-radius: 2px; margin-right: 8px; font-size: 8pt; letter-spacing: 0.5px;
}

/* ---------- callouts ---------- */
.note, .warn, .fill { display: flex; gap: 9px; align-items: flex-start;
    padding: 8px 12px; margin: 9px 0; font-size: 9.3pt; page-break-inside: avoid; }
.note { border-left: 3px solid #0B3D91; background: #F2F7FE; color: #24344D; }
.warn { border-left: 3px solid #D97706; background: #FFFBEB; color: #3B2F13; }
.fill { border: 1.4px dashed #D97706; background: #FFFDF5; color: #6B5B2A; text-align: center; display: block; border-radius: 2px; }
.note .ic, .warn .ic { width: 15px; height: 15px; flex: 0 0 auto; margin-top: 2px; }
.note .ic { color: #0B3D91; } .warn .ic { color: #B45309; }
.note .nt, .warn .nt { font-weight: 700; }
.note .nt { color: #0B3D91; } .warn .nt { color: #B45309; }

/* ---------- stats strip（关键数字带） ---------- */
.stats { display: flex; margin: 12px 0 14px 0; border-top: 1.6px solid #0B3D91; border-bottom: 1.6px solid #0B3D91;
         background: #FFFFFF; page-break-inside: avoid; }
.stat { flex: 1; padding: 10px 12px; border-left: 1px solid #D6E0F0; }
.stat:first-child { border-left: none; }
.stat .v { font-size: 17.5pt; font-weight: 800; color: #0B3D91; line-height: 1.2; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; letter-spacing: 0.5px; }
.stat .k { font-size: 8.2pt; color: #5A6B84; margin-top: 3px; line-height: 1.45; }

.kv { margin: 5px 0; }
.kv .k { font-weight: 700; color: #0B3D91; }
.tag { display: inline-block; background: #EAF1FD; color: #0B3D91; border-radius: 2px; padding: 0 6px; font-size: 8.4pt; font-weight: 600; margin-right: 4px; }
.pb { page-break-before: always; }
.avoid { page-break-inside: avoid; }
.small { font-size: 8.8pt; color: #5A6B84; }
.center { text-align: center; }
.checklist { list-style: none; padding-left: 0.2em; }
.checklist li { margin: 4px 0; }
.checklist li::before { content: "□ "; color: #0B3D91; font-weight: 700; }
.ic { display: inline-block; vertical-align: middle; }
"""

# ---------- 1) replace CSS ----------
p = re.sub(r"<style>.*?</style>", "<style>" + NEW_CSS + "</style>", p, flags=re.S)

# ---------- 2) replace cover ----------
NEW_COVER = r"""
<div class="cover">
  <svg class="c-svg" viewBox="0 0 794 1123" preserveAspectRatio="none">
    <defs>
      <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
        <circle cx="1.2" cy="1.2" r="1.2" fill="rgba(255,255,255,0.10)"/>
      </pattern>
    </defs>
    <rect x="560" y="0" width="234" height="420" fill="url(#dots)"/>
    <rect x="0" y="760" width="300" height="363" fill="url(#dots)"/>
    <g stroke="rgba(255,255,255,0.35)" stroke-width="1" fill="none">
      <line x1="60" y1="700" x2="180" y2="560"/><line x1="180" y1="560" x2="330" y2="620"/>
      <line x1="330" y1="620" x2="470" y2="480"/><line x1="470" y1="480" x2="640" y2="540"/>
      <line x1="640" y1="540" x2="700" y2="380"/><line x1="330" y1="620" x2="300" y2="820"/>
      <line x1="470" y1="480" x2="380" y2="330"/><line x1="640" y1="540" x2="560" y2="700"/>
      <line x1="300" y1="820" x2="560" y2="700"/><line x1="180" y1="560" x2="380" y2="330"/>
    </g>
    <g fill="rgba(255,255,255,0.9)">
      <circle cx="180" cy="560" r="4.5"/><circle cx="330" cy="620" r="6" fill="#FFB020"/>
      <circle cx="470" cy="480" r="4.5"/><circle cx="640" cy="540" r="5.5" fill="#7FD1FF"/>
      <circle cx="300" cy="820" r="4.5"/><circle cx="560" cy="700" r="4.5"/>
      <circle cx="380" cy="330" r="5" fill="#7FD1FF"/><circle cx="700" cy="380" r="4"/>
      <circle cx="60" cy="700" r="4"/>
    </g>
    <g stroke="rgba(255,255,255,0.5)" stroke-width="1.2">
      <line x1="30" y1="24" x2="30" y2="44"/><line x1="20" y1="34" x2="40" y2="34"/>
      <line x1="764" y1="24" x2="764" y2="44"/><line x1="754" y1="34" x2="774" y2="34"/>
      <line x1="30" y1="1079" x2="30" y2="1099"/><line x1="20" y1="1089" x2="40" y2="1089"/>
      <line x1="764" y1="1079" x2="764" y2="1099"/><line x1="754" y1="1089" x2="774" y2="1089"/>
    </g>
    <g stroke="rgba(255,255,255,0.28)" stroke-width="1">
      <line x1="690" y1="900" x2="690" y2="1060"/><line x1="684" y1="900" x2="696" y2="900"/><line x1="684" y1="1060" x2="696" y2="1060"/>
    </g>
    <text x="700" y="985" fill="rgba(255,255,255,0.4)" font-size="11" font-family="Consolas" transform="rotate(90 700 985)">XH-202619 · TRACK 1A</text>
  </svg>
  <div class="c-rule"></div>
  <div class="c-comp">2026年度中国青年科技创新“揭榜挂帅”擂台赛 · 阿里云榜题</div>
  <div class="c-comp2">赛道一 · 科学发现｜榜题：基于国产开源大模型的 AI Scientist 的研发与应用</div>
  <div class="c-track">
    <span class="c-badge">方向 1A · 科学假设生成与研究计划设计</span>
    <span class="c-badge">题目编号 XH-202619</span>
  </div>
  <div class="c-wm">FAR-Lab</div>
  <div class="c-title">FAR-Lab<br>证据约束的科学假设生成<br>与研究计划设计系统</div>
  <div class="c-sub">技术方案文档</div>
  <div class="c-sub2">EVIDENCE-CONSTRAINED HYPOTHESIS GENERATION &amp; RESEARCH-PLAN DESIGN ON QWEN</div>
  <div class="c-key">
    <span>十二阶段科研流水线</span><span>证据逐字绑定</span><span>可证伪假设</span>
    <span>锦标赛比较筛选</span><span>因果化修订链</span><span>一键可复现包</span><span>人在回路</span>
  </div>
  <div class="c-meta">
    <span><b>V1.0</b>　最终提交版</span>
    <span>2026 年 9 月</span>
    <span>基座模型 <b>Qwen</b> · 阿里云百炼</span>
  </div>
</div>
"""
p = re.sub(r"<!-- =+ 封面 =+ -->.*?<!-- =+ 目录 =+ -->",
           "<!-- 封面 -->" + NEW_COVER + "\n<!-- 目录 -->", p, flags=re.S)

# ---------- 3) SVG sprite after <body> ----------
SPRITE = r"""
<svg style="display:none" xmlns="http://www.w3.org/2000/svg">
<symbol id="i-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.6" r="0.4" fill="currentColor"/></symbol>
<symbol id="i-target" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></symbol>
<symbol id="i-compass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polygon points="15.5,8.5 13.5,13.5 8.5,15.5 10.5,10.5" fill="currentColor" stroke="none"/></symbol>
<symbol id="i-database" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5 v13 c0 1.6 3.4 2.8 7.5 2.8 s7.5 -1.3 7.5 -2.8 v-13"/><path d="M4.5 12 c0 1.6 3.4 2.8 7.5 2.8 s7.5 -1.3 7.5 -2.8"/></symbol>
<symbol id="i-scale" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="4" x2="12" y2="20"/><line x1="5" y1="7" x2="19" y2="7"/><path d="M3 13 l2.5 -6 l2.5 6 a4.2 4.2 0 0 1 -5 0 z"/><path d="M14 13 l2.5 -6 l2.5 6 a4.2 4.2 0 0 1 -5 0 z"/><line x1="8.5" y1="20" x2="15.5" y2="20"/></symbol>
<symbol id="i-layers" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,3.5 21,8 12,12.5 3,8"/><polyline points="3,12.5 12,17 21,12.5"/><polyline points="3,16.5 12,21 21,16.5"/></symbol>
<symbol id="i-cpu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><line x1="9" y1="2.5" x2="9" y2="5.5"/><line x1="15" y1="2.5" x2="15" y2="5.5"/><line x1="9" y1="18.5" x2="9" y2="21.5"/><line x1="15" y1="18.5" x2="15" y2="21.5"/><line x1="2.5" y1="9" x2="5.5" y2="9"/><line x1="2.5" y1="15" x2="5.5" y2="15"/><line x1="18.5" y1="9" x2="21.5" y2="9"/><line x1="18.5" y1="15" x2="21.5" y2="15"/></symbol>
<symbol id="i-flask" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 3 h5"/><path d="M10.5 3 v6 l-5.2 8.6 a2 2 0 0 0 1.7 3 h10 a2 2 0 0 0 1.7 -3 l-5.2 -8.6 v-6"/><line x1="7.5" y1="14.5" x2="16.5" y2="14.5"/></symbol>
<symbol id="i-network" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="5.5" cy="12" r="2.6"/><circle cx="18.5" cy="5.5" r="2.6"/><circle cx="18.5" cy="18.5" r="2.6"/><line x1="7.9" y1="10.9" x2="16.1" y2="6.6"/><line x1="7.9" y1="13.1" x2="16.1" y2="17.4"/></symbol>
<symbol id="i-funnel" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5 h18 l-6.8 7.8 v6.2 l-4.4 2.2 v-8.4 z"/></symbol>
<symbol id="i-clipboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4.5" width="14" height="16" rx="1.5"/><rect x="9" y="2.8" width="6" height="3.4" rx="1"/><line x1="8.5" y1="11" x2="15.5" y2="11"/><line x1="8.5" y1="14.5" x2="15.5" y2="14.5"/><polyline points="8.5,17.6 10.2,19.2 15.5,16.4"/></symbol>
<symbol id="i-loop" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,7 20,3.5"/><path d="M20 7 a8.2 8.2 0 0 0 -15 -2.5"/><polyline points="4,17 4,20.5"/><path d="M4 17 a8.2 8.2 0 0 0 15 2.5"/></symbol>
<symbol id="i-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.5" y="3.5" width="17" height="17" rx="1"/><line x1="9.2" y1="3.5" x2="9.2" y2="20.5"/><line x1="14.8" y1="3.5" x2="14.8" y2="20.5"/><line x1="3.5" y1="9.2" x2="20.5" y2="9.2"/><line x1="3.5" y1="14.8" x2="20.5" y2="14.8"/></symbol>
<symbol id="i-document" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.8 h8.5 l4 4 v14.4 h-12.5 z"/><polyline points="14.5,2.8 14.5,6.8 18.5,6.8"/><line x1="9" y1="11.5" x2="15.5" y2="11.5"/><line x1="9" y1="15" x2="15.5" y2="15"/></symbol>
<symbol id="i-list" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.8" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.8" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.8" cy="18" r="1.1" fill="currentColor" stroke="none"/></symbol>
<symbol id="i-wrench" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6.5 a4.3 4.3 0 0 1 5.9 -4 l-3 3 l2 2 l3 -3 a4.3 4.3 0 0 1 -5.9 5.9 l-8.3 8.3 a2.1 2.1 0 0 1 -3 -3 z"/></symbol>
<symbol id="i-iterate" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="17.5,3 20.5,6 17.5,9"/><path d="M4 12 v-1.5 a4.5 4.5 0 0 1 4.5 -4.5 h12"/><polyline points="6.5,15 3.5,18 6.5,21"/><path d="M20 12 v1.5 a4.5 4.5 0 0 1 -4.5 4.5 h-12"/></symbol>
<symbol id="i-chart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="3.5" y1="20.5" x2="20.5" y2="20.5"/><line x1="7" y1="20.5" x2="7" y2="13"/><line x1="12" y1="20.5" x2="12" y2="8"/><line x1="17" y1="20.5" x2="17" y2="3.5"/></symbol>
<symbol id="i-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8 l7.5 2.8 v6.2 c0 4.6 -3.2 7.6 -7.5 9.4 c-4.3 -1.8 -7.5 -4.8 -7.5 -9.4 v-6.2 z"/><polyline points="8.8,12 11,14.2 15.4,9.8"/></symbol>
<symbol id="i-package" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8 l8 4.4 v9.6 l-8 4.4 l-8 -4.4 v-9.6 z"/><polyline points="4.2,7.3 12,11.7 19.8,7.3"/><line x1="12" y1="11.7" x2="12" y2="21"/></symbol>
</svg>
"""
p = p.replace("<body>", "<body>" + SPRITE, 1)

# ---------- 4) h1 → opener + running header ----------
ICON = {"p1":"i-info","p2":"i-target","p3":"i-compass","p4":"i-database","p5":"i-scale",
        "p6":"i-layers","p7":"i-cpu","p8":"i-flask","p9":"i-network","p10":"i-funnel",
        "p11":"i-clipboard","p12":"i-loop","p13":"i-grid","p14":"i-document","p15":"i-list",
        "p16":"i-wrench","p17":"i-iterate","p18":"i-chart","p19":"i-shield","p20":"i-package"}

def h1_repl(m):
    pid, num, title = m.group(1), m.group(2), m.group(3).strip()
    ic = ICON[pid]
    return (f'<h1 class="sec" id="{pid}"><span class="secnum">{num}</span>'
            f'<span class="secbody"><svg class="ic"><use href="#{ic}"/></svg>'
            f'<span class="sectitle">{title}</span></span></h1>\n'
            f'<div class="rh"><span class="rd">◆</span>FAR-Lab 技术方案文档'
            f'<span class="rb">｜</span>{num} {title}</div>')
p = re.sub(r'<h1 class="sec" id="(p\d+)">(P\d+)｜([^<]+)</h1>', h1_repl, p)

# ---------- 5) figures → plate frames ----------
p = re.sub(r'<figure>\s*<img ', '<figure><div class="plate"><img ', p)
p = re.sub(r'(<img [^>]*>)\s*(<figcaption)', r'\1</div>\2', p)

# ---------- 6) notes/warns get icons ----------
p = p.replace('<div class="note"><span class="nt">',
              '<div class="note"><svg class="ic"><use href="#i-info"/></svg><div><span class="nt">')
p = p.replace('<div class="warn"><span class="nt">',
              '<div class="warn"><svg class="ic"><use href="#i-shield"/></svg><div><span class="nt">')
# close the inner div opened above (unique endings of the 2 notes + 1 warn)
for tail in ['评测结论与模型提供方解耦。</div>',
             '不以代表性案例代替总体结果。</div>',
             '可检验、可复核。</div>']:
    assert tail in p, tail
    p = p.replace(tail, tail + '</div>', 1)

# ---------- 7) TOC subtitle ----------
p = p.replace('<div class="toc-title">目　录</div>',
              '<div class="toc-title">目　录</div><div class="toc-sub">FAR-Lab · TECHNICAL REPORT · XH-202619</div>')

# ---------- 8) P1 stats strip ----------
STATS = """
<div class="stats">
  <div class="stat"><div class="v">100%</div><div class="k">主张—来源逐字绑定率<br>（170/170 机器验证）</div></div>
  <div class="stat"><div class="v">0%</div><div class="k">引用不受支持率<br>（同口径基线 85.0%）</div></div>
  <div class="stat"><div class="v">104<span style="font-size:10pt"> 条</span></div><div class="k">结构化反证关系<br>（6 题对照评测合计）</div></div>
  <div class="stat"><div class="v">15/15·16/16</div><div class="k">可复现包独立校验通过<br>（far verify）</div></div>
</div>
"""
p = p.replace('<h2 class="sub">本作品核心主张</h2>',
              '<h2 class="sub">本作品核心主张</h2>' + STATS, 1)

(HERE / "doc.html").write_text(p, encoding="utf-8")
print("redesigned ok; h1 count:", len(re.findall(r'class="sec"', p)), "plates:", p.count('class="plate"'))
