# Where the time goes, and what could be done about it

Measured 2026-09-13 against the crate at its current state, to answer a specific question:
is there a dependency we could upgrade for speed or memory?

**The short answer is no.** `image` 0.25.10, `ab_glyph` 0.2.32, `wasm-bindgen` 0.2.128 and
`kamadak-exif` 0.6.1 — the versions in `Cargo.lock`, unchanged since — were all the latest
published releases on that date, and `cargo outdated` was right that there was nothing to
bump. What follows is what the measurements turned up instead, kept here because one of the
findings is a decision waiting to be made rather than a fact.

## Method

Native benchmarks are misleading for this crate. `examples/bench.rs` runs on x86 with AVX2,
and at least one of the candidates below has SIMD for x86 only — it looks excellent natively
and does nothing in a browser. So everything here was measured **inside the real wasm
artifact**.

A throwaway copy of the crate was given one extra `StampOptions` field, `stop_after`, which
returns an empty buffer after stage N. Built with `wasm-pack build --target nodejs` and
driven from a Node script that times `applyStamp` with `process.hrtime.bigint()`, 9 runs per
stage, median reported, with two warm-up calls first so the one-off stamp resize and any lazy
initialisation are not counted.

The fixture is a synthetic 24 MP (6000x4000) frame, deliberately photographic: smooth colour
fields, some hard luminance edges, fine grain. **Not** noise — chroma noise is exactly what
4:2:0 subsampling discards, so a noise fixture makes any subsampling encoder look
catastrophic and tells you nothing about photographs. The first attempt at this used noise
and produced PSNR figures that were not even monotonic in quality.

Timings come from Node's V8. Chrome shares that engine; Firefox and Safari may differ in
absolute terms, but the ratios between variants should hold.

## Per-photo cost, 24 MP frame

| Stage | ms | Share |
| --- | ---: | ---: |
| decode + EXIF orientation | 794 | 31% |
| resize the stamp | ~0 | cached after the first frame |
| blend | 238 | 9% |
| caption | ~0 | — |
| **encode JPEG q75** | **1605** | **63%** |
| total | 2541 | |

Each row is the median of its own set of runs, so the stages sum to slightly more than the
median total and the shares to slightly over 100%. The differences are noise at this scale;
nothing here turns on the last percent.

Two things follow from this.

**The scaled-stamp cache is doing its job.** A Lanczos3 resize of the stamp costs several
hundred milliseconds, and it shows up as approximately zero here because it runs once per
batch rather than once per photo. This also means `fast_image_resize` — which does have real
wasm32 SIMD, in `wasm32_utils.rs` — is not worth adopting: it would make a cost that is
already amortised to nothing slightly less than nothing.

**Encoding dominates.** Anything that matters is in the JPEG encoder.

## The JPEG encoder

