// End-to-end tests against the built package, imported by its own name so the `exports`
// map and the `node` condition are exercised exactly as a consumer would hit them.
// Run `npm run build` first; `npm test` does not build.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, describe, it } from 'node:test';

import {
  ImageStamper,
  createImageStamper,
  defaultOptions,
  initWasm,
  isWasmReady,
  packColor,
  unpackColor
} from 'image-stamper';

import { jpegDimensions, webpDimensions } from './helpers/dimensions.mjs';

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url));

let photo;
let stamp;
let portrait;

before(async () => {
  [photo, stamp, portrait] = await Promise.all([
    fixture('photo-400x300.png'),
    fixture('stamp-50x40.png'),
    fixture('portrait-exif6.jpg')
  ]);
});

/** A stamper with the logo loaded at full opacity, so its effect is unmistakable. */
async function ready() {
  const stamper = await createImageStamper();

  await stamper.setStamp(stamp);

  return stamper;
}

describe('instantiation', () => {
  it('createImageStamper resolves to a stamper with no stamp', async () => {
    const stamper = await createImageStamper();

    assert.ok(stamper instanceof ImageStamper);
    assert.equal(stamper.hasStamp, false);
    assert.equal(stamper.stampWidth, 0);
    assert.equal(stamper.stampHeight, 0);
    assert.equal(isWasmReady(), true);

    stamper.free();
  });

  it('a second createImageStamper reuses the module and works', async () => {
    const a = await createImageStamper();
    const b = await createImageStamper();

    await b.setStamp(stamp);

    assert.equal(a.hasStamp, false, 'stampers are independent');
    assert.equal(b.hasStamp, true);

    a.free();
    b.free();
  });

  it('initWasm after the fact resolves to the same instance', async () => {
    const first = await initWasm();
    const second = await initWasm(new Uint8Array([0, 1, 2, 3]));

    assert.equal(first, second, 'a later input is ignored, not instantiated');
  });

  it('ImageStamper.create works once the module is ready', async () => {
    await initWasm();

    const stamper = ImageStamper.create();

    assert.equal(stamper.hasStamp, false);

    stamper.free();
  });
});

describe('setStamp', () => {
  it('reports the stamp dimensions', async () => {
    const stamper = await ready();

    assert.equal(stamper.hasStamp, true);
    assert.equal(stamper.stampWidth, 50);
    assert.equal(stamper.stampHeight, 40);

    stamper.free();
  });

  it('accepts a Blob', async () => {
    const stamper = await createImageStamper();

    await stamper.setStamp(new Blob([stamp]));

    assert.equal(stamper.stampWidth, 50);

    stamper.free();
  });

  it('accepts an ArrayBuffer and a view with an offset', async () => {
    const stamper = await createImageStamper();

    await stamper.setStamp(stamp.buffer.slice(stamp.byteOffset, stamp.byteOffset + stamp.byteLength));
    assert.equal(stamper.stampWidth, 50);

    // A view that does not start at byte 0 of its buffer: the bytes before it must not
    // reach the decoder.
    const padded = new Uint8Array(16 + stamp.length);

    padded.set(stamp, 16);
    stamper.setStampSync(new DataView(padded.buffer, 16, stamp.length));
    assert.equal(stamper.stampWidth, 50);

    stamper.free();
  });

  it('rejects something that is not an image, and stays usable', async () => {
    const stamper = await createImageStamper();

    await assert.rejects(stamper.setStamp(Buffer.from('definitely not a png')), /Failed to load image/);
    assert.equal(stamper.hasStamp, false);

    await stamper.setStamp(stamp);
    assert.equal(stamper.hasStamp, true);

    stamper.free();
  });

  it('applies the same size limits as a photo', async () => {
    const stamper = await createImageStamper();

    // 50x40 is 0.002 MP.
    await assert.rejects(stamper.setStamp(stamp, { maxMegapixels: 0.001 }), /too large/);
    assert.equal(stamper.hasStamp, false);

    stamper.free();
  });
});

