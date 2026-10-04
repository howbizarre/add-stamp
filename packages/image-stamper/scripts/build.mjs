#!/usr/bin/env node
/**
 * Builds the `@howbizarre/image-stamper` npm package.
 *
 * Two steps, each runnable on its own:
 *
 *   1. `--wasm`  compiles the Rust crate in ../../wasm with wasm-pack (target `web`) into
 *                ./wasm, then removes the package.json and .gitignore wasm-pack writes
 *                there — this package has its own.
 *   2. `--licenses` regenerates THIRD-PARTY-LICENSES.md from the crate's Cargo.lock.
 *   3. `--ts`    compiles the TypeScript wrapper in ./src into ./dist with tsc.
 *
 * With no flag all three run, followed by `--check`, which verifies that every file the
 * package.json `files` list promises actually exists and is non-empty. `prepack` runs the
 * check too, so `npm pack` and `npm publish` refuse to ship a package with a missing or
 * empty .wasm — the one failure that would otherwise surface only in a consumer's browser.
 *
 * `--clean` removes ./wasm and ./dist.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const crateDir = resolve(packageRoot, '..', '..', 'wasm');
const wasmOutDir = join(packageRoot, 'wasm');
const distDir = join(packageRoot, 'dist');

/** Written by wasm-pack into the out-dir; superseded by this package's own files. */
const WASM_PACK_EXTRAS = ['package.json', '.gitignore', 'README.md', 'LICENSE', 'LICENSE.md'];

/** Everything `files` in package.json promises, relative to the package root. */
const REQUIRED = [
  'wasm/image_stamper.js',
  'wasm/image_stamper_bg.wasm',
  'wasm/image_stamper.d.ts',
  'wasm/image_stamper_bg.wasm.d.ts',
  'CHANGELOG.md',
  'FONT-LICENSE.md',
  'THIRD-PARTY-LICENSES.md',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/node.js',
  'dist/node.d.ts',
  'dist/core.js',
  'dist/core.d.ts',
  'dist/color.js',
  'dist/color.d.ts'
];

function fail(message) {
  console.error(`\n[image-stamper] ERROR: ${message}\n`);
  process.exit(1);
}

function run(line, cwd) {
  console.log(`[image-stamper] ${line}`);

  // shell: true so `wasm-pack` resolves through PATHEXT on Windows. The command goes in as
  // one string: every argument is a fixed literal, so there is nothing to escape, and Node
  // warns (DEP0190) when an args array is concatenated under a shell.
  const result = spawnSync(line, { cwd, stdio: 'inherit', shell: true });

  if (result.error) fail(`failed to spawn: ${result.error.message}`);
  if (result.status !== 0) fail(`"${line}" exited with code ${result.status}`);
}

function buildWasm() {
  if (!existsSync(join(crateDir, 'Cargo.toml'))) {
    fail(`no Rust crate at ${crateDir}. This package is built from the add-stamp repository.`);
  }

  // A stale artifact must not survive a failed build.
  rmSync(wasmOutDir, { recursive: true, force: true });

  // --out-dir is resolved against the crate directory, hence the absolute path.
  run(`wasm-pack build --release --target web --out-dir "${wasmOutDir}" --out-name image_stamper`, crateDir);

  for (const name of WASM_PACK_EXTRAS) {
    rmSync(join(wasmOutDir, name), { force: true });
  }
}

function buildLicenses() {
  run(`node "${join(packageRoot, 'scripts', 'third-party-licenses.mjs')}"`, packageRoot);
}

function buildTs() {
  if (!existsSync(join(wasmOutDir, 'image_stamper.d.ts'))) {
    fail('wasm/image_stamper.d.ts is missing; the TypeScript wrapper imports its types. Run with --wasm first.');
  }

  rmSync(distDir, { recursive: true, force: true });

  // Resolve tsc from this package's own node_modules rather than trusting PATH, and run it
  // through the current Node so the same binary is used everywhere.
  const require = createRequire(join(packageRoot, 'package.json'));
  let tscPackage;

  try {
    tscPackage = require.resolve('typescript/package.json');
  } catch {
    fail('typescript is not installed. Run `npm install` in packages/image-stamper first.');
  }

  const tscBin = join(dirname(tscPackage), JSON.parse(readFileSync(tscPackage, 'utf8')).bin.tsc);

  run(`node "${tscBin}" -p tsconfig.json`, packageRoot);

  // The declarations (ours and the generated glue's) mention Symbol.dispose, which exists
  // only in lib esnext.disposable; a consumer on lib ["ES2022", "DOM"] with skipLibCheck
  // off would otherwise fail to type-check this package. src/core.ts carries the directive,
  // but tsc 7 does not copy it into the emitted .d.ts, so it is put there here.
  const coreDts = join(distDir, 'core.d.ts');
  const directive = '/// <reference lib="esnext.disposable" />' + String.fromCharCode(10);
  const emitted = readFileSync(coreDts, 'utf8');

  if (!emitted.startsWith(directive)) {
    writeFileSync(coreDts, directive + emitted);
  }
}

function check() {
  const missing = [];

  for (const relative of REQUIRED) {
    const path = join(packageRoot, relative);

    if (!existsSync(path)) {
      missing.push(`${relative} (missing)`);
    } else if (statSync(path).size === 0) {
      missing.push(`${relative} (empty)`);
    }
  }

  if (missing.length > 0) {
    fail(`the package is not complete:\n  - ${missing.join('\n  - ')}\nRun \`npm run build\`.`);
  }

  for (const name of WASM_PACK_EXTRAS) {
    if (existsSync(join(wasmOutDir, name))) {
      fail(`wasm/${name} was left behind by wasm-pack and would be published. Run \`npm run build:wasm\`.`);
    }
  }

  const wasmSize = statSync(join(packageRoot, 'wasm/image_stamper_bg.wasm')).size;

  // Both units, because npm and the bundlers report decimal kB while the file system shows KiB.
  console.log(`[image-stamper] ok — image_stamper_bg.wasm is ${(wasmSize / 1024).toFixed(1)} KiB (${(wasmSize / 1000).toFixed(1)} kB)`);
}

function clean() {
  for (const dir of [wasmOutDir, distDir]) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`[image-stamper] removed ${dir}`);
  }
}

const mode = process.argv[2];

switch (mode) {
  case undefined:
    buildWasm();
    buildLicenses();
    buildTs();
    check();
    break;
  case '--licenses':
    buildLicenses();
    break;
  case '--wasm':
    buildWasm();
    break;
  case '--ts':
    buildTs();
    break;
  case '--check':
    check();
    break;
  case '--clean':
    clean();
    break;
  default:
    fail(`unknown argument "${mode}". Expected --wasm, --licenses, --ts, --check, --clean, or nothing.`);
}
