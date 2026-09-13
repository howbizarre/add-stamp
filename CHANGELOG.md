# Changelog

## [Unreleased] - 2026-09-13

### Fixed
- **EXIF orientation**: portrait frames were stamped sideways. `image` does not apply the
  `Orientation` tag and `to_rgba8` discarded it, so the photo came out rotated with a rotated
  watermark and no EXIF left to correct it. The frame is now uprighted before anything is
  drawn on it.
- **Caption transparency**: the filename was drawn fully opaque. `imageproc::draw_text_mut`
  weighted the composite by glyph coverage alone and treated the colour's alpha as just
  another channel, so the intended 50% grey came out solid. Glyph rasterization is now done
  directly on `ab_glyph`, multiplying coverage by the colour alpha.
- **Transparent PNG input**: `to_rgb8` dropped alpha without compositing, so unpainted areas
  showed whatever happened to be in the colour channels — usually black. Translucent pixels
  are now composited onto a configurable matte, white by default.
- **One bad file no longer kills the batch**: a failed allocation in Rust is a panic, and a
  panic traps the whole WebAssembly instance, so every later photo failed too. Images are now
  refused from their header, before any pixel buffer exists, and the instance survives.
- **Format validation**: an unsupported output format only failed after the image had been
  decoded, resized, blended and captioned. `OutputFormat` is an enum, so it is rejected at
  the boundary.

### Changed
- **WASM API**: the five `apply_stamp*` overloads are replaced by
  `applyStamp(bytes, filename, options)` and `setStamp(bytes, options)`, with every tunable a
  field of `StampOptions` carrying a default — quality, opacity, format, stamp padding, size
  limits, JPEG matte, resize-filter threshold, and the caption's size, margins and colour.
  Values are clamped on entry, so a `NaN` out of an empty number input cannot trap the
  instance.
- **Errors** cross into JavaScript as real `Error` objects rather than bare strings, carrying
  a message that names the file's size and the limit it exceeded.
- **Caption size** is now proportional to the frame (2.2% of its shorter side, clamped to
  16-96px) instead of a fixed 32px, which was effectively invisible on a 24 MP photo.
- **Artifact path**: the WASM files are published to `public/wasm/v<version>/` and served
  immutably. The glue JS and its `.wasm` must agree on wasm-bindgen's schema version, and at
  a fixed path a browser could pair a cached glue from one deploy with the `.wasm` from the
  next.
- **Build script**: `scripts/build-wasm.mjs` replaces the Windows-only `node -e` one-liners.
  It publishes only the files the browser needs — the old copy also served wasm-pack's
  `package.json` and `.gitignore` publicly — and fails the build if the `.wasm` is missing or
  empty, which `nuxt build` cannot detect on its own.

### Performance
- **Binary size 4 481 273 B -> 955 609 B.** Dropping `imageproc` took the dependency graph
  from 154 crates to 41: it depended on `image` with default features, and Cargo unions
  features across the graph, so an AV1 encoder, OpenEXR, TIFF, GIF, QOI, `nalgebra`, `rand`
  and `rayon` were compiled in regardless of this crate's `default-features = false`. The
  rest comes from a release profile (`lto = "fat"`, `codegen-units = 1`, `panic = "abort"`,
  `strip`), `simd128`, and subsetting the embedded font from 341 324 B to 77 480 B.
- **Scaled-stamp cache**: frames of the same size reuse one resized stamp, so the resize runs
  once per batch instead of once per photo. That is what makes Lanczos3 affordable, replacing
  the bilinear filter the old code used for speed.
- **Blending** walks the intersection of the two rectangles as row slices and skips fully
  transparent overlay pixels, instead of a per-pixel bounds test and `get_pixel` call — about
  64 million redundant bounds checks per 24 MP frame.
- **JPEG encoding** builds RGB directly from the RGBA buffer rather than allocating a full
  `DynamicImage` copy first.

### Added
- 91 tests (`npm test`) covering the pipeline end to end, EXIF transforms, the subset font's
  alphabet coverage, blending equivalence against a naive reference, and option clamping.
- `examples/bench.rs` (`npm run bench:wasm`) for timing the hot path.
- The Ubuntu Font Licence notice, which the project had been shipping without.
## [Previous] - 2025-11-01

### Fixed
- **Firefox Compatibility**: Resolved issue where Firefox would open individual download dialogs for each processed image when saving to disk
  - Added JSZip library to create a single ZIP archive containing all stamped images
  - Chrome and other browsers supporting File System Access API continue to use the native directory picker
  - Firefox and other browsers without File System Access API support now download a single ZIP file instead of triggering multiple download dialogs

### Changed
- Modified `downloadStampedImages` method in `useImageStamping.ts` to create ZIP archives instead of individual file downloads
- ZIP files are named with timestamp: `stamped-images-{timestamp}.zip`
- All images are organized in a `stamped-images` folder within the ZIP archive

### Technical Details
- The application now detects browser support for File System Access API
- **Chrome/Edge**: Uses native directory picker with `showDirectoryPicker()` API
- **Firefox/Safari**: Falls back to ZIP download method
- ZIP compression level set to 6 (balanced between speed and file size)
