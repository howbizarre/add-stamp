/**
 * Colours cross the WebAssembly boundary as one packed `0xRRGGBBAA` integer, because a
 * `#[wasm_bindgen]` struct field cannot be a string or an array. These two helpers convert
 * between that integer and CSS hex.
 */

/**
 * Packs a CSS hex colour into the `0xRRGGBBAA` integer the WebAssembly boundary takes.
 *
 * Accepts `#rgb`, `#rgba`, `#rrggbb` and `#rrggbbaa`, with or without the leading `#`.
 * A missing alpha is opaque.
 *
 * Throws on anything else rather than falling back to a default: a silently substituted
 * colour would only show up as a wrongly tinted watermark on delivered photos.
 */
export function packColor(hex: string): number {
  if (typeof hex !== 'string') {
    throw new TypeError(`Expected a CSS hex colour string, got ${typeof hex}.`);
  }

  const digits = hex.trim().replace(/^#/, '');

  // Expand the shorthand forms, where each digit stands for a doubled byte.
  const full =
    digits.length === 3 || digits.length === 4
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;

  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(full)) {
    throw new Error(`Invalid colour "${hex}". Expected CSS hex such as #7d7d7d or #7d7d7d80.`);
  }

  const rgba = full.length === 6 ? `${full}ff` : full;

  // >>> 0 because a value with the top bit set — anything from #80000000 up, which includes
  // every opaque colour — is otherwise read back as a negative number.
  return parseInt(rgba, 16) >>> 0;
}

/**
 * The inverse of {@link packColor}: `0xRRGGBBAA` to `#rrggbbaa`, always eight lowercase
 * digits so the alpha is never ambiguous.
 */
export function unpackColor(packed: number): string {
  if (!Number.isInteger(packed) || packed < 0 || packed > 0xffff_ffff) {
    throw new RangeError(`Expected a packed 0xRRGGBBAA integer between 0 and 4294967295, got ${packed}.`);
  }

  return `#${packed.toString(16).padStart(8, '0')}`;
}
