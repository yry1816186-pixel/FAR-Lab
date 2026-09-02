// FAR-Lab 技术方案文档 DOCX renderer — content blocks come from blocks.json
// (single source of truth: doc.html via html2blocks.py).
// Usage: python3 {skill}/scripts/docx.py build create_docx.js output.docx
import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel,
  ImageRun, ImportedXmlComponent, LevelFormat, Packer, PageNumber, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType, PageBreak,
  convertInchesToTwip,
} from "docx";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Usage: node create_docx.js /abs/out.docx");
const HERE = path.dirname(outputPath);
const blocks = JSON.parse(fs.readFileSync(path.join(HERE, "blocks.json"), "utf-8"));

const DEEP = "0B3D91", SUB = "173A6B", GRAY = "4B5563", LIGHT = "EAF1FD", LINE = "D7E3F4";
const font = { ascii: "Segoe UI", hAnsi: "Segoe UI", cs: "Segoe UI", eastAsia: "Microsoft YaHei" };
const TEXT_W = 9638; // DXA text width (A4 11906 - 2×1134 margins)

const run = (text, o = {}) => new TextRun({ text, font, size: 21, ...o });
const para = (children, o = {}) => new Paragraph({
  spacing: { after: 120, line: 340 }, ...o,
  children: Array.isArray(children) ? children : [children],
});

function runsToRuns(runs, base = {}) {
  const out = [];
  for (const r of runs) {
    if (r.text === "\n") { out.push(new TextRun({ break: 1 })); continue; }
    out.push(new TextRun({
      text: r.text, font: r.code ? { ascii: "Consolas", hAnsi: "Consolas", cs: "Consolas", eastAsia: "Microsoft YaHei" } : font,
      size: r.code ? 18 : 21, bold: !!r.bold,
      color: r.code ? "0F172A" : (r.color || undefined),
      shading: r.code ? { type: ShadingType.CLEAR, fill: "F1F5F9" } : undefined,
      ...base,
    }));
  }
  return out;
}

const h1 = (runs) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 160 }, keepNext: true,
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: LINE, space: 4 } },
  children: runs.map(r => new TextRun({ text: r.text, font, size: 30, bold: true, color: DEEP })),
});
const h2 = (runs) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 220, after: 100 }, keepNext: true,
  children: runs.map(r => new TextRun({ text: r.text, font, size: 24, bold: true, color: SUB })),
});

const pngSize = (p) => { const b = fs.readFileSync(p); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const PX_PER_CM = 96 / 2.54;

function figBlock(b) {
  const imgPath = path.join(HERE, b.src);
  const { w, h } = pngSize(imgPath);
  const isShot = /fig13|fig14/.test(b.src);
  const targetCm = isShot ? 14.5 : 15.8;
  const dispW = Math.round(targetCm * PX_PER_CM);
  const dispH = Math.round(dispW * h / w);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40 }, keepNext: true,
      children: [new ImageRun({ type: "png", data: fs.readFileSync(imgPath), transformation: { width: dispW, height: dispH } })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 160 },
      children: [
        new TextRun({ text: (b.label || "") + "　", font, size: 18, bold: true, color: DEEP }),
        new TextRun({ text: b.caption || "", font, size: 18, color: GRAY }),
      ],
    }),
  ];
}

function tableBlock(b) {
  const ncol = b.head.length || (b.rows[0] || []).length;
  let widths = b.widths && b.widths.some(Boolean)
    ? b.widths.map(x => Math.round(((x || 100 / ncol) / 100) * TEXT_W))
    : Array(ncol).fill(Math.round(TEXT_W / ncol));
  const sum = widths.reduce((a, c) => a + c, 0);
  widths[ncol - 1] += TEXT_W - sum;
  const mkCell = (text, i, isHead) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    shading: isHead ? { type: ShadingType.CLEAR, fill: LIGHT } : undefined,
    children: [new Paragraph({
      spacing: { after: 0, line: 300 },
      children: [new TextRun({ text, font, size: 18, bold: isHead, color: isHead ? DEEP : undefined })],
    })],
  });
  const rows = [
    new TableRow({ tableHeader: true, children: b.head.map((t, i) => mkCell(t, i, true)) }),
    ...b.rows.map(r => new TableRow({ children: r.map((t, i) => mkCell(t, i, false)) })),
  ];
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 80, after: 40 }, keepNext: true,
      children: [
        new TextRun({ text: (b.label || "") + "　", font, size: 18, bold: true, color: DEEP }),
        new TextRun({ text: b.caption || "", font, size: 18, color: GRAY }),
      ],
    }),
    new Table({
      width: { size: TEXT_W, type: WidthType.DXA },
      columnWidths: widths,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 12, color: DEEP },
        bottom: { style: BorderStyle.SINGLE, size: 12, color: DEEP },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "DCE4F0" },
        insideVertical: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      },
      rows,
    }),
    para(run("", { size: 8 })),
  ];
}

function boxBlock(b, fill, borderColor) {
  return [new Paragraph({
    spacing: { before: 80, after: 120 },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: borderColor, space: 8 } },
    shading: { type: ShadingType.CLEAR, fill },
    children: runsToRuns(b.runs, { size: 19 }),
  })];
}

