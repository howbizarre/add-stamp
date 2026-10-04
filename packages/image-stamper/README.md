# image-stamper

Watermark photos in Rust/WebAssembly, in the browser or in Node. Give it a PNG mark once,
then hand it photos: each one comes back uprighted, with the mark scaled to fit and
composited centred at the opacity you choose, a caption along the bottom edge if you want
one, re-encoded as JPEG or WebP. Nothing is uploaded anywhere.

This is the engine behind [Add Stamp](https://stamp.bizarre.how), extracted as a library.
Decoding untrusted image data is a classic memory-corruption surface, so it happens in
memory-safe Rust (no `unsafe` anywhere in the crate) inside the WebAssembly sandbox.

- Scales the mark to the largest size that fits inside the frame with clear padding, then
  centres it. A wide wordmark spans the frame; a square mark fills its height.
- Opacity from 0 to 100, applied at composite time, so a semi-transparent PNG keeps its own
  alpha as well.
- Reads EXIF orientation before drawing, so a portrait photo off a phone is not stamped
  sideways.
- Draws the caption from an embedded font with real kerning, Latin and Cyrillic, so it
  renders identically everywhere.
- Refuses oversized images from their header, before any pixel buffer exists, so one bad
  file cannot take down a batch.
- One `.wasm` of about 955 KB (933 KiB), no native dependencies, no server.

## Install

```bash
npm install image-stamper
```

Node 20 or newer. The type declarations need TypeScript 5.7 or newer. They mention
`Response`, `Request` and `WebAssembly`, so with `skipLibCheck: false` your `lib` has to
include `DOM`; the `Symbol.dispose` they also use is covered by a lib reference the package
carries itself. A Node-only project without the DOM lib should leave `skipLibCheck` on.

## Quick start

### In the browser or with a bundler

```ts
import { createImageStamper } from 'image-stamper';

const stamper = await createImageStamper();

await stamper.setStamp(stampFile); // a File or Blob of PNG data

for (const file of photoFiles) {
  const { bytes, mimeType, extension } = await stamper.stamp(file, {
    caption: file.name.replace(/\.[^.]+$/, ''),
    opacity: 50,
    quality: 75
  });

  const stamped = new File([bytes], `${file.name}_stamped.${extension}`, { type: mimeType });
  // upload it, zip it, show it, save it...
}

stamper.free();
```

`createImageStamper()` with no arguments loads the `.wasm` from next to the package's own
JavaScript, using `new URL('image_stamper_bg.wasm', import.meta.url)`. Browsers resolve that
against the module's URL, and Vite production builds and webpack 5 recognise the pattern and
copy the file into the build as an asset. Rollup and esbuild have to be told where the file
is; see [Where the `.wasm` comes from](#where-the-wasm-comes-from).

### In Node

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { createImageStamper } from 'image-stamper';

const stamper = await createImageStamper();

await stamper.setStamp(await readFile('logo.png'));

const { bytes, extension } = await stamper.stamp(await readFile('IMG_0001.jpg'), {
  caption: 'IMG_0001',
  format: 'webp'
});

await writeFile(`IMG_0001_stamped.${extension}`, bytes);

stamper.free();
```

Node resolves the package's `node` export to an entry that reads the `.wasm` from disk, so
no configuration is needed as long as Node itself loads the package. Deno and Bun take the
same entry.

**Bundled server code.** The Node entry finds the file relative to its own
`import.meta.url`, which stops being true once a bundler inlines the package into your
server build (Vite `ssr.noExternal`, esbuild with `--bundle --platform=node`, a CJS bundle
for a serverless function). Either keep the package external (`ssr.external`,
`--external:image-stamper`; Nitro externalises dependencies by default), or pass the bytes
yourself:

```ts
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const stamper = await createImageStamper({
  wasm: readFile(require.resolve('image-stamper/image_stamper_bg.wasm'))
});
```

A Node build made with Rollup and `@rollup/plugin-node-resolve` also needs
`exportConditions: ['node']`, or it picks the browser entry.

## API

### `createImageStamper(options?)`

Instantiates the WebAssembly module and returns an `ImageStamper`. The module is
instantiated once per realm; further calls reuse it and return a fresh, independent stamper.

| Option | Type | Meaning |
| --- | --- | --- |
| `wasm` | `string \| URL \| Request \| Response \| BufferSource \| WebAssembly.Module`, or a promise of one | Where to get the `.wasm`. A string is a URL, not a file path: under Node only `http(s)` works, and a file on disk goes in as bytes. Leave it out to use the copy shipped in the package. Ignored once the module is instantiated. |

### `class ImageStamper`

One stamp, applied to any number of images. Keep a single instance for a whole batch: the
stamp is resized once per distinct frame size and cached, which is what makes a Lanczos3
resize affordable.

| Member | Meaning |
| --- | --- |
| `setStamp(stamp, options?)` | Decodes the mark and keeps it for every following `stamp` call. `stamp` is a `Uint8Array`, any typed array view, an `ArrayBuffer`, a `Blob` or a `File`. Takes the options because the mark is decoded under the same `maxMegapixels` and `maxDimension` limits as a photo. Async. |
| `setStampSync(bytes, options?)` | The same, for bytes already in hand (no `Blob`). |
| `stamp(image, options?)` | Uprights, stamps, captions and encodes one image. Resolves to a `StampResult`. Async. |
| `stampSync(bytes, options?)` | The same, for bytes already in hand. |
| `hasStamp` | Whether `setStamp` has succeeded. |
| `stampWidth`, `stampHeight` | The mark's size in pixels, or 0 if none is loaded. |
| `free()` | Releases the WebAssembly memory. Safe to call twice; every other member throws afterwards. Also available as `[Symbol.dispose]`, so `using stamper = await createImageStamper()` works where the runtime supports it. |
| `disposed` | Whether `free()` has been called. |
| `ImageStamper.create()` | A stamper over an already-instantiated module, for code that called `initWasm` itself. |

The stamper and its options are handles into WebAssembly linear memory, not ordinary
JavaScript objects, so the garbage collector cannot be relied on to reclaim them in every
runtime. Call `free()` when you are done with an instance. The options object built for each
call is freed for you.

### Options

Every option is optional. Anything left out keeps the default compiled into the crate, which
`defaultOptions()` reports at runtime so the two can never disagree. Numbers are clamped to
a usable range on entry rather than refused, and a `NaN` or an infinite value falls back to
the default (`lanczosMaxUpscale` keeps `Infinity`), so a value read from an empty form field
cannot break the instance.

| Option | Default | Meaning |
| --- | --- | --- |
| `quality` | `75` | 1-100. JPEG only: the WebP encoder is lossless and ignores it. |
| `opacity` | `50` | Stamp opacity, 0-100. |
| `format` | `'jpeg'` | `'jpeg'` (alias `'jpg'`) or `'webp'`. |
| `stampPadding` | `10` | Clear space left around the stamp, in pixels of the source image. |
| `maxMegapixels` | `120` | Largest image to decode. Anything bigger is refused from its header. |
| `maxDimension` | `65535` | Largest single dimension to decode, in pixels. |
| `jpegMatte` | `'#ffffffff'` | Colour that translucent pixels are composited onto when encoding JPEG, which has no alpha channel. Alpha is ignored. |
| `lanczosMaxUpscale` | `2` | Upscale factor above which the stamp is resized with the cheaper Triangle filter instead of Lanczos3. `Infinity` for always-Lanczos3, `0` for never. |
| `textSizeRatio` | `0.022` | Caption height as a fraction of the frame's shorter side. |
| `textSizeMin` | `16` | Floor on the caption size, in pixels. |
| `textSizeMax` | `96` | Ceiling on the caption size, in pixels. |
| `textPaddingRatio` | `0.35` | Gap below the caption, as a fraction of its size. |
| `textPaddingMin` | `10` | Floor on that gap, in pixels. |
| `textColor` | `'#7d7d7d80'` | Caption colour. Alpha is honoured. |

`stamp()` and `stampSync()` take one more:

| Option | Default | Meaning |
| --- | --- | --- |
| `caption` | `''` | Text drawn centred along the bottom edge, typically the filename without its extension. Empty draws nothing. |

Colours are CSS hex: `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`, with or without the `#`. A
colour that is not valid hex throws rather than falling back to a default, because a
silently wrong colour would only show up as a wrongly tinted watermark on delivered photos.

Validation is strict where the WebAssembly boundary would otherwise be silent: a string
where a number is expected throws a `TypeError`, an integer option that is negative,
fractional or above 4294967295 throws a `RangeError`, and an unknown `format` throws.

### `StampResult`

| Field | Meaning |
| --- | --- |
| `bytes` | The encoded image as a `Uint8Array<ArrayBuffer>`. A fresh copy out of WebAssembly memory, so it can go straight into `new Blob([bytes])`, `new File([bytes], ...)` or `fs.writeFile`. |
| `format` | `'jpeg'` or `'webp'`. |
| `mimeType` | `'image/jpeg'` or `'image/webp'`. |
| `extension` | `'jpg'` or `'webp'`. |

### Errors

Errors are real `Error` objects with a message that names the problem:

- `Stamp not set`: `stamp()` was called before a successful `setStamp()`.
- `Image is too large: 9000x6000 is 54 MP, the limit is 40 MP`: over `maxMegapixels`.
- `Failed to load image: ...`: not a readable PNG, JPEG or WebP, or over `maxDimension`.
- `Failed to encode image: ...`: the encoder rejected the finished image.

The instance stays usable after any of these. A photo that fails does not affect the next.

### Other exports

| Export | Meaning |
| --- | --- |
| `defaultOptions()` | The crate's defaults as a plain object, read from a fresh options handle. Requires the module to be instantiated. |
| `packColor(hex)`, `unpackColor(int)` | Convert between CSS hex and the packed `0xRRGGBBAA` integer the raw bindings take. |
| `initWasm(input?)` | Instantiates the module without creating a stamper. Idempotent. |
| `initWasmSync(module)` | Synchronous instantiation from bytes or a compiled `WebAssembly.Module`, for a worker that was handed them. |
| `isWasmReady()` | Whether the module is instantiated. |
| `toBytes(source)`, `toBytesSync(source)` | The input conversion used internally: anything accepted as an image to a `Uint8Array`, without copying where possible. |

The raw wasm-bindgen bindings are available from `image-stamper/wasm` (`ImageStamper`,
`StampOptions`, `OutputFormat`, `default` as the init function, `initSync`), and the binary
itself from `image-stamper/image_stamper_bg.wasm`.

## Where the `.wasm` comes from

**Browsers, Vite production builds, webpack 5.** The default works: the glue asks for
`new URL('image_stamper_bg.wasm', import.meta.url)`, and the bundler emits the file as an
asset. webpack 5 writes it to the output root as `<contenthash>.wasm`
(`output.assetModuleFilename` changes that) and prints its 244 KiB performance hint for it,
which `performance.hints: false` or `performance.assetFilter` silences.

**Rollup and esbuild.** Neither rewrites that pattern, so the build has no `.wasm` and the
glue fetches a path that does not exist. With Rollup add
`@web/rollup-plugin-import-meta-assets`. With esbuild import the binary as a file and pass
its URL:

```ts
// esbuild --bundle --format=esm --loader:.wasm=file
import wasmUrl from 'image-stamper/image_stamper_bg.wasm';

const stamper = await createImageStamper({ wasm: wasmUrl });
```

**Vite dev server.** Vite pre-bundles dependencies into `node_modules/.vite/deps/`, which
moves the JavaScript away from the `.wasm`. Current Vite (checked with 8.x) rewrites the
URL to the file's real location while doing so, and the dev server serves it as
`application/wasm`, so nothing needs configuring. If an older Vite leaves the URL pointing
into `.vite/deps/` (a 404 for `image_stamper_bg.wasm` in the console), either keep the
package out of pre-bundling:

```ts
// vite.config.ts
export default defineConfig({
  optimizeDeps: { exclude: ['image-stamper'] }
});
```

or pass the URL explicitly, which works in dev and in the build alike:

```ts
import wasmUrl from 'image-stamper/image_stamper_bg.wasm?url';

const stamper = await createImageStamper({ wasm: wasmUrl });
```

**Hosting the file yourself** (a CDN, a `public/` directory, a versioned path you cache
immutably): pass its URL. Serve it as `application/wasm` so the browser can use
`WebAssembly.instantiateStreaming`; the glue falls back to a buffered instantiation with a
console warning if it cannot.

```ts
const stamper = await createImageStamper({ wasm: '/wasm/image_stamper_bg.wasm' });
```

**Cloudflare Workers and other runtimes without `fetch` for module-relative URLs.** Import
the binary as a module and pass it in. Wrangler resolves the subpath through the package's
exports map and bundles it as a compiled module:

```ts
import wasm from 'image-stamper/image_stamper_bg.wasm'; // a WebAssembly.Module under wrangler

const stamper = await createImageStamper({ wasm });
```

TypeScript does not know that import on its own; declare it once, in a `wasm.d.ts`:

```ts
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
```

Mind the platform limits. A Worker isolate has 128 MB of memory and WebAssembly memory does
not shrink, so set `maxMegapixels` to about 8 (and `maxDimension` to match) in both
`setStamp` and `stamp`; the crate's defaults are sized for a desktop browser. Stamping also
costs seconds of CPU per frame, which is beyond the free plan's CPU allowance.

**Web Workers.** Stamping a 24 MP frame takes a couple of seconds, which will freeze the
page if it runs on the main thread. The package has no DOM dependency, so the same code
runs unchanged inside a worker; post the files in and the results out. `bytes` is a plain
`ArrayBuffer`-backed `Uint8Array`, so it can be transferred rather than copied.

## What the stamp does to a frame

1. **EXIF orientation** is read from the encoded bytes and applied before anything is drawn,
   so a portrait frame off a phone is not stamped sideways. The output has no EXIF.
2. **The size is checked from the header**, before any pixel buffer exists. An image over
   `maxMegapixels` or `maxDimension` is refused with an ordinary error, and the instance
   stays alive for the next one.
3. **The mark is contained, not tiled or cornered.** It is scaled to the largest size that
   fits inside the frame with `stampPadding` of clear space on every side, then centred.
   The scaled copy is cached, so a batch of same-sized frames resizes it once.
4. **Opacity is applied at composite time**, multiplied into the mark's own alpha.
5. **The caption** is drawn centred along the bottom edge at `textSizeRatio` of the frame's
   shorter side, clamped between `textSizeMin` and `textSizeMax`, in `textColor`, from an
   embedded subset of Ubuntu Medium with real kerning. Latin-1, Latin Extended-A/B and
   Cyrillic are covered, with the common punctuation (dashes, curly quotes, ellipsis,
   bullet) and the euro sign. A character outside that set is not drawn and leaves a gap of
   one glyph width.
6. **Encoding.** JPEG at `quality`, with translucent pixels composited onto `jpegMatte`
   first, because JPEG has no alpha channel. WebP is lossless, keeps alpha, and ignores
   `quality`; a WebP of an already-compressed photo is often larger than the JPEG.

## Formats and limits

| | |
| --- | --- |
| Input | PNG, JPEG, WebP. Anything else is refused as unreadable. |
| Output | JPEG (default) or lossless WebP. |
| Size | Up to `maxMegapixels` (default 120 MP) and `maxDimension` (default 65535 px) per axis, both configurable. |
| Memory | The decoded frame is 4 bytes per pixel, but the peak while a frame is in flight is higher: the decoder's buffer, the RGBA copy, the scaled stamp and the encoder's input coexist. Measured on a 12 MP frame, WebAssembly memory reached about 160 MiB for JPEG in and out, 210 MiB for PNG in, and 250 MiB for PNG in with WebP out, roughly 13 to 21 bytes per pixel. Expect 300 to 500 MiB at 24 MP. The memory grows to fit and never shrinks back, and the default `maxMegapixels` of 120 would allow over 2 GiB, so lower it where memory is tight. |

## Performance

Measured inside the WebAssembly artifact on a 24 MP (6000x4000) frame, under V8:

| Stage | Share |
| --- | ---: |
| Decode and orient | ~31 % |
| Resize the stamp | ~0 %, cached after the first frame |
| Composite | ~9 % |
| Caption | ~0 % |
| Encode JPEG q75 | ~63 % |

About 2.5 seconds per frame in total on a desktop machine; proportionally less for smaller
frames. The binary is compiled with 128-bit SIMD, which every browser since Chrome 91,
Firefox 89 and Safari 16.4 supports. See the repository's
[docs/PERFORMANCE.md](https://github.com/howbizarre/add-stamp/blob/master/docs/PERFORMANCE.md)
for the measurements.

## Versioning

The package version follows this wrapper's API. The WebAssembly inside is built from the
`image-stamper` Rust crate in the [add-stamp](https://github.com/howbizarre/add-stamp)
repository; the crate version each release was built from is recorded in
[CHANGELOG.md](./CHANGELOG.md).

## Licence

MIT for the package's own code; see [LICENSE.md](./LICENSE.md). The binary embeds a subset of
Ubuntu Medium under the [Ubuntu Font Licence 1.0](https://ubuntu.com/legal/font-licence),
whose notice and full text are in [FONT-LICENSE.md](./FONT-LICENSE.md), and 32 Rust crates
whose licences are collected in [THIRD-PARTY-LICENSES.md](./THIRD-PARTY-LICENSES.md).
