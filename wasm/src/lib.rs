//! Client-side image watermarking, compiled to WebAssembly.
//!
//! Decoding untrusted image data is a classic memory-corruption surface, so it happens here
//! in memory-safe Rust (no `unsafe` anywhere in this crate) inside the WebAssembly sandbox,
//! on the user's own machine — originals never leave it unstamped.
//!
//! Every tunable is a field of [`StampOptions`] rather than a compile-time constant. This is
//! a general-purpose tool rather than one studio's pipeline, so the numbers that suit a
//! 24 MP wedding shoot are defaults here, not decisions. [`defaults`] holds them.

// Public so integration tests and the examples/bench.rs example can exercise the pure pixel
// helpers directly, without going through the wasm-bindgen surface.
pub mod blend;
pub mod error;
pub mod layout;
pub mod orientation;
pub mod text;

use ab_glyph::{FontRef, PxScale};
use error::StampError;
use image::{Rgba, RgbaImage, imageops};
use wasm_bindgen::prelude::*;

/// Embedded so the watermark renders identically regardless of the fonts a client has.
///
/// A subset of Ubuntu-M, and by far the largest single item in the wasm binary even so —
/// font data is incompressible and passes through `wasm-opt` untouched. The full face was
/// 341 324 B; this is 77 480 B.
///
/// What the subset keeps and why:
///
///   * Latin-1, Latin Extended-A/B and the full Cyrillic block, because the watermark is the
///     filename and those are the alphabets it turns up in. A character outside the set
///     renders as `.notdef`, so the ranges are deliberately wider than strictly needed.
///   * The legacy `kern` table (`--legacy-kern`), because that is the one `ab_glyph` reads.
///     `pyftsubset` drops it by default in favour of GPOS, which `ab_glyph` never consults —
///     dropping it would have silently disabled kerning.
///
/// What it drops: GPOS and GSUB (unused by `ab_glyph`; 94 KB), hinting (`ab_glyph`
/// rasterizes without it), and the `DSIG`/`VDMX`/`LTSH`/`hdmx` metadata tables.
///
/// Regenerate with, from the repository root:
///
/// ```text
/// pyftsubset Ubuntu-M.ttf --output-file=wasm/src/Ubuntu-M-subset.ttf \
///   --unicodes="U+0000-00FF,U+0100-024F,U+0400-04FF,U+2010-2027,U+20AC" \
///   --layout-features='' --legacy-kern --no-hinting \
///   --drop-tables+=DSIG,VDMX,LTSH,hdmx,GPOS,GSUB --name-IDs='*'
/// ```
///
/// `--name-IDs='*'` preserves the `name` table, which carries the Ubuntu Font Licence notice.
/// See `wasm/src/FONT-LICENSE.md`.
static FONT_DATA: &[u8] = include_bytes!("./Ubuntu-M-subset.ttf");

/// The shipped values for every [`StampOptions`] field.
///
/// Named constants rather than literals inside `Default` so tests, the TypeScript layer and
/// the UI can all cite the same numbers, and so changing one is a single edit.
pub mod defaults {
    /// 1-100, JPEG only.
    pub const QUALITY: f32 = 75.0;

    /// Stamp opacity, 0-100.
    pub const OPACITY: f32 = 50.0;

    /// Clear space left around the stamp, in pixels of the source image.
    pub const STAMP_PADDING: u32 = 10;

    /// Hard ceiling on input size, checked from the header before any pixel buffer exists.
    ///
    /// 120 MP leaves generous headroom over a 100 MP medium-format back while still stopping
    /// a decompression bomb: a PNG declaring 30000x30000 would otherwise ask for 3.6 GB, trap
    /// the instance, and take the rest of the batch down with it. It also catches the honest
    /// mistake of dropping a huge stitched panorama into the picker.
    pub const MAX_MEGAPIXELS: f32 = 120.0;

    /// Per-axis cap, matching JPEG's own 16-bit dimension field.
    pub const MAX_DIMENSION: u32 = 65_535;

    /// Opaque white. JPEG cannot store alpha, so semi-transparent pixels are composited onto
    /// this instead of having their alpha dropped, which left dark fringes on transparent PNG
    /// input. Packed `0xRRGGBBAA`; the alpha byte is ignored.
    pub const JPEG_MATTE: u32 = 0xFFFF_FFFF;

    /// Above this upscale factor Lanczos3 has no source detail left to reconstruct, so its
    /// 6x6 kernel buys nothing a bilinear filter does not — at several times the cost.
    /// Set to 0.0 to force Triangle everywhere, or to f32::INFINITY for always-Lanczos3.
    pub const LANCZOS_MAX_UPSCALE: f32 = 2.0;

