# Changelog

All notable changes to the `@howbizarre/image-stamper` npm package. The Rust crate it is built from has
its own history in the repository's top-level
[CHANGELOG.md](https://github.com/howbizarre/add-stamp/blob/master/CHANGELOG.md).

## [0.2.0] - 2026-10-11

Built from crate `image-stamper` 2.2.0.

### Added

- `render(image, { variants, ...options })` and `renderSync` decode an image once and encode
  one to eight variants from it. A variant is `{ maxSize, stamp, caption }`: the longer side on
  the upright frame (never upscaled; 0 or left out keeps the source size), and whether it
  carries the stamp and the caption, both `true` by default. The result is
  `{ sourceWidth, sourceHeight, variants }`, the variants in the order given, each with
  `bytes`, `width`, `height`, `format`, `mimeType` and `extension`. A render whose variants
  all leave the stamp off needs no `setStamp`.
- `StampResult` reports `width`, `height`, `sourceWidth` and `sourceHeight`.
- Errors for a render with no variants or more than eight (`Expected 1 to 8 variants, got 9`),
  and type errors for a variant that is not an object or whose `maxSize`, `stamp` or `caption`
  has the wrong type.
- `src/` ships in the tarball, so the declaration maps lead to the TypeScript source.

### Changed

- `stamp()` and `stampSync()` go through the same path as a one-variant `render`; the bytes
  they produce are unchanged.
- The binary is about 1018 KB (994 KiB), up from 956 KB, for the SIMD resizer
  `fast_image_resize`, and `THIRD-PARTY-LICENSES.md` lists 34 crates.

## [0.1.0] - 2026-10-04

First release, built from crate `image-stamper` 2.1.2.

### Added

- `createImageStamper()` instantiates the WebAssembly module and returns an `ImageStamper`
  with `setStamp` / `stamp` (async, taking bytes, an `ArrayBuffer`, a typed array view or a
  `Blob`/`File`) and `setStampSync` / `stampSync` for bytes already in hand.
- Options as a plain object with camelCase keys and CSS hex colours. Every tunable of the
  crate is exposed; anything left out keeps the compiled-in default, which `defaultOptions()`
  reports at runtime.
- `StampResult` carries the encoded bytes with the matching `mimeType` and `extension`.
- Separate Node entry (the `node` export condition) that reads the `.wasm` from disk, since
  Node's `fetch` does not accept `file:` URLs. Browsers and bundlers get the standard
  `new URL('image_stamper_bg.wasm', import.meta.url)` resolution.
- `@howbizarre/image-stamper/wasm` exposes the raw wasm-bindgen bindings, and
  `@howbizarre/image-stamper/image_stamper_bg.wasm` the binary, for hosting setups that need them.
- `FONT-LICENSE.md` with the Ubuntu Font Licence and `THIRD-PARTY-LICENSES.md` with the licence
  of every Rust crate compiled into the binary, generated from `Cargo.lock`, both shipped in the
  tarball. The embedded font is *Ubuntu Medium derivative Image Stamper*, a subset of Ubuntu
  Medium renamed as that licence requires.
- Clear errors for a module that is not instantiated yet, a stamper that has been freed, an
  unknown format, a non-numeric option, an integer option that would wrap at the boundary,
  and a colour that is not CSS hex.
