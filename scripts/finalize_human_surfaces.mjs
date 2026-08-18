import { readFileSync, writeFileSync } from 'node:fs';

function replace(path, from, to) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes(from)) {
    if (source.includes(to)) {
      console.log(`${path}: already patched`);
      return;
    }
    throw new Error(`${path}: expected fragment not found: ${from.slice(0, 100)}`);
  }
  writeFileSync(path, source.replace(from, to));
  console.log(`${path}: patched`);
}

replace(
  'frontend/src/index.css',
  `    /* ---- Human-state semantics (never the only carrier of meaning) ---- */\n    --info: 217 71% 45%;\n    --success: 142 70% 32%;\n    --warning: 32 95% 34%;\n    --evidence: 266 55% 45%;\n    --provenance: 190 70% 32%;`,
  `    /* ---- Human-state semantics (never the only carrier of meaning) ---- */\n    --info: 217 71% 45%;\n    --evidence: 266 55% 45%;\n    --provenance: 190 70% 32%;`,
);
replace(
  'frontend/src/index.css',
  `    --ring: 217 71% 60%;\n    --info: 213 94% 68%;\n    --success: 142 70% 52%;\n    --warning: 38 92% 58%;\n    --evidence: 266 80% 72%;\n    --provenance: 188 75% 55%;`,
  `    --ring: 217 71% 60%;\n    --info: 213 94% 68%;\n    --evidence: 266 80% 72%;\n    --provenance: 188 75% 55%;`,
);

replace(
  'frontend/src/__tests__/HonestyWallPage.test.tsx',
  `      expect(sourceCard).toHaveTextContent('Source Anchor');`,
  `      expect(sourceCard).toHaveTextContent('Source anchor');`,
);
replace(
  'frontend/src/__tests__/HonestyWallPage.test.tsx',
  `      expect(hashChain).toHaveTextContent('Hash Chain Replay');`,
  `      expect(hashChain).toHaveTextContent('Hash chain replay');`,
);
replace(
  'frontend/src/__tests__/VizPage.test.tsx',
  `    expect(screen.getByTestId('dt-fired-rule')).toHaveTextContent('fired: R7_SUPPORTED');`,
  `    expect(screen.getByTestId('dt-fired-rule')).toHaveTextContent('Fired rule: R7_SUPPORTED');`,
);

replace(
  'frontend/src/pages/V2ReceiptPage.tsx',
  `  if (demoQuery.isLoading) {\n    return (\n      <div className="flex items-center justify-center min-h-[60vh]">\n        <Loader2 className="w-8 h-8 animate-spin text-primary" />\n      </div>\n    );\n  }`,
  `  if (demoQuery.isLoading) {\n    return (\n      <div className="container max-w-5xl mx-auto py-8 px-4 space-y-6">\n        <div className="space-y-2">\n          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">\n            <ScrollText className="w-8 h-8 text-primary" aria-hidden="true" />\n            {t('v2.title')}\n          </h1>\n          <p className="text-muted-foreground">{t('v2.subtitle')}</p>\n        </div>\n        <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">\n          <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />\n          <span className="sr-only">{t('app.loadingPage')}</span>\n        </div>\n      </div>\n    );\n  }`,
);