    /// Caption height as a fraction of the frame's shorter side.
    ///
    /// Replaces a fixed 32 px, which was sized for whatever image happened to be on screen
    /// when it was written. On a 6000x4000 frame 32 px is 0.8 % of the height — legible at
    /// 100 % zoom in an editor and effectively invisible in the delivered photo, which is the
    /// only place it matters. Scaling with the frame keeps the caption the same *apparent*
    /// size at any resolution.
    pub const TEXT_SIZE_RATIO: f32 = 0.022;

    /// Floor on the caption, so a small crop still gets readable glyphs.
    pub const TEXT_SIZE_MIN: f32 = 16.0;

    /// Ceiling on the caption, so a huge stitched panorama does not get a banner across the
    /// bottom.
    pub const TEXT_SIZE_MAX: f32 = 96.0;

    /// Padding below the caption, as a fraction of the font size.
    ///
    /// Proportional for the same reason as the size itself: a fixed 10 px gap under a 96 px
    /// caption reads as touching the edge.
    pub const TEXT_PADDING_RATIO: f32 = 0.35;

    /// Floor on that padding, which is also what a 32 px caption used to get.
    pub const TEXT_PADDING_MIN: f32 = 10.0;

    /// `#7d7d7d` at 50 %, packed `0xRRGGBBAA`. The alpha is now honoured; under `imageproc`
    /// it was ignored and the text came out solid.
    pub const TEXT_COLOR: u32 = 0x7D7D_7D80;
}

/// Upper bound on a caption size or padding, in pixels.
///
/// Only there to keep a nonsensical value from JavaScript — `1e30`, say — out of the glyph
/// rasterizer, which would otherwise try to allocate a coverage bitmap for it.
const MAX_TEXT_DIMENSION: f32 = 100_000.0;

/// Largest megapixel budget that still fits `u32::MAX` pixels, so the cap can never be
/// higher than a dimension pair could reach.
const MAX_MEGAPIXEL_BUDGET: f32 = 4295.0;

/// Routes Rust panics to `console.error` with a readable stack trace instead of surfacing
/// them as a bare `unreachable` trap.
fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

/// Output encodings this crate can produce.
///
/// An enum rather than a format string: JavaScript used to be able to pass anything, and
/// "gif" only failed after the whole image had been decoded, resized, blended and drawn.
/// wasm-bindgen now rejects an unknown value at the boundary, before any work happens.
///
/// Deliberately a plain C-style enum. A string-valued one would carry wasm-bindgen's hidden
/// `__Invalid` variant, which puts the unrepresentable state straight back.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum OutputFormat {
    #[default]
    Jpeg,
    /// Lossless. `quality` has no effect — the encoder in `image` 0.25 has no lossy mode,
    /// so a WebP of an already-compressed photo is often larger than the JPEG.
    WebP,
}

/// Every tunable in the pipeline, with the shipped values in [`defaults`].
///
/// Replaces the chain of five `apply_stamp*` overloads that existed because Rust has no
/// default arguments. From JavaScript: construct it, assign only the fields that differ from
/// the default, and pass it to both `setStamp` and `applyStamp`.
///
/// ```js
/// const options = new StampOptions();
/// options.quality = 90;
/// options.format = OutputFormat.WebP;
/// ```
///
/// Values are clamped to a usable range on entry — see [`StampOptions::normalized`] — so a
/// `NaN` or a negative number out of a text input cannot panic the instance.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StampOptions {
    /// 1-100. Applies to JPEG only; see [`OutputFormat::WebP`].
    pub quality: f32,

    /// Stamp opacity, 0-100.
    pub opacity: f32,

    pub format: OutputFormat,

    /// Clear space left around the stamp, in pixels of the source image.
    pub stamp_padding: u32,

    /// Largest image this instance will decode, in megapixels.
    pub max_megapixels: f32,

    /// Largest single dimension this instance will decode, in pixels.
    pub max_dimension: u32,

    /// Colour that translucent pixels are composited onto when encoding JPEG, packed
    /// `0xRRGGBBAA`. The alpha byte is ignored — JPEG has no alpha channel.
    pub jpeg_matte: u32,

    /// Upscale factor above which the stamp is resized with Triangle instead of Lanczos3.
    pub lanczos_max_upscale: f32,

    /// Caption height as a fraction of the frame's shorter side.
    pub text_size_ratio: f32,

    /// Floor on the caption size, in pixels.
    pub text_size_min: f32,

    /// Ceiling on the caption size, in pixels.
    pub text_size_max: f32,

    /// Padding below the caption, as a fraction of the caption size.
    pub text_padding_ratio: f32,

    /// Floor on that padding, in pixels.
    pub text_padding_min: f32,

    /// Caption colour, packed `0xRRGGBBAA`. The alpha is honoured.
    pub text_color: u32,
}

