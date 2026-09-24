// Bundles the React app with esbuild into web/dist. Usage: node scripts/build-web.mjs [--watch]
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const dist = path.join(web, 'dist');
const watch = process.argv.includes('--watch');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'icon.svg']) {
  fs.copyFileSync(path.join(web, 'public', f), path.join(dist, f));
}

const options = {
  entryPoints: [path.join(web, 'src', 'main.tsx')],
  bundle: true,
  outfile: path.join(dist, 'assets', 'app.js'),
  format: 'esm',
  jsx: 'automatic',
  target: ['es2022', 'chrome110', 'safari16'],
  sourcemap: true,
  minify: !watch,
  loader: { '.css': 'css' },
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching web/src for changes...');
} else {
  await esbuild.build(options);
}
