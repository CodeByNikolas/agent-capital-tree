import { build } from '../plugin/node_modules/esbuild/lib/main.js';
import { cp } from 'node:fs/promises';

await build({ entryPoints: ['capital-entry.mjs'], outfile: 'bundle/capital.mjs', bundle: true,
  platform: 'node', format: 'esm', target: 'node22',
  banner: { js: "import { createRequire as actCreateRequire } from 'node:module'; const require = actCreateRequire(import.meta.url);" } });
await cp(new URL('../plugin/bundle/visual-assets/', import.meta.url), new URL('./bundle/visual-assets/', import.meta.url), { recursive: true });
if (process.argv.includes('--tests')) {
  await build({ entryPoints: ['test/capital.test.mjs', 'test/capital-session.test.mjs', 'test/orchestration.test.mjs', 'test/keys.test.mjs'],
    outdir: 'bundle/tests', bundle: true, platform: 'node', format: 'esm', target: 'node22', outExtension: { '.js': '.mjs' },
    banner: { js: "import { createRequire as actCreateRequire } from 'node:module'; const require = actCreateRequire(import.meta.url);" } });
}
