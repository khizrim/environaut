// Bundles every *.test.ts with esbuild and hands the result to node:test, so
// the tests can import the TypeScript sources directly.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { glob } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import * as esbuild from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const outDir = await mkdtemp(join(tmpdir(), 'environaut-tests-'));

const entryPoints = [];
for await (const file of glob('src/**/*.test.ts', { cwd: root })) {
  entryPoints.push(resolve(root, file));
}

if (entryPoints.length === 0) {
  console.log('No tests found.');
  process.exit(0);
}

await esbuild.build({
  entryPoints,
  outdir: outDir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['node:*'],
  sourcemap: 'inline',
});

// Node's test runner is given the bundled files explicitly: passing the
// temporary directory makes it look for a module with that name instead.
const bundled = [];
for await (const file of glob('*.test.mjs', { cwd: outDir })) {
  bundled.push(join(outDir, file));
}

const child = spawn(process.execPath, ['--test', ...bundled], { stdio: 'inherit' });
child.on('exit', async (code) => {
  await rm(outDir, { recursive: true, force: true });
  process.exit(code ?? 1);
});
