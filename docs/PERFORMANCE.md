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

## Decoding

At 794 ms, decoding is the other 31% and there is no obvious lever. `image` already uses
`zune-jpeg`, which is the fast pure-Rust decoder; the alternatives are C libraries that do
not fit a no-`unsafe` wasm crate.

The one structural option is not to decode at full resolution when the output is going to be
smaller anyway — but this tool preserves the frame size, so it does not apply.

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
