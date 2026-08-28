# -*- coding: utf-8 -*-
"""项目提交文档 PDF generator (Report route, ReportLab).

Renders submission/项目提交文档.md directly (single source of truth — no content
mirroring). Cover: pdf-skill template 01 via cover_render.py, merged as page 1.
Fonts: DengXian (Deng.ttf / Dengb.ttf) — host CJK TTFs, no download.

Usage:  python submission/gen_submission_pdf.py
Output: submission/项目提交文档.pdf
"""
# ruff: noqa: E402
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# ---- pdf skill helpers (newest plugin cache wins) ----
import glob
_CAND = sorted(glob.glob(
    r"C:/Users/RichardYuan/.zcode/cli/plugins/cache/zcode-plugins-official/document-skills/*/skills/pdf/scripts"))
PDF_SKILL_DIR = _CAND[-1] if _CAND else None
if PDF_SKILL_DIR:
    sys.path.insert(0, PDF_SKILL_DIR)

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer,
                                Table, TableStyle, KeepTogether, Preformatted, HRFlowable)

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '项目提交文档.md')
OUT = os.path.join(HERE, '项目提交文档.pdf')

if PDF_SKILL_DIR:
    from pdf import install_font_fallback  # skill helper: mixed CJK/Latin glyph fallback

# ---- fonts (host DengXian) ----
pdfmetrics.registerFont(TTFont('Deng', 'C:/Windows/Fonts/Deng.ttf'))
pdfmetrics.registerFont(TTFont('Deng-Bold', 'C:/Windows/Fonts/Dengb.ttf'))
registerFontFamily('Deng', normal='Deng', bold='Deng-Bold', italic='Deng', boldItalic='Deng-Bold')
if PDF_SKILL_DIR:
    install_font_fallback()

# ---- palette (cascade output, same house style as 技术方案文档.pdf) ----
PAGE_BG      = colors.HexColor('#f2f3f3')
CARD_BG      = colors.HexColor('#eaecee')
TABLE_STRIPE = colors.HexColor('#eceff0')
HEADER_FILL  = colors.HexColor('#3d515a')
BORDER       = colors.HexColor('#bec6ca')
ACCENT       = colors.HexColor('#cc354f')
TEXT_PRIMARY = colors.HexColor('#222425')
TEXT_MUTED   = colors.HexColor('#767d80')
CODE_COLOR   = colors.HexColor('#46688f')

# ---- styles ----
S_BODY = ParagraphStyle('body', fontName='Deng', fontSize=10.2, leading=16.6,
                        alignment=TA_JUSTIFY, wordWrap='CJK', textColor=TEXT_PRIMARY,
                        spaceAfter=5)
S_H1 = ParagraphStyle('h1', fontName='Deng-Bold', fontSize=14.5, leading=19.5,
                      textColor=HEADER_FILL, spaceBefore=15, spaceAfter=7)
S_H2 = ParagraphStyle('h2', fontName='Deng-Bold', fontSize=11.8, leading=16.5,
                      textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=4)
S_LIST = ParagraphStyle('list', parent=S_BODY, leftIndent=14, firstLineIndent=-10,
                        spaceAfter=3.5, alignment=TA_LEFT)
S_NLIST = ParagraphStyle('nlist', parent=S_BODY, leftIndent=16, firstLineIndent=-12,
                         spaceAfter=3.5, alignment=TA_LEFT)
S_KICK = ParagraphStyle('kick', fontName='Deng', fontSize=9.3, leading=14,
                        textColor=TEXT_MUTED, spaceAfter=2)
S_CARD = ParagraphStyle('card', fontName='Deng', fontSize=9.8, leading=16,
                        alignment=TA_LEFT, wordWrap='CJK', textColor=TEXT_PRIMARY)
S_MONO = ParagraphStyle('mono', fontName='Deng', fontSize=8.3, leading=12.2,
                        textColor=TEXT_PRIMARY)
S_TCELL = ParagraphStyle('tcell', fontName='Deng', fontSize=9.2, leading=13.6,
                         wordWrap='CJK', textColor=TEXT_PRIMARY)
S_TCELL_B = ParagraphStyle('tcellb', fontName='Deng-Bold', fontSize=9.2, leading=13.6,
                           wordWrap='CJK', textColor=TEXT_PRIMARY)
S_NOTE = ParagraphStyle('note', fontName='Deng', fontSize=9, leading=14.5,
                        textColor=TEXT_MUTED, wordWrap='CJK')

PAGE_W, PAGE_H = A4
ML = MR = 20 * mm
MT, MB = 18 * mm, 18 * mm
AVAIL_W = PAGE_W - ML - MR

FOOTER_TEXT = 'FAR-Lab · XH-202619 Track 1 / Direction 1 / A · 项目提交文档'


