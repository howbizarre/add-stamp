# WASM image stamper

The watermarking pipeline is a Rust crate in [`wasm/`](wasm/), compiled to WebAssembly and
loaded by the browser. Photos are decoded, stamped and re-encoded on the user's own machine —
nothing is uploaded, and originals never leave the device unstamped.

Decoding untrusted image data is a classic memory-corruption surface, so it happens in
memory-safe Rust (there is no `unsafe` anywhere in the crate) inside the WebAssembly sandbox.

For the application around it — the interface, the batch flow, deployment — see
[README.md](README.md).

The same crate is published to npm as [`@howbizarre/image-stamper`](packages/image-stamper/README.md), with a
typed wrapper for browsers and Node. [`packages/image-stamper/scripts/build.mjs`](packages/image-stamper/scripts/build.mjs)
builds it from this directory, and the app consumes that package like any other dependency.

## Building

The crate is built by the npm package's script, into `packages/image-stamper/wasm/`:

```bash
npm run build:package  # wasm-pack --target web, then tsc, into packages/image-stamper
npm run test:package   # the package's Node tests against the built output
npm test               # the Rust test suite, native target (70 unit + 21 end-to-end)
npm run bench:wasm     # time the hot path on a synthetic 24 MP frame
```

The app does not build the crate at all: it depends on the published
`@howbizarre/image-stamper`, and Vite bundles the `.wasm` from it as a hashed asset.

### Prerequisites

- [Rust](https://rustup.rs/) — the exact toolchain is pinned in
  [`wasm/rust-toolchain.toml`](wasm/rust-toolchain.toml) and rustup installs it on first use.
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/) — `cargo install wasm-pack`.

The toolchain is pinned because the `wasm-bindgen` crate version has to match the
`wasm-bindgen-cli` that `wasm-pack` runs. Pinning it and committing `Cargo.lock` keeps that
pair reproducible across machines and CI.

### How the artifact reaches the browser

`wasm-pack --target web` emits glue JS that finds its `.wasm` with
`new URL('image_stamper_bg.wasm', import.meta.url)`. Vite rewrites that into a content-hashed
asset under `/_nuxt/`, so the glue and the binary of one build always travel together and can
be cached immutably; a cached glue from one deploy can never meet the binary of the next. The
engine version shown in the guide comes from the package's `package.json`, exposed as
`runtimeConfig.public.engineVersion`.

## JavaScript API

All of it is wrapped by [`app/composables/useImageStamping.ts`](app/composables/useImageStamping.ts),
which is what application code should use.

```ts
const { initialize, setStamp, applyStampToImages } = useImageStamping();

await initialize();
await setStamp(pngFile, { maxMegapixels: 120 });

const results = await applyStampToImages(
  imageFiles,
  { format: 'jpg', quality: 75, opacity: 50, addFilename: true },
  (progress) => console.log(`${progress.current}/${progress.total}`)
);
```

Underneath, the exported surface is three items:

| Export | Purpose |
| --- | --- |
| `ImageStamper` | `setStamp(bytes, options)`, `applyStamp(bytes, filename, options)`, plus `hasStamp` / `stampWidth` / `stampHeight` getters |
| `StampOptions` | Every tunable, constructed with the defaults already in place |
| `OutputFormat` | `Jpeg` or `WebP` |

`ImageStamper` and `StampOptions` are both handles into WebAssembly linear memory rather
than ordinary JavaScript objects, so the collector cannot reclaim them. `StampOptions` is
built once per batch and released with `.free()` in a `finally`; the `ImageStamper` is kept
for the life of the page, which is also what keeps the scaled-stamp cache warm.

Errors cross the boundary as real `Error` objects with a usable message and stack, not as
bare strings.

## Options

Every tunable is a field of `StampOptions`; none of them are compiled-in constants. Leaving a
field alone keeps the default, which lives in the `defaults` module of
[`wasm/src/lib.rs`](wasm/src/lib.rs) — the TypeScript layer deliberately does not repeat the
numbers, so they cannot drift apart.

