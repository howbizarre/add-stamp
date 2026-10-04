// A consumer may instantiate the module through the raw bindings that `image-stamper/wasm`
// exposes. The wrapper shares that module instance and has to notice. Own process, so the
// module starts uninstantiated.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import * as raw from 'image-stamper/wasm';
import { ImageStamper, defaultOptions, initWasm, isWasmReady } from 'image-stamper';

describe('instantiation through the raw bindings', () => {
  it('is detected by the wrapper', async () => {
    assert.equal(isWasmReady(), false);

    for (const name of ['ImageStamper', 'StampOptions', 'OutputFormat', 'initSync', 'default']) {
      assert.ok(name in raw, `image-stamper/wasm exports ${name}`);
    }

    const module = new WebAssembly.Module(readFileSync(new URL('../wasm/image_stamper_bg.wasm', import.meta.url)));

    raw.initSync({ module });

    assert.equal(isWasmReady(), true);
    assert.equal(defaultOptions().quality, 75);

    const stamper = ImageStamper.create();

    assert.equal(stamper.hasStamp, false);

    stamper.free();

    // initWasm now resolves to the live exports without loading anything.
    const output = await initWasm(new Uint8Array([0, 1, 2, 3]));

    assert.ok(output.memory instanceof WebAssembly.Memory);
  });
});