describe('stamp', () => {
  it('produces a JPEG of the same size by default', async () => {
    const stamper = await ready();
    const result = await stamper.stamp(photo, { caption: 'IMG_0001' });

    assert.ok(result.bytes instanceof Uint8Array);
    assert.ok(result.bytes.buffer instanceof ArrayBuffer, 'a plain ArrayBuffer, usable as a BlobPart');
    assert.equal(result.bytes.byteOffset, 0);
    assert.equal(result.bytes.byteLength, result.bytes.buffer.byteLength, 'not a window onto wasm memory');
    assert.deepEqual([...result.bytes.subarray(0, 2)], [0xff, 0xd8], 'JPEG SOI marker');
    assert.deepEqual(jpegDimensions(result.bytes), { width: 400, height: 300 });
    assert.equal(result.format, 'jpeg');
    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal(result.extension, 'jpg');

    stamper.free();
  });

  it("accepts 'jpg' as an alias and reports 'jpeg'", async () => {
    const stamper = await ready();
    const result = await stamper.stamp(photo, { format: 'jpg' });

    assert.equal(result.format, 'jpeg');
    assert.equal(result.extension, 'jpg');

    stamper.free();
  });

  it('produces a WebP when asked', async () => {
    const stamper = await ready();
    const result = await stamper.stamp(photo, { format: 'webp' });

    assert.equal(Buffer.from(result.bytes.subarray(0, 4)).toString('ascii'), 'RIFF');
    assert.equal(Buffer.from(result.bytes.subarray(8, 12)).toString('ascii'), 'WEBP');
    assert.deepEqual(webpDimensions(result.bytes), { width: 400, height: 300 });
    assert.equal(result.format, 'webp');
    assert.equal(result.mimeType, 'image/webp');
    assert.equal(result.extension, 'webp');

    stamper.free();
  });

  it('uprights a frame from its EXIF orientation', async () => {
    const stamper = await ready();

    // The fixture is 400x300 pixels tagged Orientation 6 (rotate 90° clockwise to display),
    // so the uprighted, stamped output is portrait.
    assert.deepEqual(jpegDimensions(portrait), { width: 400, height: 300 }, 'fixture is stored landscape');

    const result = await stamper.stamp(portrait);

    assert.deepEqual(jpegDimensions(result.bytes), { width: 300, height: 400 });

    stamper.free();
  });

  it('the caption and the stamp both change the output', async () => {
    const stamper = await ready();

    const plain = await stamper.stamp(photo, { opacity: 100 });
    const captioned = await stamper.stamp(photo, { opacity: 100, caption: 'IMG_0001' });
    const faint = await stamper.stamp(photo, { opacity: 0 });

    assert.notDeepEqual(plain.bytes, captioned.bytes, 'the caption is drawn');
    assert.notDeepEqual(plain.bytes, faint.bytes, 'the stamp is composited');

    stamper.free();
  });

  it('accepts a Blob and a File', async () => {
    const stamper = await ready();

    const fromBlob = await stamper.stamp(new Blob([photo]));
    const fromFile = await stamper.stamp(new File([photo], 'photo.png', { type: 'image/png' }));

    assert.deepEqual(jpegDimensions(fromBlob.bytes), { width: 400, height: 300 });
    assert.deepEqual(fromBlob.bytes, fromFile.bytes);

    stamper.free();
  });

  it('stampSync works on bytes and refuses a Blob with a pointer to the async method', async () => {
    const stamper = await ready();

    const result = stamper.stampSync(photo);

    assert.deepEqual(jpegDimensions(result.bytes), { width: 400, height: 300 });
    assert.throws(() => stamper.stampSync(new Blob([photo])), /Blob needs the async method/);

    stamper.free();
  });

  it('rejects before a stamp is set', async () => {
    const stamper = await createImageStamper();

    await assert.rejects(stamper.stamp(photo), /Stamp not set/);

    stamper.free();
  });

  it('rejects an unreadable image, naming the problem, and stays usable', async () => {
    const stamper = await ready();

    // A validator function rather than a RegExp: a RegExp is matched against String(err),
    // which a bare string thrown across the boundary would also satisfy.
    await assert.rejects(
      stamper.stamp(Buffer.from('not an image')),
      (error) => error instanceof Error && /^Failed to load image: /.test(error.message)
    );
    await assert.rejects(stamper.stamp(new Uint8Array(0)), /Failed to load image/);

    const result = await stamper.stamp(photo);

    assert.deepEqual(jpegDimensions(result.bytes), { width: 400, height: 300 });

    stamper.free();
  });

  it('refuses an image over the pixel budget, from the header', async () => {
    const stamper = await ready();

    // 400x300 is 0.12 MP.
    await assert.rejects(stamper.stamp(photo, { maxMegapixels: 0.1 }), /too large.*0\.1 MP/);

    stamper.free();
  });

  it('refuses an image over the dimension limit', async () => {
    const stamper = await ready();

    await assert.rejects(stamper.stamp(photo, { maxDimension: 350 }), /Failed to load image: .*exceeds limit/);

    // The limit is inclusive: the longer side may equal it.
    const result = await stamper.stamp(photo, { maxDimension: 400 });

    assert.deepEqual(jpegDimensions(result.bytes), { width: 400, height: 300 });

    stamper.free();
  });

  it('honours the quality setting', async () => {
    const stamper = await ready();

    const low = await stamper.stamp(photo, { quality: 20 });
    const high = await stamper.stamp(photo, { quality: 95 });

    assert.ok(low.bytes.length < high.bytes.length, `q20 (${low.bytes.length} B) should be smaller than q95 (${high.bytes.length} B)`);

    stamper.free();
  });

  it('takes colours as CSS hex', async () => {
    const stamper = await ready();

    const grey = await stamper.stamp(photo, { caption: 'X', textColor: '#7d7d7d80' });
    const red = await stamper.stamp(photo, { caption: 'X', textColor: '#f00' });

    assert.notDeepEqual(grey.bytes, red.bytes);

    // The photo is opaque, so the matte has nothing to composite and the output is the same.
    const whiteMatte = await stamper.stamp(photo, { jpegMatte: '#fff' });
    const blackMatte = await stamper.stamp(photo, { jpegMatte: '#000' });

    assert.deepEqual(whiteMatte.bytes, blackMatte.bytes);

    // The stamp fixture has transparent edges. Stamped as a photo, its translucent pixels
    // are composited onto the matte, so the two mattes must now produce different JPEGs.
    const onWhite = await stamper.stamp(stamp, { jpegMatte: '#fff' });
    const onBlack = await stamper.stamp(stamp, { jpegMatte: '#000' });

    assert.notDeepEqual(onWhite.bytes, onBlack.bytes);

    stamper.free();
  });

  it('every tunable changes the output when it is changed', async () => {
    const stamper = await ready();
    const base = (await stamper.stamp(photo, { caption: 'IMG_0001' })).bytes;

    // At 400x300 the caption sits at its 16 px floor, which is why textSizeMin rather than
    // textSizeMax is in this table; textSizeMax is covered separately below.
    const variants = {
      opacity: 25,
      stampPadding: 100,
      textSizeRatio: 0.1,
      textSizeMin: 40,
      textPaddingRatio: 0.9,
      textPaddingMin: 60,
      textColor: '#ff0000ff'
    };

    for (const [name, value] of Object.entries(variants)) {
      const changed = (await stamper.stamp(photo, { caption: 'IMG_0001', [name]: value })).bytes;

      assert.notDeepEqual(changed, base, `${name}=${value} should change the output`);
    }

    const tall = (await stamper.stamp(photo, { caption: 'IMG_0001', textSizeRatio: 0.1 })).bytes;
    const capped = (await stamper.stamp(photo, { caption: 'IMG_0001', textSizeRatio: 0.1, textSizeMax: 20 })).bytes;

    assert.notDeepEqual(capped, tall, 'textSizeMax caps a caption that would otherwise be larger');

    // The 50x40 stamp is upscaled about 7x to fit a 400x300 frame, past the default
    // threshold of 2, so Infinity (always Lanczos3) and 0 (never) pick different filters.
    const lanczos = (await stamper.stamp(photo, { lanczosMaxUpscale: Infinity })).bytes;
    const triangle = (await stamper.stamp(photo, { lanczosMaxUpscale: 0 })).bytes;

    assert.notDeepEqual(lanczos, triangle);

    // Cyrillic is in the embedded subset, so it is drawn rather than skipped.
    const cyrillic = (await stamper.stamp(photo, { caption: 'Снимка' })).bytes;
    const blank = (await stamper.stamp(photo, { caption: '' })).bytes;

    assert.notDeepEqual(cyrillic, blank);

    stamper.free();
  });

  it('replacing the stamp and alternating frame sizes keeps the scaled-stamp cache honest', async () => {
    const stamper = await ready();
    const first = (await stamper.stamp(photo)).bytes;

    // A different stamp: the photo itself, opaque and full-frame.
    await stamper.setStamp(photo);
    assert.equal(stamper.stampWidth, 400);

    const second = (await stamper.stamp(photo)).bytes;

    assert.notDeepEqual(first, second);

    await stamper.setStamp(stamp);

    // Two frame sizes in turn: each must come out as if it were the only size in the batch.
    const landscapeA = (await stamper.stamp(photo)).bytes;
    const portraitA = (await stamper.stamp(portrait)).bytes;
    const landscapeB = (await stamper.stamp(photo)).bytes;
    const portraitB = (await stamper.stamp(portrait)).bytes;

    assert.deepEqual(landscapeA, first);
    assert.deepEqual(landscapeB, landscapeA);
    assert.deepEqual(portraitB, portraitA);
    assert.deepEqual(jpegDimensions(portraitB), { width: 300, height: 400 });

    stamper.free();
  });
});

