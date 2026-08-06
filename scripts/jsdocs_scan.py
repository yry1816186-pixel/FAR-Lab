"""Independent JSDoc coverage scanner — finds exported symbols WITHOUT JSDoc.

Scans all src/**/*.ts (excluding tests), checks every exported declaration
(function/const/interface/type/class/enum) for a preceding /** block.
Writes a fresh report to docs/audits/jsdoc_missing_REFRESHED.txt.
"""
import os
import re
from collections import Counter

SRC = 'src'
REPORT = 'docs/audits/jsdoc_missing_REFRESHED.txt'

# Match exported declarations (multi-line aware via a state machine instead).
EXPORT_RE = re.compile(r'^\s*export\s+(?:async\s+)?(?:function|const|interface|type|class|enum)\s+([A-Za-z0-9_]+)')

missing = []
total = 0
for root, dirs, files in os.walk(SRC):
    dirs[:] = [d for d in dirs if d not in ('node_modules', '__pycache__')]
    for fn in sorted(files):
        if not fn.endswith('.ts'):
            continue
        path = os.path.join(root, fn).replace('\\', '/')
        lines = open(path, encoding='utf-8').read().splitlines()
        # state: 0=normal, 1=inside block comment
        state = 0
        for i, line in enumerate(lines):
            stripped = line.strip()
            if state == 1:
                if '*/' in stripped:
                    state = 0
                continue
            if stripped.startswith('/*'):
                state = 1
                continue
            m = EXPORT_RE.match(line)
            if not m:
                continue
            name = m.group(1)
            total += 1
            # Look back: skip blank lines; a multi-line JSDoc body line starts
            # with "*" (e.g. "* @returns ... */") and its opening "/**" may be
            # several lines above — walk up through all *-prefixed lines.
            j = i - 1
            has_doc = False
            while j >= 0:
                prev = lines[j].strip()
                if prev == '':
                    j -= 1
                    continue
                if prev.startswith('/**'):
                    has_doc = True
                    break
                if prev.startswith('*') or prev.startswith('/*'):
                    j -= 1
                    continue
                break
            if not has_doc:
                missing.append((path, i + 1, name))

print(f'exported symbols scanned: {total}')
print(f'missing JSDoc: {len(missing)}')
per_file = Counter(p for p, _, _ in missing)
print('\n=== MISSING BY FILE ===')
for p, c in per_file.most_common():
    print(f'  {p}: {c}')

with open(REPORT, 'w', encoding='utf-8') as f:
    f.write(f'# Missing JSDoc (refreshed 2026-08-06): {len(missing)} symbols across {len(per_file)} files\n')
    f.write(f'# Scanned: {total} exported declarations in src/**/*.ts\n\n')
    for p, c in per_file.most_common():
        f.write(f'### {p} ({c} missing)\n')
        for path, lineno, name in missing:
            if path == p:
                f.write(f'  {path}:{lineno}  {name}\n')
        f.write('\n')
print(f'\nreport written: {REPORT}')
