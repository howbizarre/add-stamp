//! End-to-end tests for the stamping pipeline on the native target.
//!
//! These drive `ImageStamper::stamp_image` rather than the `#[wasm_bindgen]` method, because
//! constructing a `JsError` off the wasm target aborts the process. The logic underneath is
//! the same; only the error conversion at the boundary differs.

use image::{DynamicImage, ImageFormat, Rgba, RgbaImage};
use image_stamper::error::StampError;
use image_stamper::{ImageStamper, MAX_VARIANTS, OutputFormat, Rendering, StampOptions, Variant, defaults};
use std::io::Cursor;

/// Full opacity, so the stamp is unmistakable in the output; everything else default.
fn jpeg_options() -> StampOptions {
    StampOptions {
        quality: 70.0,
        opacity: 100.0,
        ..Default::default()
    }
}

/// A stamp with a distinctive opaque centre and transparent edges, like a real logo.
fn stamp_png() -> Vec<u8> {
    let mut img = RgbaImage::from_pixel(50, 40, Rgba([0, 0, 0, 0]));

    for y in 10..30 {
        for x in 10..40 {
            img.put_pixel(x, y, Rgba([255, 0, 0, 255]));
        }
    }

    encode(DynamicImage::ImageRgba8(img), ImageFormat::Png)
}

fn photo_png(width: u32, height: u32) -> Vec<u8> {
    let img = RgbaImage::from_pixel(width, height, Rgba([120, 120, 120, 255]));

    encode(DynamicImage::ImageRgba8(img), ImageFormat::Png)
}

fn encode(img: DynamicImage, format: ImageFormat) -> Vec<u8> {
    let mut bytes = Vec::new();

    img.write_to(&mut Cursor::new(&mut bytes), format)
        .expect("test fixture must encode");

    bytes
}

fn decode(bytes: &[u8]) -> RgbaImage {
    image::load_from_memory(bytes)
        .expect("output must be a decodable image")
        .to_rgba8()
}

fn dimensions_of(bytes: &[u8]) -> (u32, u32) {
    decode(bytes).dimensions()
}

fn ready_stamper() -> ImageStamper {
    let mut stamper = ImageStamper::new();

    stamper
        .set_stamp_bytes(&stamp_png(), StampOptions::default())
        .expect("stamp must load");

    stamper
}

#[test]
fn stamping_produces_a_jpeg_of_the_same_size() {
    let mut stamper = ready_stamper();

    let output = stamper
        .stamp_image(&photo_png(400, 300), "IMG_1234", jpeg_options())
        .expect("stamping must succeed");

    assert_eq!(&output[0..2], &[0xFF, 0xD8], "output must start with a JPEG SOI marker");
    assert_eq!(dimensions_of(&output), (400, 300));
}

#[test]
fn stamping_without_a_stamp_is_refused() {
    let mut stamper = ImageStamper::new();

    let result = stamper.stamp_image(&photo_png(100, 100), "", jpeg_options());

    assert_eq!(result.unwrap_err(), StampError::StampNotSet);
}

// There is no "unknown format" test any more: `OutputFormat` is an enum, so a format the
// encoder cannot produce no longer type-checks. Before, "gif" was accepted, and only failed
// after the image had been decoded, resized, blended and had its text drawn.

#[test]
fn webp_output_is_produced() {
    let mut stamper = ready_stamper();

    let output = stamper
        .stamp_image(
            &photo_png(200, 150),
            "",
            StampOptions {
                opacity: 100.0,
                format: OutputFormat::WebP,
                ..Default::default()
            },
        )
        .expect("stamping must succeed");

    assert_eq!(&output[0..4], b"RIFF");
    assert_eq!(&output[8..12], b"WEBP");
    assert_eq!(dimensions_of(&output), (200, 150));
}

