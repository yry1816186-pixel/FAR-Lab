// scripts/build_cli.mjs — bundles the `far` CLI to dist/far.js (plain JS) so the
// package is `npm install -g`-able. Node 24 forbids type-stripping inside
// node_modules, so the .ts bin can't run when installed; this bundle sidesteps
// that. All node_modules deps (better-sqlite3, fastify, …) stay external
// (resolved from the installer's node_modules at runtime); only src/ is bundled.
import { build } from 'esbuild';

try {
  const result = await build({
    entryPoints: ['src/cli/far.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    outfile: 'dist/far.js',
    packages: 'external',
    // no banner: src/cli/far.ts already carries the shebang, which esbuild preserves at line 1
    sourcemap: false,
    minify: false,
    logLevel: 'info',
    allowOverwrite: true,
    legalComments: 'none',
  });
  console.log('build OK:', JSON.stringify(result, null, 2));
} catch (err) {
  console.error('build FAILED:', err.message);
  process.exit(1);
}