def footer(canv, doc):
    canv.saveState()
    canv.setFont('Deng', 8.5)
    canv.setFillColor(TEXT_MUTED)
    canv.drawString(ML, 12 * mm, FOOTER_TEXT)
    canv.drawRightString(PAGE_W - MR, 12 * mm, '第 %d 页' % canv.getPageNumber())
    canv.setStrokeColor(BORDER)
    canv.setLineWidth(0.4)
    canv.line(ML, 15 * mm, PAGE_W - MR, 15 * mm)
    canv.restoreState()


def card(flowables, bg=CARD_BG):
    inner = Table([[flowables]], colWidths=[AVAIL_W - 6 * mm])
    inner.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('BOX', (0, 0), (-1, -1), 0.6, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 9),
        ('RIGHTPADDING', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    return inner


# ---------------- inline markdown -> reportlab markup ----------------
def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


CODE_SPAN = '<font color="#46688f">%s</font>'


def inline(t):
    """Escape XML, protect `code` spans, apply **bold**, restore spans."""
    spans = []

    def stash(m):
        spans.append(m.group(1))
        return '\x00%d\x00' % (len(spans) - 1)

    t = re.sub(r'`([^`]+)`', stash, esc(t))
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    out = []
    for i, chunk in enumerate(re.split(r'(\x00\d+\x00)', t)):
        m = re.fullmatch(r'\x00(\d+)\x00', chunk)
        if m:
            out.append(CODE_SPAN % spans[int(m.group(1))])
        elif chunk:
            out.append(chunk)
    return ''.join(out)


def split_row(line):
    """Pipe-split a table row, ignoring pipes inside `backtick` spans.

    Leading/trailing pipes delimit the row — they must not yield phantom
    empty cells at the ends.
    """
    cells, buf, in_code = [], [], False
    i = 0
    while i < len(line):
        c = line[i]
        if c == '`':
            in_code = not in_code
            buf.append(c)
        elif c == '|' and not in_code:
            cells.append(''.join(buf).strip())
            buf = []
        else:
            buf.append(c)
        i += 1
    cells.append(''.join(buf).strip())
    if cells and cells[0] == '':
        cells.pop(0)
    if cells and cells[-1] == '':
        cells.pop()
    return cells


def width_units(s):
    return sum(2 if ord(ch) > 0x2E7F else 1 for ch in s)


def make_table(rows):
    """rows: list of raw cell-string lists (row 0 = header)."""
    ncols = max(len(r) for r in rows)
    for r in rows:
        while len(r) < ncols:
            r.append('')
    # column widths weighted by content volume (clamped to avoid extremes)
    weights = []
    for c in range(ncols):
        w = max((width_units(r[c]) for r in rows), default=1)
        weights.append(min(max(w, 6), 90) ** 0.62)
    total = sum(weights)
    col_w = [AVAIL_W * w / total for w in weights]

    hdr_style = ParagraphStyle('thdr', parent=S_TCELL_B, textColor=colors.white)
    data = [[Paragraph('<b>%s</b>' % inline(c), hdr_style) for c in rows[0]]]
    for r in rows[1:]:
        data.append([Paragraph(inline(c), S_TCELL) for c in r])

    tbl = Table(data, colWidths=col_w, repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
    ]
    for i in range(2, len(data), 2):
        style.append(('BACKGROUND', (0, i), (-1, i), TABLE_STRIPE))
    tbl.setStyle(TableStyle(style))
    tbl.hAlign = 'CENTER'
    return tbl


def wrap_code_line(line, max_units=118):
    """Hard-wrap oversized code lines at spaces (Preformatted does not wrap)."""
    if width_units(line) <= max_units:
        return [line]
    out, cur, cur_u = [], '', 0
    for word in line.split(' '):
        wu = width_units(word) + 1
        if cur and cur_u + wu > max_units:
            out.append(cur)
            cur, cur_u = '  ' + word, 2 + wu
        else:
            cur = (cur + ' ' + word) if cur else word
            cur_u += wu
    if cur:
        out.append(cur)
    return out


def make_code(lines):
    wrapped = []
    for ln in lines:
        wrapped.extend(wrap_code_line(ln))
    tbl = Table([[Preformatted('\n'.join(wrapped), S_MONO)]], colWidths=[AVAIL_W])
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
        ('BOX', (0, 0), (-1, -1), 0.6, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return tbl


# ---------------- markdown -> story ----------------
with open(SRC, encoding='utf-8') as f:
    md_lines = f.read().splitlines()

story = []
i = 0
pending_head = None  # (flowables list) heading awaiting its first block for KeepTogether


def emit(flowable):
    global pending_head
    if pending_head is not None:
        story.append(KeepTogether([*pending_head, Spacer(1, 2), flowable]))
        pending_head = None
    else:
        story.append(flowable)


while i < len(md_lines):
    line = md_lines[i]

    if line.startswith('```'):
        j = i + 1
        code = []
        while j < len(md_lines) and not md_lines[j].startswith('```'):
            code.append(md_lines[j])
            j += 1
        emit(make_code(code))
        i = j + 1
        continue

    if line.startswith('|') and i + 1 < len(md_lines) and re.match(r'^\|[\s:|-]+\|?$', md_lines[i + 1]):
        rows = [split_row(line)]
        j = i + 2
        while j < len(md_lines) and md_lines[j].startswith('|'):
            rows.append(split_row(md_lines[j]))
            j += 1
        emit(make_table(rows))
        story.append(Spacer(1, 4))
        i = j
        continue

    m = re.match(r'^(#{1,6})\s+(.*)$', line)
    if m:
        level, txt = len(m.group(1)), m.group(2).strip()
        if level == 1:
            i += 1
            continue  # doc title lives on the cover
        pending_head = [Paragraph(inline(txt), S_H1 if level == 2 else S_H2)]
        i += 1
        continue

    if line.strip() == '---':
        if pending_head is None:
            story.append(Spacer(1, 3))
            story.append(HRFlowable(width='100%', thickness=0.5, color=BORDER,
                                    spaceBefore=2, spaceAfter=2))
        i += 1
        continue

    if line.startswith('>'):
        quote = line.lstrip('> ').strip()
        j = i + 1
        while j < len(md_lines) and md_lines[j].startswith('>'):
            quote += md_lines[j].lstrip('> ').strip()
            j += 1
        emit(card([Paragraph(inline(quote), S_CARD)]))
        story.append(Spacer(1, 4))
        i = j
        continue

    m = re.match(r'^(\s*)-\s+(.*)$', line)
    if m:
        items = [m.group(2)]
        j = i + 1
        while j < len(md_lines):
            m2 = re.match(r'^\s*-\s+(.*)$', md_lines[j])
            if not m2:
                break
            items.append(m2.group(1))
            j += 1
        first = True
        for it in items:
            p = Paragraph('•&nbsp;&nbsp;' + inline(it), S_LIST)
            if first:
                emit(p)
                first = False
            else:
                story.append(p)
        i = j
        continue

    m = re.match(r'^(\d+)\.\s+(.*)$', line)
    if m:
        num, txt = m.group(1), m.group(2)
        emit(Paragraph('%s.&nbsp;&nbsp;%s' % (num, inline(txt)), S_NLIST))
        i += 1
        continue

    if not line.strip():
        i += 1
        continue

    # paragraph: merge soft-wrapped lines
    para = [line.strip()]
    j = i + 1
    while j < len(md_lines):
        nxt = md_lines[j]
        if (not nxt.strip() or nxt.startswith(('#', '-', '>', '|', '```', '---'))
                or re.match(r'^\d+\.\s', nxt)):
            break
        para.append(nxt.strip())
        j += 1
    emit(Paragraph(inline(' '.join(para)), S_BODY))
    i = j

if pending_head is not None:
    story.extend(pending_head)

# ---- build body ----
doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=ML, rightMargin=MR,
                      topMargin=MT, bottomMargin=MB,
                      title='FAR-Lab：证据约束的可证伪科学假设生成与研究计划设计系统 — 项目提交文档',
                      author='袁荣岳', subject='XH-202619 Track 1 Direction 1A 项目提交文档')
frame = Frame(ML, MB, AVAIL_W, PAGE_H - MT - MB, id='main')
doc.addPageTemplates([PageTemplate(id='page', frames=[frame], onPage=footer)])
doc.build(story)
print('body pages written:', OUT)

# ---- cover (pdf-skill template 01) + merge ----
from cover_render import render_cover
from pypdf import PdfReader, PdfWriter
content = {
    "kicker": "XH-202619 · 基于国产开源大模型的 AI Scientist",
    "hero": "FAR-Lab",
    "summary": "证据约束、可证伪、可修订的科学假设生成与研究计划设计系统——完整技术与使用文档：十二阶段科研流水线、假设锦标赛排序、确定性实验判决、因果修正与版本治理、科学状态投影、可复现导出与独立校验，以及 Web / CLI / 桌面多端工作台的安装、配置与使用指南。",
    "meta": "项目提交文档 · 2026 年 8 月 · 袁荣岳",
    "footer": "FAR-LAB · PROJECT SUBMISSION",
    "footer_left": "XH-202619 Track 1-A", "footer_right": "2026 年 8 月",
    "year": "2026", "word": "SUBMISSION",
}
cover_path = OUT.replace('.pdf', '_cover_tmp.pdf')
render_cover('01', content, cover_path)
w = PdfWriter()
for src in (cover_path, OUT):
    for pg in PdfReader(src).pages:
        w.add_page(pg)
with open(OUT, 'wb') as f:
    w.write(f)
os.remove(cover_path)
n = len(PdfReader(OUT).pages)
print('FINAL:', OUT, 'pages:', n)