/// The regression this whole EXIF change exists for: a portrait frame stored as a landscape
/// pixel array plus an Orientation tag must come out portrait, not sideways.
#[test]
fn an_exif_rotated_photo_comes_out_upright() {
    let landscape = jpeg_with_orientation(400, 300, 6);
    let mut stamper = ready_stamper();

    let output = stamper
        .stamp_image(&landscape, "", jpeg_options())
        .expect("stamping must succeed");

    assert_eq!(
        dimensions_of(&output),
        (300, 400),
        "a 90-degree tag must swap the output dimensions"
    );
}

#[test]
fn a_photo_without_an_orientation_tag_is_left_alone() {
    let mut stamper = ready_stamper();

    let output = stamper
        .stamp_image(&photo_png(400, 300), "", jpeg_options())
        .expect("stamping must succeed");

    assert_eq!(dimensions_of(&output), (400, 300));
}

/// A whole batch: the same stamper, many frames of identical size. Exercises the
/// scaled-stamp cache, which must return an identical result on the second and later frames.
#[test]
fn repeated_frames_of_the_same_size_stamp_identically() {
    let mut stamper = ready_stamper();
    let photo = photo_png(400, 300);

    let first = stamper.stamp_image(&photo, "IMG_0001", jpeg_options()).unwrap();
    let second = stamper.stamp_image(&photo, "IMG_0001", jpeg_options()).unwrap();

    assert_eq!(first, second, "the cached stamp must produce byte-identical output");
}

/// A mixed batch. Changing size must invalidate the cache rather than reuse a stamp scaled
/// for the previous frame.
#[test]
fn a_different_frame_size_rescales_the_stamp() {
    let mut stamper = ready_stamper();

    let wide = stamper.stamp_image(&photo_png(400, 300), "", jpeg_options()).unwrap();
    let tall = stamper.stamp_image(&photo_png(300, 400), "", jpeg_options()).unwrap();

    assert_eq!(dimensions_of(&wide), (400, 300));
    assert_eq!(dimensions_of(&tall), (300, 400));
}

/// Replacing the stamp mid-session must not keep serving the old one from the cache.
#[test]
fn replacing_the_stamp_invalidates_the_cache() {
    let photo = photo_png(400, 300);
    let mut stamper = ready_stamper();

    let with_red = stamper.stamp_image(&photo, "", jpeg_options()).unwrap();

    let mut blue = RgbaImage::from_pixel(50, 40, Rgba([0, 0, 0, 0]));
    for y in 10..30 {
        for x in 10..40 {
            blue.put_pixel(x, y, Rgba([0, 0, 255, 255]));
        }
    }

    stamper
        .set_stamp_bytes(
            &encode(DynamicImage::ImageRgba8(blue), ImageFormat::Png),
            StampOptions::default(),
        )
        .expect("second stamp must load");

    let with_blue = stamper.stamp_image(&photo, "", jpeg_options()).unwrap();

    assert_ne!(with_red, with_blue, "a new stamp must not reuse the cached scaling");
}

/// The cache is keyed on the filter as well as the size, because the filter threshold is a
/// caller option that can change between calls at a constant frame size.
#[test]
fn changing_the_resize_filter_invalidates_the_cache() {
    let photo = photo_png(400, 300);
    let mut stamper = ready_stamper();

    // The stamp is upscaled ~7.5x here, so the default 2.0 threshold selects Triangle.
    let triangle = stamper.stamp_image(&photo, "", jpeg_options()).unwrap();

    let lanczos = stamper
        .stamp_image(
            &photo,
            "",
            StampOptions {
                lanczos_max_upscale: f32::INFINITY,
                ..jpeg_options()
            },
        )
        .unwrap();

    assert_ne!(triangle, lanczos, "the filter change must not be served from the cache");
}

