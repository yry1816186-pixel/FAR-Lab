import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync('/tmp/dead_code2.json', 'utf8'));
console.log('total:', d.totalExports, 'dead:', d.deadCount, 'alive:', d.aliveCount);
console.log();
console.log('=== 死导出按文件分布 ===');
const fileCount = new Map();
for (const e of d.dead) {
  fileCount.set(e.file, (fileCount.get(e.file) || 0) + 1);
}
[...fileCount.entries()].sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${f}: ${n}`));
console.log();
console.log('=== 死导出按 kind 分布 ===');
const kindCount = new Map();
for (const e of d.dead) {
  kindCount.set(e.kind, (kindCount.get(e.kind) || 0) + 1);
}
[...kindCount.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${k}: ${n}`));
console.log();
console.log('=== 全部死导出 ===');
d.dead.forEach((e) => console.log(`  ${e.file}:${e.line} ${e.kind} ${e.name}`));