// ---- cover ----
function coverChildren() {
  const spacer = (n, size = 240) => Array(n).fill(0).map(() => para(run(""), { spacing: { after: size } }));
  const c = (text, o = {}) => para(new TextRun({ text, font, ...o }), { alignment: AlignmentType.LEFT, spacing: { after: 120 } });
  return [
    ...spacer(3),
    c("2026年度中国青年科技创新“揭榜挂帅”擂台赛 · 阿里云榜题", { size: 24, bold: true, color: DEEP }),
    c("赛道一 · 科学发现｜榜题：基于国产开源大模型的 AI Scientist 的研发与应用", { size: 20, color: GRAY }),
    ...spacer(2),
    c("方向 1A · 科学假设生成与研究计划设计　　题目编号 XH-202619", { size: 20, bold: true, color: SUB }),
    ...spacer(4),
    c("FAR-Lab", { size: 64, bold: true, color: DEEP }),
    c("证据约束的科学假设生成与研究计划设计系统", { size: 44, bold: true, color: DEEP }),
    ...spacer(1),
    c("技术方案文档", { size: 28, color: INKish() }),
    c("Evidence-Constrained Hypothesis Generation & Research-Plan Design on Qwen", { size: 18, color: GRAY }),
    ...spacer(6),
    c("文档版本：V1.0（最终提交版）", { size: 20, color: GRAY }),
    c("编制日期：2026 年 9 月", { size: 20, color: GRAY }),
    c("基座模型：Qwen 系列（经阿里云百炼平台调用）", { size: 20, color: GRAY }),
  ];
  function INKish() { return "1F2937"; }
}

// ---- TOC (cached entries + real TOC field) ----
const tocPages = [3,4,5,6,7,8,11,12,13,15,17,18,20,20,21,22,23,24,26,27];
function tocBlock(entries) {
  const xmlEscape = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const cached = entries.map((t, i) =>
    `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9000"/></w:tabs></w:pPr><w:r><w:t>${xmlEscape(t)}</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>${tocPages[i] ?? ""}</w:t></w:r></w:p>`).join("");
  return ImportedXmlComponent.fromXmlString(`<w:sdt xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:sdtPr><w:alias w:val="目录"/></w:sdtPr>
    <w:sdtContent>
      <w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/>
        <w:instrText xml:space="preserve"> TOC \\o &quot;1-1&quot; \\h \\z \\u </w:instrText>
        <w:fldChar w:fldCharType="separate"/></w:r></w:p>
      ${cached}
      <w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
    </w:sdtContent>
  </w:sdt>`).root[0];
}

// ---- assemble ----
const coverKids = coverChildren();
const bodyKids = [];
for (const b of blocks) {
  if (b.type === "cover") continue;
  if (b.type === "toc") {
    bodyKids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 200 },
      children: [new TextRun({ text: "目　录", font, size: 34, bold: true, color: DEEP })] }));
    bodyKids.push(tocBlock(b.entries));
    bodyKids.push(new Paragraph({ children: [new PageBreak()] }));
    continue;
  }
  if (b.type === "h1") bodyKids.push(h1(b.runs));
  else if (b.type === "h2") bodyKids.push(h2(b.runs));
  else if (b.type === "p") bodyKids.push(para(runsToRuns(b.runs), { indent: { firstLine: convertInchesToTwip(0.33) } }));
  else if (b.type === "small") bodyKids.push(para(runsToRuns(b.runs, { size: 18, color: GRAY })));
  else if (b.type === "li") {
    if (b.kind === "checklist") {
      bodyKids.push(para([new TextRun({ text: "□ ", font, size: 21, bold: true, color: DEEP }), ...runsToRuns(b.runs)],
        { indent: { left: 300, hanging: 0 } }));
    } else {
      bodyKids.push(para(runsToRuns(b.runs), { numbering: { reference: "bullets", level: 0 } }));
    }
  }
  else if (b.type === "fig") bodyKids.push(...figBlock(b));
  else if (b.type === "table") bodyKids.push(...tableBlock(b));
  else if (b.type === "blank") {
    bodyKids.push(new Table({
      width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W],
      borders: { top: { style: BorderStyle.SINGLE, size: 6, color: "C7D4E8" },
                 bottom: { style: BorderStyle.SINGLE, size: 6, color: "C7D4E8" },
                 left: { style: BorderStyle.SINGLE, size: 6, color: "C7D4E8" },
                 right: { style: BorderStyle.SINGLE, size: 6, color: "C7D4E8" },
                 insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
      rows: [new TableRow({ height: { value: b.size === "tall" ? 2950 : 2250, rule: "atLeast" },
        children: [new TableCell({ width: { size: TEXT_W, type: WidthType.DXA }, children: [para(run(""))] })] })],
    }));
    bodyKids.push(para(run("", { size: 8 })));
  }
  else if (b.type === "note") bodyKids.push(...boxBlock(b, "F4F8FF", DEEP));
  else if (b.type === "warn") bodyKids.push(...boxBlock(b, "FFFBEB", "D97706"));
  else if (b.type === "fill") bodyKids.push(...boxBlock(b, "FFFDF5", "D97706"));
}

const doc = new Document({
  features: { updateFields: true },
  numbering: { config: [{ reference: "bullets", levels: [{
    level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 480, hanging: 240 } } },
  }] }] },
  sections: [
    { properties: { page: { margin: { top: 1300, right: 1134, bottom: 1300, left: 1134 } } },
      children: [...coverKids, new Paragraph({ children: [new PageBreak()] })] },
    { properties: { page: { margin: { top: 1300, right: 1134, bottom: 1300, left: 1134 } } },
      headers: { default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "FAR-Lab 技术方案文档｜赛道一·方向1A（XH-202619）", font, size: 16, color: "8A94A6" })],
      })] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], font, size: 16, color: "8A94A6" })],
      })] }) },
      children: bodyKids },
  ],
});

fs.writeFileSync(outputPath, await Packer.toBuffer(doc));
console.log("DOCX written:", outputPath);