`image`'s built-in `JpegEncoder` has no chroma subsampling at all — it always writes 4:4:4.
Essentially every other JPEG encoder in existence (libjpeg, cameras, Photoshop's "Save for
Web") subsamples 4:2:0 below quality 90. The `jpeg-encoder` crate does too.

That makes a default-to-default comparison meaningless, so both were measured. Note that
`jpeg-encoder`'s `simd` feature is x86/x86_64 only, so on wasm32 both encoders are running
scalar code — the gap below is not a SIMD artefact.

| Variant | Encode | Whole photo | Size @ q75 | PSNR |
| --- | ---: | ---: | ---: | ---: |
| `image`, 4:4:4 (current) | 1605 ms | 2541 ms | 3205 KB | 32.37 dB |
| `jpeg-encoder`, 4:4:4 (matched) | 1101 ms | 2188 ms (−14%) | 3312 KB | 32.39 dB |
| `jpeg-encoder`, 4:2:0 (its default) | 687 ms | 1787 ms (−30%) | 3016 KB | 32.36 dB |

PSNR is measured against a lossless PNG of the same pixels, not against an already-encoded
JPEG. At matched subsampling the two encoders are indistinguishable in quality and
`jpeg-encoder` is 1.46x faster. Adopting 4:2:0 as well costs 0.01 dB — nothing — and makes
files 6% smaller while being 2.34x faster.

The wasm artifact grows by about 21 KB (from 955 609 B).

**Status: still open.** It was deferred to the UI rework, because it changes the bytes of
delivered photos and the right default belongs with the decision about exposing format and
quality in the interface. That rework shipped in 2.1.x without exposing either — the app
sends a fixed `jpg` at quality 75 — so the decision is still waiting on the same question.

If it is picked up, two things must come with it:

- **`maxDimension` has to be clamped to 65 535 in `StampOptions::normalized`.**
  `jpeg-encoder` takes dimensions as `u16`. Today's default happens to be exactly 65 535 so
  it lines up, but the field is a settable `u32` — set it to 100 000, feed in a 70 000 px
  image, and `width as u16` truncates silently.
- **The IJG licence notice.** `jpeg-encoder` is `(MIT OR Apache-2.0) AND IJG`, and the IJG
  terms require "this software is based in part on the work of the Independent JPEG Group"
  to appear in the documentation.

The natural shape, given that every other tunable is already a `StampOptions` field, is to
add chroma subsampling as one more field rather than hard-coding either choice.

## Resizing photos for `render`

Added 2026-10-11 with `render`, which encodes a frame at sizes smaller than the source: a
960 px and a 400 px preview with the stamp, a 1920 px and a 400 px delivery copy without.
Once the outputs are small, the encoder stops mattering and the photo resize, which used to
not exist, becomes the cost that the stamp's cache never had to carry. That reopens the
`fast_image_resize` question above, and the answer flips.

Measured inside the wasm artifact under Node's V8, medians of 7 runs after two warm-ups, on a
synthetic 24 MP (6000x4000) JPEG with smooth fields, hard edges and grain, on a different and
faster machine than the tables above, so only the ratios carry over:

| | `image` Lanczos3 | `fast_image_resize` Lanczos3 |
| --- | ---: | ---: |
| `render`: 960 and 400, stamped | 401 ms | 314 ms |
| `render`: 1920 and 400, unstamped | 875 ms | 368 ms |
| `render`: 960 only | 356 ms | 295 ms |
| `stamp` at full size, for reference | about 850 ms | about 850 ms |

What is left is mostly decoding. The binary grows by 61 KiB with the crate's `only_u8x4`
feature, which compiles the one pixel type the pipeline uses.

**The cheaper route that was dropped.** libvips' split was tried first: average whole
`k` x `k` blocks of the frame, by the largest `k` that leaves Lanczos3 at least a 2x
reduction, then let Lanczos3 finish. It is fast with `image` alone, but whenever `k` does not
divide the frame, the last block is partial and the output drifts by up to half a pixel
towards the far edge, and `image`'s resize cannot be given the fractional extent to correct
it. Against a pure Lanczos3 reference that showed as PSNR swinging between 39 and 62 dB with
the divisibility of the frame, not with the quality of the filter. `fast_image_resize` needs
no such step and keeps the geometry exact.

**The `unsafe` it brings.** This crate still has none of its own. `fast_image_resize` has its
intrinsics, behind safe functions; it is given buffers that are already decoded, with
dimensions this crate has checked and computed, so nothing from the file reaches it except
pixel values.

## Decoding

At 794 ms, decoding is the other 31% and there is no obvious lever. `image` already uses
`zune-jpeg`, which is the fast pure-Rust decoder; the alternatives are C libraries that do
not fit a no-`unsafe` wasm crate.

The one structural option is not to decode at full resolution when the output is going to be
smaller anyway. `stamp` preserves the frame size, so it does not apply there; `render` with
small variants is exactly that case, and a decoder that can scale while decoding (the IDCT at
1/2, 1/4 or 1/8, as libjpeg does) would cut the largest remaining cost. `zune-jpeg` 0.5, the
decoder `image` uses here, does not offer it.

## Reproducing this

The harness was throwaway and is not in the repository, because it needs a `stop_after` field
that has no business in the shipped `StampOptions`. To rebuild it:

1. Copy `wasm/` somewhere outside the project.
2. Add `pub stop_after: u32` to `StampOptions` (default 4), carry it through `normalized`,
   and add `if options.stop_after == N { return Ok(Vec::new()); }` after each stage in
   `stamp_image`.
3. `wasm-pack build --target nodejs --out-dir pkg-probe --out-name image_stamper`
4. Drive it from Node: load the fixture, `setStamp` once, then time `applyStamp` per stage.
   Warm up first, take a median over 9 runs.

For quality comparisons, encode the same source buffer with both encoders in one native
example and compute PSNR against the lossless original — see the table above for the shape.
Use a photographic fixture, not noise.

`npm run bench:wasm` remains useful for the pure pixel helpers, but remember it is native and
its absolute numbers do not transfer to the browser.
