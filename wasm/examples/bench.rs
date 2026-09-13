//! Times the stamping hot path on a synthetic 24 MP frame.
//!
//! Exists to answer two questions with numbers instead of assumptions:
//!   1. which `opt-level` to ship — size is easy to measure, speed is not;
//!   2. how much Lanczos3 actually costs versus Triangle at the ~11x upscale this product
//!      applies, which decides whether the filter switch is worth its visual risk.
//!
//! Runs on the native target, so absolute times are not wasm times. The ratios between
//! configurations are what this is for.
//!
//! Usage: cargo run --release --example bench

use std::time::Instant;

use image::{ImageEncoder, Rgba, RgbaImage, codecs::jpeg::JpegEncoder, imageops};
use image_stamper::{blend, defaults, layout, text};

use ab_glyph::{FontRef, PxScale};

const IMG_WIDTH: u32 = 6000;
const IMG_HEIGHT: u32 = 4000;
const STAMP_WIDTH: u32 = 500;
const STAMP_HEIGHT: u32 = 373;
/// The shipped default, so the bench measures what the product actually does.
const PADDING: u32 = defaults::STAMP_PADDING;

static FONT_DATA: &[u8] = include_bytes!("../src/Ubuntu-M-subset.ttf");

fn timed<T>(label: &str, f: impl FnOnce() -> T) -> T {
    let start = Instant::now();
    let value = f();

    println!("{label:<38} {:>9.1} ms", start.elapsed().as_secs_f64() * 1000.0);

    value
}

/// A stamp with a soft alpha ramp, so the blend does real per-pixel work rather than
/// hitting one uniform value.
fn make_stamp() -> RgbaImage {
    RgbaImage::from_fn(STAMP_WIDTH, STAMP_HEIGHT, |x, y| {
        let alpha = ((x * 255 / STAMP_WIDTH) as u8).saturating_add((y * 64 / STAMP_HEIGHT) as u8);

        Rgba([220, 220, 220, alpha])
    })
}

fn make_photo() -> RgbaImage {
    RgbaImage::from_fn(IMG_WIDTH, IMG_HEIGHT, |x, y| {
        Rgba([(x % 256) as u8, (y % 256) as u8, ((x + y) % 256) as u8, 255])
    })
}

fn main() {
    println!("{IMG_WIDTH}x{IMG_HEIGHT} photo, {STAMP_WIDTH}x{STAMP_HEIGHT} stamp\n");

    let stamp = timed("build synthetic stamp", make_stamp);
    let mut photo = timed("build synthetic photo", make_photo);

    let scale = layout::contain_scale(IMG_WIDTH, IMG_HEIGHT, STAMP_WIDTH, STAMP_HEIGHT, PADDING);
    let (target_w, target_h) = layout::scaled_size(STAMP_WIDTH, STAMP_HEIGHT, scale);

    println!("\nupscale factor {scale:.2}x -> {target_w}x{target_h}\n");

    let lanczos = timed("resize Lanczos3", || {
        imageops::resize(&stamp, target_w, target_h, imageops::FilterType::Lanczos3)
    });

    let triangle = timed("resize Triangle", || {
        imageops::resize(&stamp, target_w, target_h, imageops::FilterType::Triangle)
    });

    // How far apart the two filters actually land, in mean absolute per-channel difference.
    let mut total_diff = 0u64;

    for (a, b) in lanczos.pixels().zip(triangle.pixels()) {
        for channel in 0..4 {
            total_diff += a[channel].abs_diff(b[channel]) as u64;
        }
    }

    let mean_diff = total_diff as f64 / (lanczos.pixels().len() * 4) as f64;

    println!("\nLanczos3 vs Triangle mean channel diff: {mean_diff:.3} / 255\n");

    let (x_offset, y_offset) = layout::centered_offsets(IMG_WIDTH, IMG_HEIGHT, target_w, target_h);

    timed("blend stamp onto photo", || {
        blend::blend_over(&mut photo, &lanczos, x_offset, y_offset, 1.0);
    });

    // The synthetic stamp above is almost entirely opaque, which is the worst case for the
    // transparent-pixel shortcut. A real logo is mostly empty space, so measure that too.
    let logo = RgbaImage::from_fn(target_w, target_h, |x, y| {
        let inside = x > target_w / 3 && x < target_w * 2 / 3 && y > target_h / 3 && y < target_h * 2 / 3;

        Rgba([220, 220, 220, if inside { 200 } else { 0 }])
    });

    timed("blend logo-shaped stamp (2/3 empty)", || {
        blend::blend_over(&mut photo, &logo, x_offset, y_offset, 1.0);
    });

    let font = FontRef::try_from_slice(FONT_DATA).expect("font must parse");

    timed("draw filename text", || {
        text::draw_text(
            &mut photo,
            &font,
            // The caption is proportional to the frame now; this is what a 4000 px
            // shorter side works out to.
            PxScale::from(IMG_HEIGHT.min(IMG_WIDTH) as f32 * defaults::TEXT_SIZE_RATIO),
            Rgba([125, 125, 125, 128]),
            100,
            IMG_HEIGHT as i32 - 42,
            "Сватба_Иван_1234",
        );
    });

    let jpeg = timed("encode JPEG q70", || {
        let mut rgb = Vec::with_capacity(IMG_WIDTH as usize * IMG_HEIGHT as usize * 3);

        for pixel in photo.as_raw().chunks_exact(4) {
            rgb.extend_from_slice(&pixel[0..3]);
        }

        let mut buffer = Vec::new();
        JpegEncoder::new_with_quality(&mut buffer, 70)
            .write_image(&rgb, IMG_WIDTH, IMG_HEIGHT, image::ExtendedColorType::Rgb8)
            .expect("encode must succeed");

        buffer
    });

    println!("\noutput JPEG {:.1} KB", jpeg.len() as f64 / 1024.0);
}
