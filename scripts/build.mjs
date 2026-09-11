// Builds the loadable extension into dist/ (load unpacked -> dist).
// Bundles ESM sources into classic scripts (content scripts cannot be ESM in
// Chrome MV3 at document_start), copies static assets, generates icons.
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, cpSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(resolve(dist, 'vendor'), { recursive: true });

const common = {
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['chrome110'],
  legalComments: 'none',
  logLevel: 'warning',
};

async function main() {
  await Promise.all([
    build({ ...common, entryPoints: [resolve(root, 'src/content/main.js')], outfile: resolve(dist, 'content.js'), format: 'iife' }),
    build({ ...common, entryPoints: [resolve(root, 'src/background/service-worker.js')], outfile: resolve(dist, 'background.js'), format: 'iife' }),
    build({ ...common, entryPoints: [resolve(root, 'src/popup/popup-main.js')], outfile: resolve(dist, 'popup.js'), format: 'iife' }),
    build({ ...common, entryPoints: [resolve(root, 'src/options/options-main.js')], outfile: resolve(dist, 'options.js'), format: 'iife' }),
  ]);

  copyFileSync(resolve(root, 'src/manifest.json'), resolve(dist, 'manifest.json'));
  copyFileSync(resolve(root, 'src/popup/popup.html'), resolve(dist, 'popup.html'));
  copyFileSync(resolve(root, 'src/popup/popup.css'), resolve(dist, 'popup.css'));
  copyFileSync(resolve(root, 'src/options/options.html'), resolve(dist, 'options.html'));
  copyFileSync(resolve(root, 'src/options/options.css'), resolve(dist, 'options.css'));

  // vendor/axe.min.js must match the CLI's axe major version (v4). Pinned in
  // package.json (axe-core 4.13.0 = @axe-core/playwright 4.13.0).
  const axe = resolve(root, 'node_modules/axe-core/axe.min.js');
  copyFileSync(axe, resolve(dist, 'vendor/axe.min.js'));

  execSync(`node ${resolve(root, 'scripts/gen-icons.mjs')}`, { stdio: 'inherit' });

  console.log('\nBuild complete -> dist/ (Load unpacked path)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});