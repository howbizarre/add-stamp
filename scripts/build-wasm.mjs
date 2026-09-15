#!/usr/bin/env node
/**
 * Builds the Rust image-stamper crate to WebAssembly and publishes the artifact to
 * public/wasm/.
 *
 * Replaces the previous Windows-only npm scripts (`if not exist`, `xcopy`, `rmdir /s /q`),
 * which could not run on Linux or macOS and therefore not in CI.
 *
 * Two behaviours the old scripts lacked:
 *   1. Only the four files the browser actually needs are copied. `xcopy /Y /E pkg\*`
 *      also published wasm-pack's generated package.json and .gitignore, which ended up
 *      served publicly at /wasm/package.json.
 *   2. A missing .wasm is a hard failure. `nuxt build` does not know about the runtime
 *      import() of /wasm/v<version>/image_stamper.js, so without this check a deploy with an
 *      empty public/wasm/ succeeds and only fails when a user clicks "Apply stamp".
 *
 * Usage:
 *   node scripts/build-wasm.mjs          build the crate, then publish
 *   node scripts/build-wasm.mjs --copy   publish an existing wasm/pkg/ without rebuilding
 *   node scripts/build-wasm.mjs --clean  remove wasm/pkg/ and public/wasm/
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmCrateDir = join(repoRoot, 'wasm');
const pkgDir = join(wasmCrateDir, 'pkg');
const publicWasmDir = join(repoRoot, 'public', 'wasm');

/**
 * The artifact goes in a version-stamped directory rather than at a fixed path.
 *
 * The glue JS locates its .wasm relative to its own URL, and the two must match exactly on
 * wasm-bindgen's schema version. Serving both from a fixed path meant a browser could hold a
 * cached glue from one deploy and fetch the .wasm from the next — a runtime schema error
 * that is very hard to diagnose. Inside a versioned directory they move as a pair, and the
 * files can be cached immutably.
 */
const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;
const versionDir = join(publicWasmDir, `v${version}`);

/** The only files the browser needs. The .d.ts files are for editor tooling. */
const ARTIFACTS = ['image_stamper.js', 'image_stamper_bg.wasm', 'image_stamper.d.ts', 'image_stamper_bg.wasm.d.ts'];

/** Without this, a missing .wasm is indistinguishable from a successful build. */
const REQUIRED = ['image_stamper.js', 'image_stamper_bg.wasm'];

function fail(message) {
  console.error(`\n[build-wasm] ERROR: ${message}\n`);
  process.exit(1);
}

function run(command, args, cwd) {
  const line = `${command} ${args.join(' ')}`;

  console.log(`[build-wasm] ${line}`);

  // shell: true so `wasm-pack` resolves via PATHEXT on Windows (wasm-pack.exe / .cmd).
  // The whole command goes in as one string rather than as an args array, because Node
  // warns (DEP0190) that array args are concatenated unescaped under a shell. Every
  // argument here is a fixed literal, so there is nothing to escape.
  const result = spawnSync(line, { cwd, stdio: 'inherit', shell: true });

  if (result.error) fail(`failed to spawn ${command}: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} exited with code ${result.status}`);
}

function clean() {
  for (const dir of [pkgDir, publicWasmDir]) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`[build-wasm] removed ${dir}`);
  }
}

function build() {
  run('wasm-pack', ['build', '--target', 'web', '--out-dir', 'pkg', '--out-name', 'image_stamper'], wasmCrateDir);
}

function publish() {
  if (!existsSync(pkgDir)) {
    fail(`${pkgDir} does not exist. Run without --copy to build the crate first.`);
  }

  // Wipe the whole tree, not just this version's directory: old versions would otherwise
  // pile up in public/ forever and ship with every deploy.
  rmSync(publicWasmDir, { recursive: true, force: true });
  mkdirSync(versionDir, { recursive: true });

  for (const name of ARTIFACTS) {
    const from = join(pkgDir, name);

    if (!existsSync(from)) {
      // .d.ts files are optional; the JS and .wasm are not.
      if (REQUIRED.includes(name)) fail(`wasm-pack did not produce ${name}`);

      console.warn(`[build-wasm] skipping optional ${name} (not produced)`);
      continue;
    }

    copyFileSync(from, join(versionDir, name));
  }

  // Verify at the destination, not the source: a failed copy must not pass as success.
  for (const name of REQUIRED) {
    const target = join(versionDir, name);

    if (!existsSync(target)) fail(`${target} is missing after copy`);

    const { size } = statSync(target);

    if (size === 0) fail(`${target} is empty`);

    console.log(`[build-wasm] ${name} -> public/wasm/v${version}/ (${(size / 1024).toFixed(1)} KB)`);
  }

  console.log(`[build-wasm] done — served from /wasm/v${version}/`);
}

const mode = process.argv[2];

if (mode === '--clean') {
  clean();
} else if (mode === '--copy') {
  publish();
} else if (mode === undefined) {
  build();
  publish();
} else {
  fail(`unknown argument "${mode}". Expected --copy, --clean, or no argument.`);
}
