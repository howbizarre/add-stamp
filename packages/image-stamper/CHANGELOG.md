# Changelog

All notable changes to the `image-stamper` npm package. The Rust crate it is built from has
its own history in the repository's top-level
[CHANGELOG.md](https://github.com/howbizarre/add-stamp/blob/master/CHANGELOG.md).

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
- `image-stamper/wasm` exposes the raw wasm-bindgen bindings, and
  `image-stamper/image_stamper_bg.wasm` the binary, for hosting setups that need them.
- `FONT-LICENSE.md` with the Ubuntu Font Licence and `THIRD-PARTY-LICENSES.md` with the licence
  of every Rust crate compiled into the binary, generated from `Cargo.lock`, both shipped in the
  tarball.
- Clear errors for a module that is not instantiated yet, a stamper that has been freed, an
  unknown format, a non-numeric option, an integer option that would wrap at the boundary,
  and a colour that is not CSS hex.