impl Default for StampOptions {
    fn default() -> Self {
        Self {
            quality: defaults::QUALITY,
            opacity: defaults::OPACITY,
            format: OutputFormat::Jpeg,
            stamp_padding: defaults::STAMP_PADDING,
            max_megapixels: defaults::MAX_MEGAPIXELS,
            max_dimension: defaults::MAX_DIMENSION,
            jpeg_matte: defaults::JPEG_MATTE,
            lanczos_max_upscale: defaults::LANCZOS_MAX_UPSCALE,
            text_size_ratio: defaults::TEXT_SIZE_RATIO,
            text_size_min: defaults::TEXT_SIZE_MIN,
            text_size_max: defaults::TEXT_SIZE_MAX,
            text_padding_ratio: defaults::TEXT_PADDING_RATIO,
            text_padding_min: defaults::TEXT_PADDING_MIN,
            text_color: defaults::TEXT_COLOR,
        }
    }
}

#[wasm_bindgen]
impl StampOptions {
    /// A fresh set of defaults. Assign the fields that need to differ.
    #[wasm_bindgen(constructor)]
    pub fn new() -> StampOptions {
        StampOptions::default()
    }
}

/// Replaces a non-finite value with a fallback, then clamps it.
///
/// Every float here arrives from JavaScript, where an empty number input is `NaN` and an
/// unconstrained one can be `Infinity`. `f32::clamp` panics if either bound is `NaN`, and
/// `NaN` compares false against everything, so the check has to come first.
fn finite_or(value: f32, fallback: f32, min: f32, max: f32) -> f32 {
    if value.is_finite() {
        value.clamp(min, max)
    } else {
        fallback
    }
}

impl StampOptions {
    /// This option set with every field forced into a range the pipeline can act on.
    ///
    /// Called once per entry point rather than trusted at the setters, because wasm-bindgen
    /// generates plain field setters that cannot validate. The invariants that matter:
    ///
    ///   * `text_size_min <= text_size_max`, or the `clamp` in [`caption_font_size`] panics;
    ///   * no `NaN` anywhere, for the same reason;
    ///   * `max_dimension >= 1`, or `image`'s own limits reject every file.
    pub fn normalized(self) -> StampOptions {
        let text_size_min = finite_or(self.text_size_min, defaults::TEXT_SIZE_MIN, 1.0, MAX_TEXT_DIMENSION);
        let text_size_max = finite_or(self.text_size_max, defaults::TEXT_SIZE_MAX, 1.0, MAX_TEXT_DIMENSION);

        StampOptions {
            quality: finite_or(self.quality, defaults::QUALITY, 1.0, 100.0),
            opacity: finite_or(self.opacity, defaults::OPACITY, 0.0, 100.0),
            format: self.format,
            stamp_padding: self.stamp_padding,
            max_megapixels: finite_or(
                self.max_megapixels,
                defaults::MAX_MEGAPIXELS,
                // A budget under one pixel would refuse every file; there is no reading of
                // that as an intention, so treat it as the smallest usable value instead.
                0.000_001,
                MAX_MEGAPIXEL_BUDGET,
            ),
            max_dimension: self.max_dimension.max(1),
            jpeg_matte: self.jpeg_matte,
            // Not clamped at the top: f32::INFINITY is the documented way to ask for
            // Lanczos3 at every scale, and `finite_or` would turn it into the default.
            lanczos_max_upscale: if self.lanczos_max_upscale.is_nan() {
                defaults::LANCZOS_MAX_UPSCALE
            } else {
                self.lanczos_max_upscale.max(0.0)
            },
            text_size_ratio: finite_or(self.text_size_ratio, defaults::TEXT_SIZE_RATIO, 0.0, 1.0),
            text_size_min,
            // Swapped bounds are a caller mistake, not an unrepresentable state: honour the
            // floor, which is the one that keeps the caption legible.
            text_size_max: text_size_max.max(text_size_min),
            text_padding_ratio: finite_or(self.text_padding_ratio, defaults::TEXT_PADDING_RATIO, 0.0, 1.0),
            text_padding_min: finite_or(
                self.text_padding_min,
                defaults::TEXT_PADDING_MIN,
                0.0,
                MAX_TEXT_DIMENSION,
            ),
            text_color: self.text_color,
        }
    }
}

/// The stamp resized for one particular target size.
///
/// Every frame in a batch usually shares dimensions, so caching this turns a Lanczos3 resize
/// that ran once per photo into one that runs once per batch.
struct ScaledStamp {
    width: u32,
    height: u32,

    /// Part of the cache key: `lanczos_max_upscale` is caller-settable and can change
    /// between calls, so a cache hit on size alone could serve a stamp scaled with the other
    /// filter.
    lanczos: bool,