| TypeScript | Rust field | Default | Meaning |
| --- | --- | --- | --- |
| `quality` | `quality` | `75` | 1-100. JPEG only |
| `opacity` | `opacity` | `50` | Stamp opacity, 0-100 |
| `format` | `format` | `'jpg'` | `'jpg'` or `'webp'` |
| `addFilename` | — | `true` | Whether to draw the filename caption. TypeScript-side only: it passes an empty `filename` to `applyStamp`, and an empty caption draws nothing |
| `stampPadding` | `stamp_padding` | `10` | Clear space around the stamp, in source pixels |
| `maxMegapixels` | `max_megapixels` | `120` | Largest image to decode |
| `maxDimension` | `max_dimension` | `65535` | Largest single axis to decode |
| `jpegMatte` | `jpeg_matte` | white | Colour translucent pixels are composited onto for JPEG |
| `lanczosMaxUpscale` | `lanczos_max_upscale` | `2.0` | Above this upscale factor, resize with Triangle instead of Lanczos3 |
| `textSizeRatio` | `text_size_ratio` | `0.022` | Caption height as a fraction of the frame's shorter side |
| `textSizeMin` | `text_size_min` | `16` | Floor on the caption, in pixels |
| `textSizeMax` | `text_size_max` | `96` | Ceiling on the caption, in pixels |
| `textPaddingRatio` | `text_padding_ratio` | `0.35` | Gap below the caption, as a fraction of its size |
| `textPaddingMin` | `text_padding_min` | `10` | Floor on that gap, in pixels |
| `textColor` | `text_color` | `#7d7d7d80` | Caption colour; alpha honoured |

Colours cross the boundary as packed `0xRRGGBBAA` integers, because a `#[wasm_bindgen]`
struct field cannot be a string or an array. The composable takes CSS hex (`#rgb`, `#rgba`,
`#rrggbb`, `#rrggbbaa`) and packs it for you; `packColor` is exported from
`useImageStamping.ts` if you need it directly. It throws on anything that is not valid hex,
rather than substituting a default — a silently wrong colour would only show up as a wrongly
tinted watermark on delivered photos.

Values are clamped on entry rather than rejected: an empty number input in a browser reads
back as `NaN`, and `f32::clamp` panics on a `NaN` bound — which in WebAssembly traps the
whole instance, not just that call. `StampOptions::normalized` is what makes that
unreachable, including the case where `textSizeMin > textSizeMax`.

## Pipeline

1. **Read EXIF orientation** from the encoded bytes, before decoding. `image` does not apply
   the `Orientation` tag and `to_rgba8` discards it, so a portrait frame from a phone would
   otherwise be stamped sideways and written out with no EXIF left to correct it.
2. **Check the size from the header**, before any pixel buffer exists. A failed allocation in
   Rust is a panic, and a panic traps the WebAssembly instance — so one oversized photo used
   to poison every later photo in the batch. Refusing early keeps the instance alive and
   turns it into an ordinary error for one file.
3. **Decode**, then apply the orientation transform. `Normal` hands the buffer straight back
   without allocating, which is worth having when it is 96 MB for a 24 MP frame.
4. **Scale the stamp** to fit inside the frame with `stampPadding` on every side, caching the
   result. Every frame in a batch usually shares dimensions, so this runs once per batch
   rather than once per photo — which is what makes Lanczos3 affordable at all.
5. **Composite** it centred, at `opacity`, walking the intersection of the two rectangles as
   row slices and skipping fully transparent overlay pixels. Centred and contained is the
   whole placement model — there is no corner anchor and no tiling.
6. **Draw the caption** at a size proportional to the frame's shorter side, centred, with
   real per-glyph advances and kerning.
7. **Encode.** For JPEG, RGB is built directly with translucent pixels composited onto
   `jpegMatte`; going through `to_rgb8` would allocate a full RGBA copy first and drop alpha
   without compositing, which left transparent PNG input showing whatever happened to be in
   its colour channels.

## Layout of the crate

