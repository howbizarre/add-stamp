// Header-only dimension readers for the two encodings the crate produces. The tests only
// need to know that the output is the right kind of file at the right size; decoding the
// pixels is the Rust test suite's job, and a JavaScript decoder would be a dependency for
// nothing.

/** Width and height from the first SOF marker of a JPEG. */
export function jpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('not a JPEG: no SOI marker');
  }

  let i = 2;

  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) {
      throw new Error(`JPEG marker expected at byte ${i}, found 0x${bytes[i].toString(16)}`);
    }

    const marker = bytes[i + 1];

    // Fill bytes and standalone markers carry no length.
    if (marker === 0xff) {
      i += 1;
      continue;
    }

    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }

    const length = (bytes[i + 2] << 8) | bytes[i + 3];

    // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share the range.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSof) {
      return {
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8]
      };
    }

    if (marker === 0xda) {
      throw new Error('JPEG reached SOS without a SOF marker');
    }

    i += 2 + length;
  }

  throw new Error('JPEG ended without a SOF marker');
}

/** Width and height of a WebP, from whichever of its three container forms is present. */
export function webpDimensions(bytes) {
  const ascii = (from, to) => String.fromCharCode(...bytes.subarray(from, to));

  if (ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP') {
    throw new Error('not a WebP: no RIFF/WEBP header');
  }

  const chunk = ascii(12, 16);
  const le24 = (at) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
  const le16 = (at) => bytes[at] | (bytes[at + 1] << 8);

  switch (chunk) {
    case 'VP8L': {
      // Signature byte 0x2f, then 14 bits of width-1 and 14 bits of height-1.
      if (bytes[20] !== 0x2f) throw new Error('VP8L signature byte missing');

      const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0;

      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    case 'VP8X':
      // Canvas width-1 and height-1 as 24-bit little-endian, after the flags.
      return { width: le24(24) + 1, height: le24(27) + 1 };
    case 'VP8 ':
      // Lossy: 14-bit dimensions after the 3-byte frame tag and 3-byte start code.
      return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
    default:
      throw new Error(`unexpected first WebP chunk "${chunk}"`);
  }
}