/// Padding is an option now, and it feeds the scale, so a larger one has to produce a
/// visibly smaller stamp rather than being ignored.
#[test]
fn a_larger_padding_shrinks_the_stamp() {
    let photo = photo_png(400, 300);
    let mut stamper = ready_stamper();

    let tight = stamper.stamp_image(&photo, "", jpeg_options()).unwrap();

    let loose = stamper
        .stamp_image(
            &photo,
            "",
            StampOptions {
                stamp_padding: 100,
                ..jpeg_options()
            },
        )
        .unwrap();

    assert_ne!(tight, loose);
    assert_eq!(dimensions_of(&loose), (400, 300), "padding must not change the frame");
}

/// A padding wider than the frame leaves no room at all. `scaled_size` floors the stamp at
/// 1x1 for exactly this case, because `imageops::resize` panics on a zero dimension.
#[test]
fn a_padding_wider_than_the_frame_does_not_panic() {
    let mut stamper = ready_stamper();

    let output = stamper
        .stamp_image(
            &photo_png(400, 300),
            "IMG_0001",
            StampOptions {
                stamp_padding: 10_000,
                ..jpeg_options()
            },
        )
        .expect("an unstampable frame must still encode");

    assert_eq!(dimensions_of(&output), (400, 300));
}

/// The options come straight from a UI, so every float can arrive as `NaN` from an empty
/// number input. That must produce a stamped photo, not a trapped instance.
#[test]
fn nonsense_options_are_normalized_rather_than_fatal() {
    let mut stamper = ready_stamper();

    let output = stamper
        .stamp_image(
            &photo_png(400, 300),
            "IMG_0001",
            StampOptions {
                quality: f32::NAN,
                opacity: -500.0,
                max_megapixels: f32::NAN,
                text_size_ratio: f32::NAN,
                // Deliberately the wrong way round; `f32::clamp` panics on these unrepaired.
                text_size_min: 90.0,
                text_size_max: 20.0,
                text_padding_min: f32::NAN,
                ..Default::default()
            },
        )
        .expect("nonsense options must be clamped, not fatal");

    assert_eq!(dimensions_of(&output), (400, 300));
}

/// Lossless, so a caption can be compared pixel for pixel.
///
/// The default caption is `#7d7d7d` at 50 % over a grey test frame, which lands two or three
/// levels away from the background — well inside what JPEG quantization erases on a flat
/// field. These tests are about whether ink reaches the canvas, so they must not be run
/// through a lossy encoder.
fn lossless_options() -> StampOptions {
    StampOptions {
        opacity: 100.0,
        format: OutputFormat::WebP,
        ..Default::default()
    }
}

/// The caption colour is an option now. A fully transparent one must leave the photo
/// untouched, which is also the cheapest proof that the alpha is honoured at all — under
/// `imageproc` it was ignored and the text came out solid.
#[test]
fn a_transparent_caption_colour_draws_nothing() {
    let photo = photo_png(400, 300);
    let mut stamper = ready_stamper();

    let invisible = stamper
        .stamp_image(
            &photo,
            "IMG_0001",
            StampOptions {
                text_color: 0x7D7D_7D00,
                ..lossless_options()
            },
        )
        .unwrap();

    let none = stamper.stamp_image(&photo, "", lossless_options()).unwrap();

    assert_eq!(invisible, none, "alpha 0 must be indistinguishable from no caption");
}

#[test]
fn a_visible_caption_changes_the_photo() {
    let photo = photo_png(400, 300);
    let mut stamper = ready_stamper();

    let captioned = stamper.stamp_image(&photo, "IMG_0001", lossless_options()).unwrap();
    let bare = stamper.stamp_image(&photo, "", lossless_options()).unwrap();

    assert_ne!(captioned, bare);
}