```
wasm/
├── .cargo/config.toml        # enables simd128 for the wasm target
├── Cargo.toml                # deps and the release profile
├── rust-toolchain.toml       # pinned rustc
├── rustfmt.toml
├── src/
│   ├── lib.rs                # options, the pipeline, encoding, size limits
│   ├── blend.rs              # alpha compositing
│   ├── error.rs              # StampError, converted to JsError at the boundary
│   ├── layout.rs             # pure geometry: contain-scale, centring
│   ├── orientation.rs        # EXIF orientation
│   ├── text.rs               # glyph rasterization on ab_glyph
│   ├── Ubuntu-M-subset.ttf   # embedded font
│   └── FONT-LICENSE.md       # Ubuntu Font Licence
├── tests/pipeline.rs         # end-to-end tests
└── examples/bench.rs         # timings for the hot path
```

`lib.rs` is the only module that touches wasm-bindgen. Everything else is ordinary Rust and
is unit-tested on the native target; `tests/pipeline.rs` drives the whole pipeline through
`stamp_image`, the `StampError` twin of the exported `applyStamp`. Constructing a `JsError`
off the wasm target aborts the process, which is why the tests do not go through the
exported method.

## The font

`src/Ubuntu-M-subset.ttf` is *Ubuntu Medium derivative Image Stamper*, a subset of Ubuntu Medium renamed as its
licence requires, embedded so the watermark renders
identically regardless of what fonts a client has. Font data is incompressible and passes
through `wasm-opt` untouched, so it is the largest single item in the binary even subsetted:
the full face was 341 324 B, this is 78 188 B.

It keeps Latin-1, Latin Extended-A/B and the full Cyrillic block, plus the legacy `kern`
table — `pyftsubset` drops that in favour of GPOS by default, which `ab_glyph` never reads,
so dropping it would have silently disabled kerning. `scripts/font-subset.py` regenerates it, subset and
rename in one step, from `app/assets/fonts/Ubuntu-M.ttf`.

The font is licensed under the [Ubuntu Font Licence](wasm/src/FONT-LICENSE.md), separately
from this project's MIT licence.

## Binary size

The artifact is ~934 KiB (956 kB). Most of what keeps it there:

- `image` with `default-features = false` and only `png`, `jpeg` and `webp`. This only takes
  effect because `imageproc` is gone: it depended on `image` with default features, and Cargo
  unions features across the whole graph, so an AV1 encoder, OpenEXR, TIFF, GIF and QOI were
  compiled in regardless. Dropping it took the dependency graph from 154 crates to 41.
- `lto = "fat"`, `codegen-units = 1`, `panic = "abort"`, `strip = true`.
- `opt-level = 3`. Measured on this crate, `"z"` and `"s"` both came out *larger* as well as
  slower — the size-oriented levels only pay off when there is a lot of code to shrink.

The `wasm-opt` flag list in `Cargo.toml` is not optional. `wasm-pack` 0.13 through 0.15
downloads Binaryen 117, which validates against an older default feature set than rustc 1.91
emits; passing an explicit list replaces wasm-pack's defaults, so every feature the toolchain
actually uses has to be named there or the build fails with "error validating input".

## Performance

Per-photo cost on a 24 MP frame, measured inside the wasm artifact: decoding is ~31%, JPEG
encoding ~63%, blending ~9%, and the stamp resize approximately zero because it is cached per
batch. Each stage is the median of its own run, so the shares add up to a little over 100%
rather than exactly to it.

[docs/PERFORMANCE.md](docs/PERFORMANCE.md) records the measurements, the method (native
benchmarks mislead here), and one open decision — swapping the JPEG encoder, which is worth
14-30% of total time depending on chroma subsampling. Deferred to the UI rework.

## Troubleshooting

**`wasm-pack: command not found`** — `cargo install wasm-pack`.

**"Failed to load the image engine"** in the browser — the `.wasm` asset under `/_nuxt/` did
not load. Check the network panel for the request and its status; a stale HTML page after a
deploy is the usual cause, so hard-reload.

**"error validating input" from `wasm-opt`** — the Binaryen feature list in `Cargo.toml` is
missing something the current rustc emits. Add the feature it names.

**A schema mismatch at runtime** — the glue JS and the `.wasm` come from different builds.
With the package bundled by Vite this cannot happen in the app; if it does, something outside
the build is serving one of the two files.
