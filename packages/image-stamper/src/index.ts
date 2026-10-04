/**
 * image-stamper — the browser and bundler entry.
 *
 * `createImageStamper()` with no arguments lets the generated glue find the `.wasm` next to
 * itself with `new URL('image_stamper_bg.wasm', import.meta.url)`. Browsers resolve that
 * against the module's URL, and Vite and webpack 5 recognise the pattern and emit the file
 * as an asset. Rollup and esbuild do not; pass `{ wasm }` there. The README's "Where the
 * .wasm comes from" section has each case.
 *
 * Node resolves the `node` export condition to ./node.js instead, which reads the file from
 * disk — Node's `fetch` does not accept `file:` URLs.
 */

import { ImageStamper, initWasm, type CreateOptions } from './core.js';

export * from './core.js';

/**
 * Instantiates the WebAssembly module (once per realm) and returns a stamper.
 *
 * @param options.wasm Where to get the `.wasm` from, if not next to the glue: a URL as a
 *   string or `URL`, a `Request`, a `Response`, the bytes, a compiled `WebAssembly.Module`,
 *   or a promise of any of these. Ignored after the first call.
 */
export async function createImageStamper(options: CreateOptions = {}): Promise<ImageStamper> {
  await initWasm(options.wasm);

  return ImageStamper.create();
}