/// The matte is what a transparent PNG's unpainted area becomes in a JPEG. The default is
/// white; asking for black has to actually produce black, not white.
#[test]
fn the_jpeg_matte_colour_reaches_the_output() {
    let transparent = encode(
        DynamicImage::ImageRgba8(RgbaImage::from_pixel(100, 100, Rgba([0, 0, 0, 0]))),
        ImageFormat::Png,
    );

    let mut stamper = ImageStamper::new();
    stamper
        .set_stamp_bytes(&stamp_png(), StampOptions::default())
        .expect("stamp must load");

    // Opacity 0 keeps the stamp out of the way, so the corner is pure matte.
    let white = stamper
        .stamp_image(
            &transparent,
            "",
            StampOptions {
                opacity: 0.0,
                quality: 100.0,
                ..Default::default()
            },
        )
        .unwrap();

    let black = stamper
        .stamp_image(
            &transparent,
            "",
            StampOptions {
                opacity: 0.0,
                quality: 100.0,
                jpeg_matte: 0x0000_00FF,
                ..Default::default()
            },
        )
        .unwrap();

    // A JPEG round-trip is lossy, hence the tolerance rather than an exact comparison.
    assert!(
        decode(&white).get_pixel(0, 0)[0] > 240,
        "the default matte must be white"
    );
    assert!(
        decode(&black).get_pixel(0, 0)[0] < 15,
        "a black matte must come out black"
    );
}

/// A file this large must be refused from its header, before a 3.6 GB allocation traps the
/// instance and takes every later photo in the batch down with it.
#[test]
fn an_oversized_image_is_refused_before_decoding() {
    let mut stamper = ready_stamper();
    let bomb = png_header_declaring(30_000, 30_000);

    let result = stamper.stamp_image(&bomb, "", jpeg_options());

    assert_eq!(
        result.unwrap_err(),
        StampError::TooLarge {
            width: 30_000,
            height: 30_000,
            limit_megapixels: defaults::MAX_MEGAPIXELS
        }
    );
}

/// The budget is an option, so a caller who lowers it must see ordinary photos refused too.
#[test]
fn a_lowered_budget_refuses_a_photo_the_default_would_accept() {
    let mut stamper = ready_stamper();

    let result = stamper.stamp_image(
        &photo_png(400, 300),
        "",
        StampOptions {
            max_megapixels: 0.1,
            ..jpeg_options()
        },
    );

    assert_eq!(
        result.unwrap_err(),
        StampError::TooLarge {
            width: 400,
            height: 300,
            limit_megapixels: 0.1
        }
    );
}

/// After a refusal the stamper must still work — that is the whole point of rejecting
/// early rather than letting the allocation panic.
#[test]
fn the_stamper_survives_a_refused_file() {
    let mut stamper = ready_stamper();

    let _ = stamper.stamp_image(&png_header_declaring(30_000, 30_000), "", jpeg_options());
    let _ = stamper.stamp_image(b"not an image", "", jpeg_options());

    let output = stamper
        .stamp_image(&photo_png(200, 200), "", jpeg_options())
        .expect("the stamper must still be usable after failures");

    assert_eq!(dimensions_of(&output), (200, 200));
}

/// The stamp goes through the same size check as a photo, so a bomb dropped into the stamp
/// picker is refused rather than trapping the instance.
#[test]
fn an_oversized_stamp_is_refused() {
    let mut stamper = ImageStamper::new();

    let result = stamper.set_stamp_bytes(&png_header_declaring(30_000, 30_000), StampOptions::default());

    assert!(result.is_err());
    assert!(!stamper.has_stamp());
}

#[test]
fn the_stamp_getters_report_what_was_loaded() {
    let stamper = ready_stamper();

    assert!(stamper.has_stamp());
    assert_eq!(stamper.stamp_width(), 50);
    assert_eq!(stamper.stamp_height(), 40);
}

#[test]
fn a_fresh_stamper_reports_no_stamp() {
    let stamper = ImageStamper::new();

    assert!(!stamper.has_stamp());
    assert_eq!(stamper.stamp_width(), 0);
    assert_eq!(stamper.stamp_height(), 0);
}

// ---------------------------------------------------------------------------------------
// render: one decode, several outputs
// ---------------------------------------------------------------------------------------

fn sized(max_size: u32) -> Variant {
    Variant {
        max_size,
        ..Default::default()
    }
}

