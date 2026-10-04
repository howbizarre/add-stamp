/**
 * image-stamper — the Node entry, selected by the `node` export condition.
 *
 * Identical to ./index.js except that, when no `wasm` is given, the `.wasm` is read from
 * disk. The generated glue's default is to `fetch` a URL relative to `import.meta.url`,
 * which under Node is a `file:` URL that `fetch` rejects.
 *
 * `import.meta.url` has to be this file's real location inside node_modules, so a server
 * bundler that inlines the package breaks the default; the README's Node section says how
 * to handle that (keep the package external, or pass the bytes).
 */

import { readFile } from 'node:fs/promises';
import { ImageStamper, initWasm, type CreateOptions } from './core.js';

export * from './core.js';

/**
 * Instantiates the WebAssembly module (once per process) and returns a stamper.
 *
 * @param options.wasm Where to get the `.wasm` from, if not the copy shipped in this
 *   package: the bytes, a compiled `WebAssembly.Module`, a `Response`, an `http(s)` URL,
 *   or a promise of any of these. Ignored after the first call.
 */
export async function createImageStamper(options: CreateOptions = {}): Promise<ImageStamper> {
  // A function rather than a started read: initWasm only calls it when an instantiation
  // actually begins, so a second caller does not start a read that nobody awaits.
  await initWasm(options.wasm ?? (() => readFile(new URL('../wasm/image_stamper_bg.wasm', import.meta.url))));

  return ImageStamper.create();
}
