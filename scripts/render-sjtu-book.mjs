import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(process.argv[2] ?? 'artifacts/sjtu-125');
const questions = JSON.parse(fs.readFileSync(path.join(root, 'source/questions.json'), 'utf8'));
const pandoc = process.env.FARLAB_PANDOC_PATH ?? 'pandoc';
const convert = (args, input) => execFileSync(pandoc, args, { input, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
const inlines = text => text.split(/\s+/).flatMap((word, i) => [...(i ? [{ t: 'Space' }] : []), { t: 'Str', c: word }]);
const book = JSON.parse(convert(['--from=gfm', '--to=json'], '# FAR-Lab SJTU 125 Questions\n\nModel: qwen3.7-max. Research outputs and artifact verification do not establish scientific truth. Unavailable evidence and unperformed experiments remain explicitly identified.\n'));
let reports = 0;
for (const question of questions) {
  const id = String(question.id).padStart(3, '0');
  book.blocks.push({ t: 'Header', c: [1, [`question-${id}`, [], []], inlines(`${id}. ${question.title}`)] });
  const file = path.join(root, 'results', id, 'report.md');
  if (!fs.existsSync(file)) {
    book.blocks.push({ t: 'Para', c: inlines('REPORT NOT AVAILABLE. See the per-question status and execution records.') });
    continue;
  }
  // Native reports omit a block boundary before pipe tables. Add only that
  // whitespace for rendering; the hash-verified report bytes stay untouched.
  const markdown = fs.readFileSync(file, 'utf8').replace(/(^|\n)(\|[^\n]+\|\r?\n\|(?:[ :-]+\|)+[ \t]*\r?$)/gm, '$1\n$2');
  const parsed = JSON.parse(convert(['--from=gfm', '--to=json'], markdown));
  for (const block of parsed.blocks) {
    if (block.t === 'Header') {
      if (block.c[0] === 1) continue;
      block.c[1][0] = `${id}-${block.c[1][0]}`;
    }
    book.blocks.push(block);
  }
  reports++;
}
const input = JSON.stringify(book);
const title = 'FAR-Lab - SJTU 125 Scientific Questions';
convert(['--from=json', '--to=docx', '--standalone', '--toc', '--toc-depth=1', `--metadata=title:${title}`, `--output=${path.join(root, 'FAR-Lab_125_Reports.docx')}`], input);
book.meta['header-includes'] = { t: 'MetaBlocks', c: [{ t: 'RawBlock', c: ['html', '<style>body{max-width:1200px;padding:24px;font-family:system-ui,sans-serif;overflow-wrap:anywhere}h1{font-size:28px}h2{font-size:22px}h3{font-size:18px}table{display:block;max-width:100%;overflow-x:auto}th,td{min-width:90px;overflow-wrap:anywhere}a{color:#066a73}@media(max-width:650px){body{padding:12px}h1{font-size:23px}}</style>'] }] };
convert(['--from=json', '--to=html5', '--standalone', '--toc', '--toc-depth=1', '--metadata=lang:zh-CN', `--metadata=title:${title}`, `--output=${path.join(root, 'FAR-Lab_125_Reports.html')}`], JSON.stringify(book));
console.log(JSON.stringify({ renderedReports: reports, questions: questions.length, formats: ['docx', 'html'], pandocVersion: convert(['--version']).split('\n')[0] }));