fn plain(max_size: u32) -> Variant {
    Variant {
        max_size,
        stamp: false,
        caption: false,
    }
}

fn sizes(rendering: &Rendering) -> Vec<(u32, u32)> {
    rendering
        .images()
        .iter()
        .map(|image| {
            assert_eq!(
                dimensions_of(&image.bytes),
                (image.width, image.height),
                "the reported size must be the encoded one"
            );

            (image.width, image.height)
        })
        .collect()
}

#[test]
fn render_makes_every_variant_at_its_size() {
    let mut stamper = ready_stamper();

    let rendering = stamper
        .render_image(
            &photo_png(600, 400),
            "IMG_1234",
            jpeg_options(),
            &[sized(0), sized(240), sized(100)],
        )
        .expect("rendering must succeed");

    assert_eq!((rendering.source_width(), rendering.source_height()), (600, 400));
    assert_eq!(sizes(&rendering), vec![(600, 400), (240, 160), (100, 67)]);
}

/// The variants are worked through largest first, but the images must come back in the order
/// the caller asked for them.
#[test]
fn render_returns_the_images_in_the_order_asked() {
    let mut stamper = ready_stamper();

    let rendering = stamper
        .render_image(
            &photo_png(600, 400),
            "",
            jpeg_options(),
            &[sized(100), sized(0), sized(240)],
        )
        .unwrap();

    assert_eq!(sizes(&rendering), vec![(100, 67), (600, 400), (240, 160)]);
}

#[test]
fn render_never_upscales() {
    let mut stamper = ready_stamper();

    let rendering = stamper
        .render_image(&photo_png(300, 200), "", jpeg_options(), &[sized(960)])
        .unwrap();

    assert_eq!(sizes(&rendering), vec![(300, 200)]);
}

/// The finals of a gallery are resized without a stamp; that must not require one.
#[test]
fn variants_without_the_stamp_need_no_stamp_loaded() {
    let mut stamper = ImageStamper::new();

    let rendering = stamper
        .render_image(
            &photo_png(600, 400),
            "IMG_1234",
            jpeg_options(),
            &[plain(192), plain(40)],
        )
        .expect("an unstamped render needs no stamp");

    assert_eq!(sizes(&rendering), vec![(192, 128), (40, 27)]);
}

#[test]
fn a_stamped_variant_without_a_stamp_is_refused() {
    let mut stamper = ImageStamper::new();

    let result = stamper.render_image(&photo_png(600, 400), "", jpeg_options(), &[plain(192), sized(40)]);

    assert_eq!(result.unwrap_err(), StampError::StampNotSet);
}

#[test]
fn no_variants_and_too_many_are_refused() {
    let mut stamper = ready_stamper();
    let photo = photo_png(60, 40);

    assert_eq!(
        stamper.render_image(&photo, "", jpeg_options(), &[]).unwrap_err(),
        StampError::Variants {
            count: 0,
            max: MAX_VARIANTS
        }
    );
    assert_eq!(
        stamper
            .render_image(&photo, "", jpeg_options(), &[sized(10); MAX_VARIANTS + 1])
            .unwrap_err(),
        StampError::Variants {
            count: MAX_VARIANTS + 1,
            max: MAX_VARIANTS
        }
    );
    assert!(
        stamper
            .render_image(&photo, "", jpeg_options(), &[sized(10); MAX_VARIANTS])
            .is_ok()
    );
}

#[test]
fn a_bad_file_fails_the_render_and_the_stamper_carries_on() {
    let mut stamper = ready_stamper();

    let result = stamper.render_image(b"not an image", "", jpeg_options(), &[sized(100)]);

    assert!(matches!(result, Err(StampError::Decode(_))));
    assert!(
        stamper
            .render_image(&photo_png(60, 40), "", jpeg_options(), &[sized(30)])
            .is_ok()
    );
}