    image: RgbaImage,
}

#[wasm_bindgen]
pub struct ImageStamper {
    /// The decoded stamp, kept as a buffer so no per-image copy of the raw bytes is needed.
    stamp: Option<RgbaImage>,

    scaled_stamp: Option<ScaledStamp>,

    /// Parsed once. Re-parsing per image cost a 341 KB copy plus a full TTF table parse on
    /// every photo.
    font: FontRef<'static>,
}

impl Default for ImageStamper {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl ImageStamper {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ImageStamper {
        init_panic_hook();

        ImageStamper {
            stamp: None,
            scaled_stamp: None,
            // The font is embedded at compile time, so a parse failure is a build defect,
            // not a runtime condition a caller could handle.
            font: FontRef::try_from_slice(FONT_DATA).expect("embedded Ubuntu-M subset must be a valid font"),
        }
    }

    /// Decodes the stamp image and keeps it for subsequent [`Self::apply_stamp`] calls.
    ///
    /// Takes the options because the stamp is decoded under the same size limits as a photo:
    /// a decompression bomb dropped into the stamp picker traps the instance just as surely.
    #[wasm_bindgen(js_name = "setStamp")]
    pub fn set_stamp(&mut self, stamp_bytes: &[u8], options: &StampOptions) -> Result<(), JsError> {
        Ok(self.set_stamp_bytes(stamp_bytes, *options)?)
    }

    /// Whether a stamp has been loaded.
    ///
    /// Before this, the only way for JavaScript to find out was to call `setStamp` and see
    /// whether it threw.
    #[wasm_bindgen(getter, js_name = "hasStamp")]
    pub fn has_stamp(&self) -> bool {
        self.stamp.is_some()
    }

    /// Width of the loaded stamp in pixels, or 0 if none is loaded.
    #[wasm_bindgen(getter, js_name = "stampWidth")]
    pub fn stamp_width(&self) -> u32 {
        self.stamp.as_ref().map_or(0, |stamp| stamp.width())
    }

    /// Height of the loaded stamp in pixels, or 0 if none is loaded.
    #[wasm_bindgen(getter, js_name = "stampHeight")]
    pub fn stamp_height(&self) -> u32 {
        self.stamp.as_ref().map_or(0, |stamp| stamp.height())
    }

    /// Centres the stamp over `image_bytes`, writes `filename` along the bottom edge, and
    /// encodes the result.
    ///
    /// Pass an empty `filename` to skip the caption.
    #[wasm_bindgen(js_name = "applyStamp")]
    pub fn apply_stamp(
        &mut self,
        image_bytes: &[u8],
        filename: &str,
        options: &StampOptions,
    ) -> Result<Vec<u8>, JsError> {
        Ok(self.stamp_image(image_bytes, filename, *options)?)
    }
}

impl ImageStamper {
    /// [`Self::set_stamp`] in terms of [`StampError`], for native callers.
    pub fn set_stamp_bytes(&mut self, stamp_bytes: &[u8], options: StampOptions) -> Result<(), StampError> {
        let options = options.normalized();
        let img = decode_within_limits(stamp_bytes, &options)?;

        self.stamp = Some(img.to_rgba8());
        // A new stamp invalidates anything scaled from the old one.
        self.scaled_stamp = None;

        Ok(())
    }

    /// The real implementation, in terms of [`StampError`].
    ///
    /// Public but not exported to JavaScript: this is the entry point integration tests use,
    /// because constructing a `JsValue`/`JsError` off the wasm target aborts the process.
    pub fn stamp_image(
        &mut self,
        image_bytes: &[u8],
        filename: &str,
        options: StampOptions,
    ) -> Result<Vec<u8>, StampError> {
        let options = options.normalized();

        if self.stamp.is_none() {
            return Err(StampError::StampNotSet);
        }

        // Read the orientation before decoding: to_rgba8 discards every trace of EXIF.
        let orientation = orientation::read_orientation(image_bytes);

        let img = decode_within_limits(image_bytes, &options)?;

        // Upright the frame first, so the stamp and the text are laid out against what the
        // viewer will actually see. The output carries no EXIF, so this is the only chance.
        let mut rgba_img = orientation.apply(img.to_rgba8());
        let img_width = rgba_img.width();
        let img_height = rgba_img.height();

        self.prepare_scaled_stamp(img_width, img_height, &options)?;

        // Sound: prepare_scaled_stamp either populated this or returned an error.
        let stamp = self.scaled_stamp.as_ref().expect("scaled stamp was just prepared");
        let (x_offset, y_offset) = layout::centered_offsets(img_width, img_height, stamp.width, stamp.height);

        blend::blend_over(&mut rgba_img, &stamp.image, x_offset, y_offset, options.opacity / 100.0);

        if !filename.is_empty() {
            self.add_text_watermark(&mut rgba_img, filename, &options);
        }

        encode_image(rgba_img, &options)
    }

