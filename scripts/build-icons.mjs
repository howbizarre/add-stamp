/**
 * Renders the whole icon set and the share card from one vector source.
 *
 * Run by hand — `node scripts/build-icons.mjs` — not from `npm run build`. The text is
 * rasterised through whatever font the machine has, so a CI box with a different font stack
 * would silently produce a different mark; the outputs are committed instead, and this file
 * is here so the next change starts from the same source rather than from a bitmap.
 *
 * Everything lands in public/, which Nuxt serves from the site root.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');

/** Straight from the Passepartout tokens in app/assets/css/main.css. */
const CORAL = '#ee6f52';
const AMBER = '#fbbf24';
const PAPER = '#f2ebe0';
const INK = '#232a31';
const INK_2 = '#5b656f';
const TEAL_SOFT = '#d2e7e5';
const CORAL_SOFT = '#fbdbd0';
const SAGE = '#b9c685';

/**
 * CSS `linear-gradient(145deg, …)` in SVG terms.
 *
 * The line runs along (sin 145°, −cos 145°) = (0.574, 0.819) and, for a square, spans
 * (S·|sin| + S·|cos|) / 2 either side of the centre. Expressed in the bounding box it ends
 * at 57 % across, which leaves the bottom two thirds of the tile flat amber — hence the
 * explicit user-space endpoints.
 */
const GRADIENT = `
<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="51" y1="-36" x2="461" y2="548">
  <stop offset="0" stop-color="${CORAL}"/>
  <stop offset="1" stop-color="${AMBER}"/>
</linearGradient>`;

/**
 * The badge from the masthead, as a standalone tile.
 *
 * Two settings, because the mark is read at two very different sizes. Above ~48 px the
 * masthead's own proportions apply. At and below it the letters need more of the tile and
 * the corners need less of it, or "AS" turns into a smudge in the tab strip — the same
 * reason a typeface ships an optical size.
 *
 * `radius: 0` is for the Apple touch icon: iOS masks it itself, and rounds twice otherwise.
 */
const SETTINGS = {
  large: { radius: 118, fontSize: 268, tracking: -8 },
  small: { radius: 96, fontSize: 296, tracking: -14 },
  square: { radius: 0, fontSize: 268, tracking: -8 },

  // Android masks this one to a circle and may crop to the inner 80 %. The letters shrink
  // to sit inside that safe zone; the gradient is what fills the corners that get cut.
  maskable: { radius: 0, fontSize: 196, tracking: -6, baseline: 322 }
};

const badge = (size, setting = 'large') => {
  const { radius, fontSize, tracking, baseline = 352 } = SETTINGS[setting];

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>${GRADIENT}</defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#g)"/>
  <text x="256" y="${baseline}" text-anchor="middle"
        font-family="Segoe UI, Tahoma, Arial, sans-serif" font-size="${fontSize}" font-weight="700"
        letter-spacing="${tracking}" fill="#ffffff">AS</text>
</svg>`;
};

/** ICO is a 6-byte header, one 16-byte entry per size, then the PNGs whole. */
const ico = (entries) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;

  const directory = entries.map(({ size, data }) => {
    const row = Buffer.alloc(16);
    row.writeUInt8(size === 256 ? 0 : size, 0);
    row.writeUInt8(size === 256 ? 0 : size, 1);
    row.writeUInt8(0, 2);
    row.writeUInt8(0, 3);
    row.writeUInt16LE(1, 4);
    row.writeUInt16LE(32, 6);
    row.writeUInt32LE(data.length, 8);
    row.writeUInt32LE(offset, 12);
    offset += data.length;

    return row;
  });

  return Buffer.concat([header, ...directory, ...entries.map(entry => entry.data)]);
};

/**
 * The 1200x630 card that Slack, X, LinkedIn and Facebook unfurl.
 *
 * Deliberately the app's own surface — paper, the three blurred blobs, the badge, the
 * chips — rather than a screenshot: a screenshot of a tool with an empty dropzone says
 * nothing at thumbnail size, and goes stale on the next redesign.
 */
const card = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.574" y2="0.819">
      <stop offset="0" stop-color="${CORAL}"/>
      <stop offset="1" stop-color="${AMBER}"/>
    </linearGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="90"/>
    </filter>
  </defs>

  <rect width="1200" height="630" fill="${PAPER}"/>

  <g filter="url(#soft)" opacity="0.5">
    <circle cx="80" cy="60" r="260" fill="${TEAL_SOFT}"/>
    <circle cx="1140" cy="300" r="230" fill="${CORAL_SOFT}"/>
    <circle cx="640" cy="700" r="250" fill="${SAGE}" opacity="0.45"/>
  </g>

  <rect x="72" y="86" width="104" height="104" rx="30" fill="url(#g)"/>
  <text x="124" y="159" text-anchor="middle"
        font-family="Segoe UI, Tahoma, Arial, sans-serif" font-size="54" font-weight="700"
        letter-spacing="-2" fill="#ffffff">AS</text>

  <text x="200" y="152" font-family="Segoe UI, Tahoma, Arial, sans-serif"
        font-size="34" font-weight="600" letter-spacing="6" fill="${INK_2}">ADD STAMP</text>

  <text x="72" y="330" font-family="Segoe UI, Tahoma, Arial, sans-serif"
        font-size="82" font-weight="700" letter-spacing="-3" fill="${INK}">Batch watermarking,</text>
  <text x="72" y="424" font-family="Segoe UI, Tahoma, Arial, sans-serif"
        font-size="82" font-weight="700" letter-spacing="-3" fill="${INK}">entirely in your browser.</text>

  <text x="72" y="494" font-family="Segoe UI, Tahoma, Arial, sans-serif"
        font-size="34" font-weight="400" fill="${INK_2}">Put your mark on a whole folder of frames. Nothing leaves the tab.</text>

  <g font-family="Consolas, Menlo, monospace" font-size="24" fill="${INK_2}">
    <rect x="72" y="536" width="196" height="50" rx="25" fill="#fdfbf8" stroke="#e2d8c9"/>
    <text x="170" y="568" text-anchor="middle">WebAssembly</text>
    <rect x="284" y="536" width="150" height="50" rx="25" fill="#fdfbf8" stroke="#e2d8c9"/>
    <text x="359" y="568" text-anchor="middle">no upload</text>
    <rect x="450" y="536" width="176" height="50" rx="25" fill="#fdfbf8" stroke="#e2d8c9"/>
    <text x="538" y="568" text-anchor="middle">free · MIT</text>
  </g>
</svg>`;

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

mkdirSync(out, { recursive: true });

// The tab strip: the tighter setting, and the mark still carries its own rounding there.
const icoSizes = await Promise.all([16, 32, 48].map(async size => ({ size, data: await png(badge(size, 'small'), size) })));
writeFileSync(join(out, 'favicon.ico'), ico(icoSizes));

writeFileSync(join(out, 'apple-touch-icon.png'), await png(badge(180, 'square'), 180));

writeFileSync(join(out, 'icon-192.png'), await png(badge(192), 192));
writeFileSync(join(out, 'icon-512.png'), await png(badge(512), 512));
writeFileSync(join(out, 'icon-maskable-512.png'), await png(badge(512, 'maskable'), 512));

writeFileSync(
  join(out, 'og-image.png'),
  await sharp(Buffer.from(card)).png({ compressionLevel: 9 }).toBuffer()
);

console.log('Wrote favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png, og-image.png');
