# Changelog

## [Unreleased]

### Added

- **A user guide at `/how-to-use`.** Five steps, each one paragraph and one illustration,
  alternating sides down the page, then the limits and defaults that the steps have no room
  for. The illustrations are built from the app's own components rather than screenshotted —
  step three is the real opacity control. Reaching it turned the app into a two-page site:
  `app.vue` is now a shell, the studio moved to `app/pages/index.vue`, and the masthead and
  footer live in `app/layouts/default.vue`.
- **The SEO the site never had.** Per-page title, description and canonical through
  `usePageSeo`, Open Graph and Twitter cards over a generated 1200×630 image, `WebApplication`
  and `HowTo` structured data, and a prerendered `sitemap.xml`.
- **An icon set that belongs to this app.** `favicon.ico` (16/32/48, on a tighter optical
  setting so "AS" survives the tab strip), an Apple touch icon, 192/512 PNGs, a maskable
  variant with its own safe zone, and `site.webmanifest`. All rendered from one vector source
  by `scripts/build-icons.mjs`. The previous `icon.png` was a calligraphic *N* left over from
  a template, black on transparent, and invisible in dark mode.
- **Save to folder, next to the ZIP.** `saveStampedImagesToFolder` writes the stamped frames
  straight into a folder the user picks, as loose files — the archive was only ever a way
  around the browser, and where a browser has a folder picker it is a step to delete, not to
  keep. The File System Access API is back, but this time behind a button: the version
  removed below was unreachable code. Chromium only, checked from `onMounted` rather than
  assumed, and the ZIP remains the path every browser gets. Names already in the chosen
  folder are counted and confirmed before anything is replaced, and a dismissed picker is
  treated as a decision rather than an error.

### Changed

- **`Reset all` appears as soon as the page differs from how it loaded** — a frame added, a
  stamp picked, an opacity dragged — instead of only after a finished run. It was the one
  control that could not undo the state it was hidden behind.

- **The pages are prerendered.** `ssr: false` meant the server returned an empty shell:
  Google would render it eventually, and Bing and every unfurler behind Slack, X, LinkedIn and
  Facebook would not. `ssr: true` plus `nitro.prerender` writes real HTML at build time, and
  nothing is rendered per request. `useTheme` no longer reads `document` during setup, and the
  theme toggle switches with CSS rather than state, so the static HTML is correct before any
  script runs.
- **`robots.txt` stopped forbidding the entire site.** It had said `Disallow: /` since the
  project was scaffolded, which no amount of metadata would have worked around.
- **The masthead lost its chip row.** `wasm v…`, `jpg · q75` and `≤ 120 MP` are reference, not
  controls, and a masthead that reads as a status bar makes the one real action harder to
  find. They moved to the guide, next to the rest of the numbers, and their space went to the
  link to it.

### Removed

- **The last of the File System Access API.** `saveStampedImagesToDirectory` and
  `saveStampedImagesToSpecificDirectory` had been unreachable since the save flow became a
  ZIP in 1.0.5 — the first only forwarded to the ZIP path, the second still carried the
  directory-picker code and the only `any` in the file. Nothing called either.

### Changed

- **The documentation was rewritten against the code.** The README still described the
  directory picker, the old button names, input formats the decoder cannot read, a 50 MB
  size limit that does not exist, and a screenshot of an interface two rewrites old. The
  screenshots are regenerated from a real run; `CHANGELOG.md` gained the 2.1.2 interface
  work, which had never been recorded.
- **The stamp's position is described correctly.** The stamp picker reported `bottom right`;
  the mark is contain-scaled and centred, and always has been.

## [2.1.2] - 2026-09-14

The WASM pipeline was rewritten and the interface rebuilt around it, which is why the version
jumped from 1.0.5 straight to 2.1.2.

### Added

- **A rebuilt interface.** Both pickers are drop targets as well as buttons; frames arrive as
  a filmstrip with the batch's total and largest file called out, and the gallery below shows
  every frame with its dimensions, megapixels and orientation.
- **Light and dark themes.** Only token values change between them, so no component knows
  which theme it is in. The class is set by an inline script before first paint — with
  `ssr: false` the shell is a static `index.html`, so without it the app flashed the light
  palette on every load for anyone on a dark OS. It follows the OS until someone presses the
  toggle, then remembers that choice per browser.
- **Opacity as four presets plus a slider**, each preset filled with the value it stands for,
  so the row reads as a scale. The stamp preview dims with it, over a checkerboard — a white
  mark on a light surround is invisible.
- **A switch for the filename caption**, which used to be unconditional.
- **Live progress**: a bar, a running count and the name of the file being worked on, then
  how long the batch took and how large the archive is.
- **Reset all**, which returns the page to its just-loaded state.
- **Header chips** naming the loaded WASM version, the output format and quality, and the
  megapixel ceiling — so a frame the decoder will refuse is explained before it is refused.
- **Stamp validation with a reason**: not PNG, not PNG data despite the name, or over 10 MB,
  each said in a sentence rather than as a silent rejection.
- **91 tests** (`npm test`) covering the pipeline end to end, EXIF transforms, the subset
  font's alphabet coverage, blending against a naive reference, and option clamping.
- **`examples/bench.rs`** (`npm run bench:wasm`) for timing the hot path.
- **The Ubuntu Font Licence notice**, which the project had been shipping without.

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
- **Object URLs** behind the previews are revoked when the arrays they came from are emptied,
  and the frame strip only creates them for the first eight files — the gallery already
  decodes the rest, and a second full-size copy of each one turned a 120-frame batch into a
  dead tab.

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

Where the remaining time goes, and the one decision still open, are recorded in
[docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## [1.0.5] - 2025-11-01

### Fixed

- **Firefox compatibility**: Firefox opened a separate download dialog for every processed
  image. Saving now produces one ZIP archive instead.

### Changed

- `downloadStampedImages` in `useImageStamping.ts` builds a ZIP rather than downloading files
  one by one. The archive is named `stamped-images-<timestamp>.zip` and holds the images in a
  `stamped-images/` folder, deflated at level 6.
- The File System Access API directory picker was taken out of the save flow rather than
  kept as a Chrome-only branch. Two save paths meant two behaviours to explain and only one
  of them was ever exercised outside Chrome; every browser now gets the same ZIP.