/// `max_size` is the longer side as the viewer sees the photo, and the reported source size
/// is upright too.
#[test]
fn an_exif_rotated_photo_renders_upright() {
    let mut stamper = ready_stamper();

    let rendering = stamper
        .render_image(
            &jpeg_with_orientation(400, 300, 6),
            "",
            jpeg_options(),
            &[sized(0), sized(120)],
        )
        .unwrap();

    assert_eq!((rendering.source_width(), rendering.source_height()), (300, 400));
    assert_eq!(sizes(&rendering), vec![(300, 400), (90, 120)]);
}

/// Frames are resized before they are turned upright, so the content has to come out turned
/// the same way as at the full size, not only the dimensions.
#[test]
fn a_resized_rotated_frame_is_turned_like_the_full_one() {
    // Top half black, bottom half white. A 90-degree clockwise turn puts the black on the right.
    let sensor = RgbaImage::from_fn(400, 300, |_, y| {
        if y < 150 {
            Rgba([0, 0, 0, 255])
        } else {
            Rgba([255, 255, 255, 255])
        }
    });
    let mut stamper = ImageStamper::new();

    let rendering = stamper
        .render_image(&jpeg_of_with_orientation(sensor, 6), "", jpeg_options(), &[plain(120)])
        .unwrap();
    let small = decode(&rendering.images()[0].bytes);

    assert_eq!(small.dimensions(), (90, 120));
    assert!(small.get_pixel(10, 60)[0] > 200, "the left side must be white");
    assert!(small.get_pixel(80, 60)[0] < 50, "the right side must be black");
}

/// The stamp is composited per output, so it shows on a stamped variant and not on a plain
/// one of the same size.
#[test]
fn the_stamp_lands_only_where_asked() {
    let mut stamper = ready_stamper();

    let rendering = stamper
        .render_image(&photo_png(400, 300), "", lossless_options(), &[sized(200), plain(200)])
        .unwrap();
    let stamped = decode(&rendering.images()[0].bytes);
    let bare = decode(&rendering.images()[1].bytes);

    assert_eq!(
        *stamped.get_pixel(100, 75),
        Rgba([255, 0, 0, 255]),
        "the stamp's centre is red"
    );
    assert_eq!(
        *bare.get_pixel(100, 75),
        Rgba([120, 120, 120, 255]),
        "the photo shows through"
    );
}

#[test]
fn the_caption_is_drawn_only_where_asked() {
    let mut stamper = ImageStamper::new();
    let captioned = Variant {
        caption: true,
        ..plain(200)
    };

    let rendering = stamper
        .render_image(
            &photo_png(400, 300),
            "IMG_1234",
            lossless_options(),
            &[captioned, plain(200)],
        )
        .unwrap();
    let without = stamper
        .render_image(&photo_png(400, 300), "", lossless_options(), &[captioned])
        .unwrap();

    assert_ne!(rendering.images()[0].bytes, rendering.images()[1].bytes);
    assert_eq!(rendering.images()[1].bytes, without.images()[0].bytes);
}

/// The source-size output of a multi-variant render must be exactly what `applyStamp` makes,
/// whether it is the one that takes the source or a copy of it.
#[test]
fn the_source_size_variant_is_what_apply_stamp_makes() {
    let photo = photo_png(400, 300);
    let mut stamper = ready_stamper();

    let expected = stamper.stamp_image(&photo, "IMG_1234", jpeg_options()).unwrap();
    let rendering = stamper
        .render_image(&photo, "IMG_1234", jpeg_options(), &[sized(0), sized(100), sized(0)])
        .unwrap();

    assert_eq!(rendering.images()[0].bytes, expected);
    assert_eq!(rendering.images()[2].bytes, expected);
}