describe('option validation', () => {
  it('rejects an unknown format', async () => {
    const stamper = await ready();

    assert.throws(() => stamper.stampSync(photo, { format: 'gif' }), /unknown format "gif"/);

    stamper.free();
  });

  it('rejects a non-numeric float field', async () => {
    const stamper = await ready();

    assert.throws(() => stamper.stampSync(photo, { quality: '75' }), /quality must be a number/);

    stamper.free();
  });

  it('rejects an integer field that would wrap at the boundary', async () => {
    const stamper = await ready();

    assert.throws(() => stamper.stampSync(photo, { stampPadding: -1 }), RangeError);
    assert.throws(() => stamper.stampSync(photo, { stampPadding: 1.5 }), RangeError);
    assert.throws(() => stamper.stampSync(photo, { maxDimension: 2 ** 32 }), RangeError);

    stamper.free();
  });

  it('rejects a bad colour', async () => {
    const stamper = await ready();

    assert.throws(() => stamper.stampSync(photo, { textColor: 'red' }), /Invalid colour "red"/);

    stamper.free();
  });

  it('rejects a non-string caption', async () => {
    const stamper = await ready();

    assert.throws(() => stamper.stampSync(photo, { caption: 42 }), /caption must be a string/);

    stamper.free();
  });

  it('treats null like undefined', async () => {
    const stamper = await ready();

    const defaults = await stamper.stamp(photo);
    const nulls = await stamper.stamp(photo, { quality: null, opacity: null, format: null, textColor: null });

    assert.deepEqual(defaults.bytes, nulls.bytes);

    stamper.free();
  });
});

