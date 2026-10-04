// Runs in its own process (node --test starts one per file), so the module begins
// uninstantiated. Everything here is about the moments before and during initialisation,
// which stamper.test.mjs cannot reach once its before() hook has run.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { ImageStamper, createImageStamper, defaultOptions, initWasm, initWasmSync, isWasmReady } from 'image-stamper';

const wasmPath = new URL('../wasm/image_stamper_bg.wasm', import.meta.url);

describe('before instantiation', () => {
  it('reports not ready and refuses to create handles, with a message that says what to do', () => {
    assert.equal(isWasmReady(), false);
    assert.throws(() => ImageStamper.create(), /not instantiated yet.*createImageStamper/);
    assert.throws(() => defaultOptions(), /not instantiated yet/);
  });

  it('forgets a failed instantiation so the next attempt can succeed', async () => {
    await assert.rejects(initWasm(new Uint8Array([0, 1, 2, 3])), (error) => error instanceof Error);

    assert.equal(isWasmReady(), false);
    assert.throws(() => ImageStamper.create(), /not instantiated yet/);
  });

  it('calls a function input once, shares the in-flight instantiation, and refuses initWasmSync meanwhile', async () => {
    let calls = 0;

    const source = () => {
      calls++;

      return readFile(wasmPath);
    };

    const first = initWasm(source);
    const second = initWasm(source);

    assert.equal(calls, 1, 'the second caller must not start another read');
    assert.equal(isWasmReady(), false, 'still in flight');
    assert.throws(() => initWasmSync(new Uint8Array(0)), /in flight/);

    const [a, b] = await Promise.all([first, second]);

    assert.equal(a, b);
    assert.equal(isWasmReady(), true);
    assert.equal(calls, 1);
  });

  it('ignores a wasm input once the module is instantiated', async () => {
    // Garbage bytes: if this were instantiated it would throw a CompileError.
    const stamper = await createImageStamper({ wasm: new Uint8Array([0, 1, 2, 3]) });

    assert.equal(stamper.hasStamp, false);

    stamper.free();
  });

  it('initWasmSync after the fact returns the existing instance', async () => {
    const existing = await initWasm();

    assert.equal(initWasmSync(new Uint8Array(0)), existing);
  });
});