/// Each output size gets its own scaled stamp from the cache, never one sized for another.
#[test]
fn the_cache_serves_every_size_its_own_stamp() {
    let photo = photo_png(600, 400);
    let mut warm = ready_stamper();

    warm.render_image(&photo, "", lossless_options(), &[sized(240), sized(100)])
        .unwrap();
    let again = warm
        .render_image(&photo, "", lossless_options(), &[sized(240), sized(100)])
        .unwrap();
    let fresh = ready_stamper()
        .render_image(&photo, "", lossless_options(), &[sized(100)])
        .unwrap();

    assert_eq!(again.images()[1].bytes, fresh.images()[0].bytes);
}

/// Builds a structurally valid PNG whose IHDR declares `width` x `height` but whose pixel
/// data is a few bytes long.
///
/// That is exactly the shape of a decompression bomb: a tiny file that asks the decoder for
/// an enormous buffer. The size check must reject it from the header, before the allocation.
fn png_header_declaring(width: u32, height: u32) -> Vec<u8> {
    let mut png = Vec::from(b"\x89PNG\r\n\x1a\n".as_slice());

    let mut ihdr = Vec::from(b"IHDR".as_slice());

    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]); // 8-bit RGBA, no interlace

    png.extend_from_slice(&13u32.to_be_bytes());
    png.extend_from_slice(&ihdr);
    png.extend_from_slice(&crc32(&ihdr).to_be_bytes());

    // An empty zlib stream. The reader needs to reach IDAT to report dimensions; it never
    // inflates this, because the size check rejects the file first.
    let idat = Vec::from(b"IDAT\x78\x01\x03\x00\x00\x00\x00\x01".as_slice());

    png.extend_from_slice(&((idat.len() - 4) as u32).to_be_bytes());
    png.extend_from_slice(&idat);
    png.extend_from_slice(&crc32(&idat).to_be_bytes());

    let iend = Vec::from(b"IEND".as_slice());

    png.extend_from_slice(&0u32.to_be_bytes());
    png.extend_from_slice(&iend);
    png.extend_from_slice(&crc32(&iend).to_be_bytes());

    png
}

/// Builds a real JPEG carrying an Orientation tag, so the parser sees a genuine container.
fn jpeg_with_orientation(width: u32, height: u32, orientation: u16) -> Vec<u8> {
    jpeg_of_with_orientation(
        RgbaImage::from_pixel(width, height, Rgba([120, 120, 120, 255])),
        orientation,
    )
}

/// [`jpeg_with_orientation`] with the pixels given.
fn jpeg_of_with_orientation(pixels: RgbaImage, orientation: u16) -> Vec<u8> {
    let baseline = encode(DynamicImage::ImageRgba8(pixels), ImageFormat::Jpeg);

    let mut tiff = Vec::new();

    tiff.extend_from_slice(b"MM\x00\x2a"); // big-endian TIFF magic
    tiff.extend_from_slice(&8u32.to_be_bytes()); // offset of IFD0
    tiff.extend_from_slice(&1u16.to_be_bytes()); // one entry
    tiff.extend_from_slice(&0x0112u16.to_be_bytes()); // Orientation
    tiff.extend_from_slice(&3u16.to_be_bytes()); // type SHORT
    tiff.extend_from_slice(&1u32.to_be_bytes()); // one value
    tiff.extend_from_slice(&orientation.to_be_bytes());
    tiff.extend_from_slice(&[0, 0]); // SHORT is left-aligned in the 4-byte field
    tiff.extend_from_slice(&0u32.to_be_bytes()); // no IFD1

    let mut app1 = Vec::from(b"Exif\x00\x00".as_slice());
    app1.extend_from_slice(&tiff);

    // Splice the APP1 segment in straight after the SOI marker.
    let mut jpeg = vec![0xFF, 0xD8, 0xFF, 0xE1];

    jpeg.extend_from_slice(&((app1.len() + 2) as u16).to_be_bytes());
    jpeg.extend_from_slice(&app1);
    jpeg.extend_from_slice(&baseline[2..]);

    jpeg
}

/// The PNG decoder validates chunk CRCs, so the fixture above needs a real one.
fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;

    for byte in data {
        crc ^= u32::from(*byte);

        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }

    !crc
}
