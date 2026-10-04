// The entry browsers and bundlers get. Importing the package by name under Node selects
// the `node` condition, so this file reaches dist/index.js by path instead. Own process,
// like init.test.mjs, so the module starts uninstantiated.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { createImageStamper, isWasmReady } from '../dist/index.js';
import { jpegDimensions } from './helpers/dimensions.mjs';

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url));

describe('the browser entry under Node', () => {
  it('cannot find the wasm on its own, says so, and recovers once handed the bytes', async () => {
    // With no `wasm` the glue fetches a file: URL, which Node's fetch rejects. That failure
    // must be forgotten so the retry below can succeed.
    await assert.rejects(createImageStamper(), (error) => error instanceof Error);
    assert.equal(isWasmReady(), false);

    // A promise of bytes: resolved by the wrapper before the glue sees it.
    const stamper = await createImageStamper({ wasm: readFile(new URL('../wasm/image_stamper_bg.wasm', import.meta.url)) });

    assert.equal(isWasmReady(), true);

    await stamper.setStamp(await fixture('stamp-50x40.png'));

    const result = await stamper.stamp(await fixture('photo-400x300.png'), { caption: 'IMG_0001' });

    assert.deepEqual(jpegDimensions(result.bytes), { width: 400, height: 300 });

    stamper.free();
  });
});
