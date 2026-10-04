#!/usr/bin/env node
/**
 * Writes THIRD-PARTY-LICENSES.md: every Rust crate linked into image_stamper_bg.wasm, the
 * licence this package takes it under, and that licence's text as the crate itself ships
 * it. Generated from `cargo metadata` on the crate in ../../wasm and the local cargo
 * registry, so it follows Cargo.lock rather than a hand-kept list.
 *
 * Why it exists: MIT and BSD require the copyright notice and licence text to accompany
 * binary distributions, and Apache-2.0 requires a copy of the licence. A hand-written
 * table of five direct dependencies does not meet that for the 32 crates actually in the
 * binary, and drifts the first time a dependency changes.
 *
 * Only crates that end up in the binary are listed: normal dependencies reachable from the
 * root, excluding proc-macro crates and build/dev dependencies, which run at compile time
 * on the build machine and contribute no code to the artifact.
 *
 * Run with `npm run licenses`; `npm run build` runs it after the wasm step. Fails loudly if
 * a crate's licence file cannot be found, so a new dependency cannot slip through
 * unattributed.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const crateDir = resolve(packageRoot, '..', '..', 'wasm');
const outputPath = join(packageRoot, 'THIRD-PARTY-LICENSES.md');

/**
 * When a crate offers a choice, this package takes it under the first of these that is
 * offered. MIT first because its obligations are the lightest and most widely understood.
 */
const PREFERENCE = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'Zlib', '0BSD', 'Unlicense', 'Unicode-3.0'];

/** How each licence's text file is usually named inside a crate. Checked before the generic names. */
const FILE_HINTS = {
  'MIT': /^LICEN[CS]E[-_.]?MIT/i,
  'Apache-2.0': /^LICEN[CS]E[-_.]?APACHE/i,
  'Zlib': /^LICEN[CS]E[-_.]?ZLIB/i,
  '0BSD': /^LICEN[CS]E[-_.]?0BSD/i,
  'Unlicense': /^UNLICENSE/i,
  'Unicode-3.0': /^LICEN[CS]E[-_.]?UNICODE/i,
  'BSD-2-Clause': /^LICEN[CS]E[-_.]?BSD/i,
  'BSD-3-Clause': /^LICEN[CS]E[-_.]?BSD/i
};

const GENERIC = /^(LICEN[CS]E|COPYING)(\.(md|txt))?$/i;

function fail(message) {
  console.error(`\n[third-party-licenses] ERROR: ${message}\n`);
  process.exit(1);
}

/**
 * Picks the licences this package uses a crate under, from an SPDX-ish expression such as
 * "MIT OR Apache-2.0", "Apache-2.0/MIT" or "(MIT OR Apache-2.0) AND Unicode-3.0". Every
 * AND-ed group contributes one choice.
 */
function choose(expression) {
  const normalized = expression.replace(/\//g, ' OR ');

  return normalized.split(/\s+AND\s+/).map((group) => {
    const options = group.replace(/[()]/g, '').split(/\s+OR\s+/).map((s) => s.trim()).filter(Boolean);
    const pick = PREFERENCE.find((candidate) => options.includes(candidate));

    if (!pick) fail(`no supported licence among "${expression}"; extend PREFERENCE`);

    return pick;
  });
}

function findLicenseFile(dir, license, names) {
  const hinted = names.find((name) => FILE_HINTS[license]?.test(name));

  if (hinted) return hinted;

  const generic = names.find((name) => GENERIC.test(name));

  if (generic) return generic;

  return null;
}

const metadata = JSON.parse(
  execFileSync('cargo', ['metadata', '--format-version', '1', '--offline'], { cwd: crateDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
);

const packagesById = new Map(metadata.packages.map((p) => [p.id, p]));
const nodesById = new Map(metadata.resolve.nodes.map((n) => [n.id, n]));
const rootId = metadata.resolve.root;
const root = packagesById.get(rootId);

const linked = new Set();
const stack = [rootId];

while (stack.length > 0) {
  const id = stack.pop();

  if (linked.has(id)) continue;

  linked.add(id);

  for (const dep of nodesById.get(id).deps) {
    const isNormal = dep.dep_kinds.some((k) => k.kind === null || k.kind === 'normal');
    const pkg = packagesById.get(dep.pkg);
    const isProcMacro = pkg.targets.some((t) => t.kind.includes('proc-macro'));

    if (isNormal && !isProcMacro) stack.push(dep.pkg);
  }
}

linked.delete(rootId);

const crates = [...linked]
  .map((id) => packagesById.get(id))
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const rows = [];
const notices = [];

for (const crate of crates) {
  if (!crate.license) fail(`${crate.name} ${crate.version} declares no license field`);

  const dir = dirname(crate.manifest_path);
  const names = readdirSync(dir);
  const chosen = choose(crate.license);
  const texts = [];

  for (const license of chosen) {
    const file = findLicenseFile(dir, license, names);

    if (!file) fail(`${crate.name} ${crate.version}: no licence file for ${license} in ${dir} (found: ${names.join(', ')})`);

    texts.push({ license, file, text: readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim() });
  }

  const notice = names.find((name) => /^NOTICE/i.test(name));

  if (notice) {
    texts.push({ license: 'NOTICE', file: notice, text: readFileSync(join(dir, notice), 'utf8').replace(/\r\n/g, '\n').trim() });
  }

  const repository = crate.repository ? `<${crate.repository}>` : '';

  rows.push(`| ${crate.name} | ${crate.version} | ${crate.license} | ${chosen.join(' AND ')} | ${repository} |`);
  notices.push(
    `### ${crate.name} ${crate.version}\n\n` +
      `Used under ${chosen.join(' AND ')} (offered as \`${crate.license}\`).${repository ? ` ${repository}` : ''}\n\n` +
      texts.map((t) => `\`${t.file}\`:\n\n\`\`\`text\n${t.text}\n\`\`\``).join('\n\n')
  );
}

const output = `# Third-party licences

\`image_stamper_bg.wasm\` is compiled from the \`${root.name}\` crate, version ${root.version}, together
with the ${crates.length} Rust crates below. Each is used under the licence named in the fourth column,
chosen from what the crate offers; the full text of that licence, as the crate ships it, follows in
the notices section.

This file is generated by \`scripts/third-party-licenses.mjs\` from \`wasm/Cargo.lock\`. Do not edit it
by hand. The embedded Ubuntu font is covered separately in [FONT-LICENSE.md](./FONT-LICENSE.md).

## Crates

| Crate | Version | Offered as | Used under | Repository |
| --- | --- | --- | --- | --- |
${rows.join('\n')}

## Notices

${notices.join('\n\n')}
`;

writeFileSync(outputPath, output);

console.log(`[third-party-licenses] ${crates.length} crates -> THIRD-PARTY-LICENSES.md (${(output.length / 1024).toFixed(0)} KiB)`);