    /// Ensures `self.scaled_stamp` holds the stamp sized for this image, resizing only on a
    /// cache miss.
    fn prepare_scaled_stamp(
        &mut self,
        img_width: u32,
        img_height: u32,
        options: &StampOptions,
    ) -> Result<(), StampError> {
        let stamp = self.stamp.as_ref().ok_or(StampError::StampNotSet)?;

        let scale = layout::contain_scale(
            img_width,
            img_height,
            stamp.width(),
            stamp.height(),
            options.stamp_padding,
        );
        let (width, height) = layout::scaled_size(stamp.width(), stamp.height(), scale);
        let lanczos = scale <= options.lanczos_max_upscale;

        if let Some(cached) = &self.scaled_stamp
            && cached.width == width
            && cached.height == height
            && cached.lanczos == lanczos
        {
            return Ok(());
        }

        let filter = if lanczos {
            imageops::FilterType::Lanczos3
        } else {
            imageops::FilterType::Triangle
        };

        let image = imageops::resize(stamp, width, height, filter);

        self.scaled_stamp = Some(ScaledStamp {
            width,
            height,
            lanczos,
            image,
        });

        Ok(())
    }

    /// Draws `filename` centred along the bottom edge, at a size proportional to the frame.
    fn add_text_watermark(&self, img: &mut RgbaImage, filename: &str, options: &StampOptions) {
        let font_size = caption_font_size(img.width(), img.height(), options);
        let padding = (font_size * options.text_padding_ratio).max(options.text_padding_min);
        let scale = PxScale::from(font_size);
        let text_width = text::measure_text(&self.font, scale, filename);

        let x = ((img.width() as f32 - text_width) / 2.0).max(padding) as i32;
        let y = img.height() as i32 - padding as i32 - font_size as i32;

        text::draw_text(img, &self.font, scale, unpack_rgba(options.text_color), x, y, filename);
    }
}

/// Unpacks a `0xRRGGBBAA` colour.
///
/// Packed into one integer rather than four fields because that is what a colour input on the
/// JavaScript side produces, and because a `#[wasm_bindgen]` struct cannot carry an array.
fn unpack_rgba(value: u32) -> Rgba<u8> {
    Rgba([
        (value >> 24) as u8,
        (value >> 16) as u8,
        (value >> 8) as u8,
        value as u8,
    ])
}

/// Caption size for a frame, clamped to the configured readable range.
///
/// Driven by the shorter side so a panorama is not given a caption sized for its width. Pure
/// and separate from the drawing so the clamp can be tested without rendering anything.
///
/// Takes normalized options: `clamp` panics if `text_size_min > text_size_max`, and
/// [`StampOptions::normalized`] is what rules that out.
fn caption_font_size(width: u32, height: u32, options: &StampOptions) -> f32 {
    let shorter = width.min(height) as f32;

    (shorter * options.text_size_ratio).clamp(options.text_size_min, options.text_size_max)
}

/// True when an image of this size is past what we are willing to decode.
///
/// Widened to `u64` before multiplying: 65535 x 65535 overflows `u32`, and an overflow here
/// would wrap a bomb into a small number and wave it through.
fn exceeds_pixel_budget(width: u32, height: u32, max_megapixels: f32) -> bool {
    let pixels = u64::from(width) * u64::from(height);

    pixels as f64 > f64::from(max_megapixels) * 1_000_000.0
}

/// Flattens an RGBA buffer to RGB, compositing anything translucent onto `matte`.
fn flatten_to_rgb(rgba: &[u8], matte: [u8; 3]) -> Vec<u8> {
    let mut rgb = Vec::with_capacity(rgba.len() / 4 * 3);

    for pixel in rgba.chunks_exact(4) {
        match pixel[3] {
            // Every pixel of a photograph, so this is the path that matters.
            u8::MAX => rgb.extend_from_slice(&pixel[0..3]),
            // to_rgb8 dropped alpha without compositing, so a transparent PNG came out with
            // its unpainted areas showing whatever happened to be in the colour channels.
            alpha => {
                let a = u32::from(alpha);
                let inv = 255 - a;

                for (channel, matte_channel) in pixel[0..3].iter().zip(matte) {
                    let blended = u32::from(*channel) * a + u32::from(matte_channel) * inv;
                    rgb.push((blended / 255) as u8);
                }
            }
        }
    }

    rgb
}

/// Decodes an image, rejecting anything oversized from the header before a pixel buffer is
/// allocated.
///
/// A failed allocation in Rust is a panic, which traps the whole WebAssembly instance — not
/// just this call. Every later call into the same instance then fails too, so one oversized
/// photo used to poison the rest of the batch. Refusing early keeps the instance alive and
/// turns the failure into an ordinary error for one file.
fn decode_within_limits(image_bytes: &[u8], options: &StampOptions) -> Result<image::DynamicImage, StampError> {
    use image::{ImageReader, Limits};
    use std::io::Cursor;

    let header = ImageReader::new(Cursor::new(image_bytes))
        .with_guessed_format()
        .map_err(|e| StampError::Decode(e.to_string()))?;

    let (width, height) = header
        .into_dimensions()
        .map_err(|e| StampError::Decode(e.to_string()))?;

    if exceeds_pixel_budget(width, height, options.max_megapixels) {
        return Err(StampError::TooLarge {
            width,
            height,
            limit_megapixels: options.max_megapixels,
        });
    }

    // Reading the header consumed that reader, so build a second one to decode with.
    // The limits are defence in depth: they still apply if a decoder reports one size in the
    // header and then tries to allocate for another.
    let mut reader = ImageReader::new(Cursor::new(image_bytes))
        .with_guessed_format()
        .map_err(|e| StampError::Decode(e.to_string()))?;

    let mut limits = Limits::default();
    limits.max_image_width = Some(options.max_dimension);
    limits.max_image_height = Some(options.max_dimension);
    reader.limits(limits);

    reader.decode().map_err(|e| StampError::Decode(e.to_string()))
}

/// Encodes `img` as JPEG or WebP.
///
/// Takes ownership so neither path has to clone the buffer — a 24 MP frame is a 96 MB
/// buffer, and the previous version wrapped it in a `DynamicImage` and then allocated
/// another 72 MB for the RGB conversion alongside it.
fn encode_image(img: RgbaImage, options: &StampOptions) -> Result<Vec<u8>, StampError> {
    use image::{DynamicImage, ImageEncoder, ImageFormat, codecs::jpeg::JpegEncoder};
    use std::io::Cursor;

    let mut buffer = Vec::new();

    match options.format {
        OutputFormat::Jpeg => {
            let (width, height) = img.dimensions();
            let matte = unpack_rgba(options.jpeg_matte);

            // JPEG has no alpha channel. Build RGB directly instead of going through
            // DynamicImage::to_rgb8, which would allocate a full RGBA copy first.
            let rgb = flatten_to_rgb(img.as_raw(), [matte[0], matte[1], matte[2]]);

            drop(img);

            let mut cursor = Cursor::new(&mut buffer);
            let encoder = JpegEncoder::new_with_quality(&mut cursor, options.quality as u8);

            encoder
                .write_image(&rgb, width, height, image::ExtendedColorType::Rgb8)
                .map_err(|e| StampError::Encode(e.to_string()))?;
        }
        OutputFormat::WebP => {
            // image-webp is lossless only, so `quality` has no effect here.
            let mut cursor = Cursor::new(&mut buffer);

            DynamicImage::ImageRgba8(img)
                .write_to(&mut cursor, ImageFormat::WebP)
                .map_err(|e| StampError::Encode(e.to_string()))?;
        }
    }

    Ok(buffer)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options() -> StampOptions {
        StampOptions::default().normalized()
    }

    #[test]
    fn a_normal_photograph_is_within_budget() {
        let budget = defaults::MAX_MEGAPIXELS;

        // 24 MP and 45 MP, the two sizes most cameras produce.
        assert!(!exceeds_pixel_budget(6000, 4000, budget));
        assert!(!exceeds_pixel_budget(8192, 5464, budget));
        // 100 MP medium format is really 87 MP, still inside the limit.
        assert!(!exceeds_pixel_budget(11648, 8736, budget));
    }

    #[test]
    fn a_decompression_bomb_is_rejected() {
        // The classic case: 30000x30000 would ask for 3.6 GB and trap the instance.
        assert!(exceeds_pixel_budget(30_000, 30_000, defaults::MAX_MEGAPIXELS));
    }

    /// The whole point of widening to u64 first: 65535 * 65535 wraps in u32 to a value
    /// well under the budget, which would let the largest possible image straight through.
    #[test]
    fn the_budget_check_does_not_overflow() {
        assert!(exceeds_pixel_budget(u32::MAX, u32::MAX, defaults::MAX_MEGAPIXELS));
        assert!(exceeds_pixel_budget(65_535, 65_535, defaults::MAX_MEGAPIXELS));
    }

    /// The budget is a caller setting now, so a frame that passes at one limit has to be
    /// refused at a lower one.
    #[test]
    fn the_budget_follows_the_configured_limit() {
        assert!(!exceeds_pixel_budget(6000, 4000, 25.0));
        assert!(exceeds_pixel_budget(6000, 4000, 20.0));
    }

    #[test]
    fn an_opaque_pixel_keeps_its_colour_exactly() {
        let rgba = [10, 20, 30, 255];

        assert_eq!(flatten_to_rgb(&rgba, [255, 255, 255]), vec![10, 20, 30]);
    }

    #[test]
    fn a_fully_transparent_pixel_becomes_the_matte() {
        // Note the colour channels are black: dropping alpha without compositing, as
        // to_rgb8 did, would have produced black here instead of white.
        let rgba = [0, 0, 0, 0];

        assert_eq!(flatten_to_rgb(&rgba, [255, 255, 255]), vec![255, 255, 255]);
    }

    #[test]
    fn a_half_transparent_pixel_lands_between_colour_and_matte() {
        let rgba = [0, 0, 0, 128];
        let rgb = flatten_to_rgb(&rgba, [255, 255, 255]);

        // 0 * 128/255 + 255 * 127/255 = 127
        assert_eq!(rgb, vec![127, 127, 127]);
    }

    #[test]
    fn flattening_handles_several_pixels() {
        let rgba = [10, 20, 30, 255, 0, 0, 0, 0];

        assert_eq!(flatten_to_rgb(&rgba, [255, 255, 255]), vec![10, 20, 30, 255, 255, 255]);
    }

    /// The matte is configurable, so a caller asking for black must not silently get white.
    #[test]
    fn the_matte_colour_is_honoured() {
        assert_eq!(flatten_to_rgb(&[0, 0, 0, 0], [0, 0, 0]), vec![0, 0, 0]);
        assert_eq!(flatten_to_rgb(&[255, 255, 255, 0], [12, 34, 56]), vec![12, 34, 56]);
    }

    #[test]
    fn a_packed_colour_unpacks_in_rgba_order() {
        assert_eq!(unpack_rgba(0x7D7D_7D80), Rgba([125, 125, 125, 128]));
        assert_eq!(unpack_rgba(0xFFFF_FFFF), Rgba([255, 255, 255, 255]));
        assert_eq!(unpack_rgba(0x0000_00FF), Rgba([0, 0, 0, 255]));
        assert_eq!(unpack_rgba(0x1234_5678), Rgba([0x12, 0x34, 0x56, 0x78]));
    }

    /// The default text colour is the documented `#7d7d7d` at 50 %.
    #[test]
    fn the_default_text_colour_is_grey_at_half_alpha() {
        assert_eq!(unpack_rgba(defaults::TEXT_COLOR), Rgba([125, 125, 125, 128]));
    }

    /// Exercises the real decode path end to end, including the header pre-read.
    #[test]
    fn a_real_image_decodes_within_limits() {
        use image::{ImageFormat, RgbaImage};
        use std::io::Cursor;

        let mut png = Vec::new();
        let source = RgbaImage::from_pixel(64, 32, Rgba([1, 2, 3, 255]));

        image::DynamicImage::ImageRgba8(source)
            .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
            .expect("test image must encode");

        let decoded = decode_within_limits(&png, &options()).expect("a 64x32 png is well within limits");

        assert_eq!(decoded.to_rgba8().dimensions(), (64, 32));
    }

    #[test]
    fn garbage_input_is_an_error_not_a_panic() {
        assert!(decode_within_limits(b"this is not an image", &options()).is_err());
        assert!(decode_within_limits(&[], &options()).is_err());
    }

    #[test]
    fn a_full_frame_gets_a_caption_proportional_to_it() {
        // 4000 * 0.022 = 88 px on the shorter side of a 24 MP frame. The old fixed 32 px was
        // 0.8 % of the height and effectively invisible in the delivered photo.
        assert_eq!(caption_font_size(6000, 4000, &options()), 88.0);
    }

    #[test]
    fn a_small_crop_still_gets_readable_glyphs() {
        // 400 * 0.022 = 8.8, below the floor.
        assert_eq!(caption_font_size(600, 400, &options()), defaults::TEXT_SIZE_MIN);
    }

    #[test]
    fn a_huge_frame_does_not_get_a_banner() {
        // 10000 * 0.022 = 220, above the ceiling.
        assert_eq!(caption_font_size(12000, 10000, &options()), defaults::TEXT_SIZE_MAX);
    }

    #[test]
    fn the_shorter_side_drives_the_size_so_a_panorama_is_not_shouted_at() {
        // Same shorter side, wildly different widths: the caption must not grow with the width.
        let options = options();

        assert_eq!(
            caption_font_size(20000, 2000, &options),
            caption_font_size(2000, 2000, &options)
        );
        assert_eq!(
            caption_font_size(2000, 20000, &options),
            caption_font_size(2000, 2000, &options)
        );
    }

    #[test]
    fn the_size_never_leaves_the_clamp() {
        let options = options();

        for (width, height) in [(1, 1), (u32::MAX, u32::MAX), (1, 65535), (65535, 1)] {
            let size = caption_font_size(width, height, &options);

            assert!(
                (defaults::TEXT_SIZE_MIN..=defaults::TEXT_SIZE_MAX).contains(&size),
                "{width}x{height} produced {size}"
            );
        }
    }

    #[test]
    fn the_caption_stays_inside_the_frame_at_every_size() {
        // The y position is `height - padding - font_size`, so a frame short enough for those two
        // to exceed it would draw off the top. Checks the floor case, which is the tightest.
        let options = options();

        for height in [64u32, 200, 1000, 4000] {
            let font_size = caption_font_size(height * 2, height, &options);
            let padding = (font_size * options.text_padding_ratio).max(options.text_padding_min);

            assert!(
                font_size + padding < height as f32,
                "a {height}px frame would draw its caption outside the image"
            );
        }
    }

    /// A caller can size the caption however they like — that is the point of the fields —
    /// but the ratio still has to drive it.
    #[test]
    fn a_custom_ratio_changes_the_caption_size() {
        let big = StampOptions {
            text_size_ratio: 0.1,
            text_size_max: 1000.0,
            ..Default::default()
        }
        .normalized();

        assert_eq!(caption_font_size(6000, 4000, &big), 400.0);
    }

    #[test]
    fn the_defaults_survive_normalization_unchanged() {
        assert_eq!(StampOptions::default().normalized(), StampOptions::default());
    }

    /// An empty number input in a browser reads back as `NaN`. Every float field has to
    /// survive that, because `f32::clamp` panics on a `NaN` bound and a panic traps the
    /// whole instance.
    #[test]
    fn nan_in_any_float_field_falls_back_to_the_default() {
        let nan = StampOptions {
            quality: f32::NAN,
            opacity: f32::NAN,
            max_megapixels: f32::NAN,
            lanczos_max_upscale: f32::NAN,
            text_size_ratio: f32::NAN,
            text_size_min: f32::NAN,
            text_size_max: f32::NAN,
            text_padding_ratio: f32::NAN,
            text_padding_min: f32::NAN,
            ..Default::default()
        }
        .normalized();

        assert_eq!(nan, StampOptions::default());
    }

    #[test]
    fn out_of_range_values_are_clamped_rather_than_refused() {
        let wild = StampOptions {
            quality: 1000.0,
            opacity: -40.0,
            text_size_ratio: 9.0,
            text_padding_ratio: -1.0,
            ..Default::default()
        }
        .normalized();

        assert_eq!(wild.quality, 100.0);
        assert_eq!(wild.opacity, 0.0);
        assert_eq!(wild.text_size_ratio, 1.0);
        assert_eq!(wild.text_padding_ratio, 0.0);
    }

    /// `caption_font_size` clamps between these two, and `f32::clamp` panics when they are
    /// the wrong way round. Normalization is what makes that unreachable.
    #[test]
    fn swapped_text_size_bounds_are_repaired() {
        let swapped = StampOptions {
            text_size_min: 90.0,
            text_size_max: 20.0,
            ..Default::default()
        }
        .normalized();

        assert!(swapped.text_size_min <= swapped.text_size_max);
        // The floor wins: it is the bound that keeps the caption legible.
        assert_eq!(swapped.text_size_min, 90.0);
        assert_eq!(swapped.text_size_max, 90.0);

        // The real reason this matters — no panic.
        assert_eq!(caption_font_size(6000, 4000, &swapped), 90.0);
    }

    /// Infinity is the documented way to ask for Lanczos3 at every scale, so unlike the
    /// other floats it has to pass through rather than fall back.
    #[test]
    fn an_infinite_lanczos_threshold_is_kept() {
        let always = StampOptions {
            lanczos_max_upscale: f32::INFINITY,
            ..Default::default()
        }
        .normalized();

        assert_eq!(always.lanczos_max_upscale, f32::INFINITY);
    }

    #[test]
    fn a_zero_max_dimension_is_lifted_to_one() {
        let zero = StampOptions {
            max_dimension: 0,
            ..Default::default()
        }
        .normalized();

        // 0 would make image's own limits refuse every file, including valid ones.
        assert_eq!(zero.max_dimension, 1);
    }

    /// Normalizing an already-normalized set must not move anything: the pipeline calls it
    /// at more than one entry point.
    #[test]
    fn normalization_is_idempotent() {
        let wild = StampOptions {
            quality: 1000.0,
            opacity: -40.0,
            text_size_min: 90.0,
            text_size_max: 20.0,
            max_dimension: 0,
            ..Default::default()
        }
        .normalized();

        assert_eq!(wild.normalized(), wild);
    }
}