describe('lifecycle', () => {
  it('free() is idempotent and every method throws afterwards', async () => {
    const stamper = await ready();

    assert.equal(stamper.disposed, false);

    stamper.free();
    stamper.free();

    assert.equal(stamper.disposed, true);
    assert.throws(() => stamper.hasStamp, /has been freed/);
    assert.throws(() => stamper.stampSync(photo), /has been freed/);
    await assert.rejects(stamper.stamp(photo), /has been freed/);
    await assert.rejects(stamper.setStamp(stamp), /has been freed/);
  });

  it('supports Symbol.dispose', { skip: typeof Symbol.dispose !== 'symbol' && 'no Symbol.dispose in this Node' }, async () => {

    const stamper = await ready();

    stamper[Symbol.dispose]();

    assert.equal(stamper.disposed, true);
  });
});

describe('defaultOptions', () => {
  it('reports the crate defaults, with f32 rounding undone', async () => {
    await initWasm();

    const defaults = defaultOptions();

    assert.deepEqual(defaults, {
      quality: 75,
      opacity: 50,
      format: 'jpeg',
      stampPadding: 10,
      maxMegapixels: 120,
      maxDimension: 65535,
      jpegMatte: '#ffffffff',
      lanczosMaxUpscale: 2,
      textSizeRatio: 0.022,
      textSizeMin: 16,
      textSizeMax: 96,
      textPaddingRatio: 0.35,
      textPaddingMin: 10,
      textColor: '#7d7d7d80'
    });
  });

  it('is a fresh object each time', async () => {
    await initWasm();

    const a = defaultOptions();
    const b = defaultOptions();

    assert.notEqual(a, b);
    assert.deepEqual(a, b);
  });
});

describe('colours', () => {
  it('packs every CSS hex form', () => {
    assert.equal(packColor('#7d7d7d80'), 0x7d7d7d80);
    assert.equal(packColor('#7d7d7d'), 0x7d7d7dff);
    assert.equal(packColor('#f00'), 0xff0000ff);
    assert.equal(packColor('#f008'), 0xff000088);
    assert.equal(packColor('ffffff'), 0xffffffff);
    assert.equal(packColor('  #FFFFFF  '), 0xffffffff);
    assert.equal(packColor('#ffffffff'), 4294967295, 'the top bit does not read back negative');
  });

  it('refuses anything else', () => {
    for (const bad of ['red', '#ff', '#fffff', '#ggg', '', '#1234567', 'rgb(0,0,0)']) {
      assert.throws(() => packColor(bad), /Invalid colour/, bad);
    }

    assert.throws(() => packColor(0xff0000ff), TypeError);
  });

  it('unpacks to eight digits and round-trips', () => {
    assert.equal(unpackColor(0x7d7d7d80), '#7d7d7d80');
    assert.equal(unpackColor(0), '#00000000');
    assert.equal(unpackColor(0xffffffff), '#ffffffff');

    for (const hex of ['#12345678', '#abcdef01', '#000000ff']) {
      assert.equal(unpackColor(packColor(hex)), hex);
    }

    assert.throws(() => unpackColor(-1), RangeError);
    assert.throws(() => unpackColor(2 ** 32), RangeError);
    assert.throws(() => unpackColor(1.5), RangeError);
  });
});
