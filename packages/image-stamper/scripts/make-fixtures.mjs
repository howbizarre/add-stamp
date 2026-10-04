#!/usr/bin/env node
/**
 * Regenerates the committed test fixtures in test/fixtures. A maintainer script that lives
 * outside the test tree on purpose: a bare `node --test` would otherwise discover and run it.
 * it borrows `sharp` from the repository root's devDependencies so this package does not
 * have to carry a native image library just to make three small files.
 *
 *   photo-400x300.png     a landscape frame with a gradient, so JPEG output varies with it
 *   stamp-50x40.png       transparent edges and an opaque red centre, like a real logo
 *   portrait-exif6.jpg    400x300 pixels tagged EXIF Orientation 6: displayed as 300x400,
 *                         so a correctly uprighted output comes back portrait
 *
 * Run with `npm run fixtures` from packages/image-stamper.
 */

import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const fixturesDir = join(here, '..', 'test', 'fixtures');
const sharp = createRequire(join(repoRoot, 'package.json'))('sharp');

function gradient(width, height) {
  const raw = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      raw[i] = Math.round((x / (width - 1)) * 255);
      raw[i + 1] = Math.round((y / (height - 1)) * 255);
      raw[i + 2] = 128;
      raw[i + 3] = 255;
    }
  }

  return raw;
}

function logo(width, height) {
  const raw = Buffer.alloc(width * height * 4);

  for (let y = 10; y < height - 10; y++) {
    for (let x = 10; x < width - 10; x++) {
      const i = (y * width + x) * 4;

      raw[i] = 255;
      raw[i + 3] = 255;
    }
  }

  return raw;
}

const photo = await sharp(gradient(400, 300), { raw: { width: 400, height: 300, channels: 4 } }).png().toBuffer();
const stamp = await sharp(logo(50, 40), { raw: { width: 50, height: 40, channels: 4 } }).png().toBuffer();
const portrait = await sharp(gradient(400, 300), { raw: { width: 400, height: 300, channels: 4 } })
  .jpeg({ quality: 90 })
  .withMetadata({ orientation: 6 })
  .toBuffer();

await writeFile(join(fixturesDir, 'photo-400x300.png'), photo);
await writeFile(join(fixturesDir, 'stamp-50x40.png'), stamp);
await writeFile(join(fixturesDir, 'portrait-exif6.jpg'), portrait);

console.log(`photo ${photo.length} B, stamp ${stamp.length} B, portrait ${portrait.length} B`);
