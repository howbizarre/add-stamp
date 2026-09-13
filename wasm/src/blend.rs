//! Alpha compositing.
//!
//! Blending happens in sRGB (gamma) space rather than linear light. That matches
//! Photoshop's default, so it is a deliberate choice — changing it would change every
//! stamped image the studio has already delivered.

use image::{Rgba, RgbaImage};

/// Source-over composite of three colour channels at `alpha` (0.0..=1.0), on straight alpha.
///
/// Kept in f32 rather than fixed-point integers deliberately: integer rounding would shift
/// results by ±1 against every image the studio has already delivered.
#[inline]
fn blend_channels(base: &mut [u8], overlay: &[u8], alpha: f32) {
    let inv_alpha = 1.0 - alpha;

    for channel in 0..3 {
        base[channel] = ((base[channel] as f32 * inv_alpha) + (overlay[channel] as f32 * alpha)) as u8;
    }
}

/// Source-over composite of `overlay` onto `base` at `alpha` (0.0..=1.0), on straight alpha.
///
/// Leaves the base alpha channel untouched: the base is an opaque photo and the output is
/// flattened to RGB anyway.
#[inline]
pub fn blend_pixel(base: &mut Rgba<u8>, overlay: Rgba<u8>, alpha: f32) {
    blend_channels(&mut base.0, &overlay.0, alpha);
}

/// Composites `overlay` onto `base` with its top-left corner at (`x_offset`, `y_offset`),
/// scaling every overlay pixel's alpha by `opacity` (0.0..=1.0).
///
/// Pixels that fall outside `base` are skipped.
///
/// Walks the intersection of the two rectangles as row slices. The straightforward version
/// tested every one of ~21 million pixels for containment and reached each through
/// `get_pixel`/`get_pixel_mut`, paying a bounds check per access — roughly 64 million of
/// them for a single 24 MP frame, inside a loop whose range already guaranteed the answer.
pub fn blend_over(base: &mut RgbaImage, overlay: &RgbaImage, x_offset: i32, y_offset: i32, opacity: f32) {
    if opacity <= 0.0 {
        return;
    }

    let base_width = base.width() as i32;
    let base_height = base.height() as i32;

    // The overlay rows and columns that actually land on the base.
    let start_x = (-x_offset).max(0);
    let start_y = (-y_offset).max(0);
    let end_x = (overlay.width() as i32).min(base_width - x_offset);
    let end_y = (overlay.height() as i32).min(base_height - y_offset);

    if start_x >= end_x || start_y >= end_y {
        return;
    }

    let base_stride = base.width() as usize * 4;
    let overlay_stride = overlay.width() as usize * 4;
    let row_bytes = (end_x - start_x) as usize * 4;

    let overlay_buffer = overlay.as_raw();
    let base_buffer: &mut [u8] = base;

    for overlay_y in start_y..end_y {
        let base_row_start = (overlay_y + y_offset) as usize * base_stride + (start_x + x_offset) as usize * 4;
        let overlay_row_start = overlay_y as usize * overlay_stride + start_x as usize * 4;

        let base_row = &mut base_buffer[base_row_start..base_row_start + row_bytes];
        let overlay_row = &overlay_buffer[overlay_row_start..overlay_row_start + row_bytes];

        for (base_pixel, overlay_pixel) in base_row.chunks_exact_mut(4).zip(overlay_row.chunks_exact(4)) {
            // A logo is mostly empty space, so this skips the majority of the area. It is
            // also exact: blending at alpha 0 already leaves the base byte for byte.
            if overlay_pixel[3] == 0 {
                continue;
            }

            let alpha = (overlay_pixel[3] as f32 / 255.0) * opacity;

            blend_channels(base_pixel, overlay_pixel, alpha);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid(width: u32, height: u32, color: Rgba<u8>) -> RgbaImage {
        RgbaImage::from_pixel(width, height, color)
    }

    const BLACK: Rgba<u8> = Rgba([0, 0, 0, 255]);
    const WHITE: Rgba<u8> = Rgba([255, 255, 255, 255]);

    #[test]
    fn full_opacity_replaces_the_base() {
        let mut base = solid(2, 2, BLACK);

        blend_over(&mut base, &solid(2, 2, WHITE), 0, 0, 1.0);

        assert_eq!(*base.get_pixel(0, 0), WHITE);
    }

    #[test]
    fn zero_opacity_leaves_the_base_untouched() {
        let mut base = solid(2, 2, BLACK);

        blend_over(&mut base, &solid(2, 2, WHITE), 0, 0, 0.0);

        assert_eq!(*base.get_pixel(0, 0), BLACK);
    }

    #[test]
    fn a_transparent_overlay_leaves_the_base_untouched() {
        let mut base = solid(2, 2, BLACK);

        blend_over(&mut base, &solid(2, 2, Rgba([255, 255, 255, 0])), 0, 0, 1.0);

        assert_eq!(*base.get_pixel(0, 0), BLACK);
    }

    #[test]
    fn half_opacity_lands_midway() {
        let mut base = solid(1, 1, BLACK);

        blend_over(&mut base, &solid(1, 1, WHITE), 0, 0, 0.5);

        // 0 * 0.5 + 255 * 0.5 = 127.5, truncated to 127 by the `as u8` cast.
        assert_eq!(base.get_pixel(0, 0)[0], 127);
    }

    #[test]
    fn the_base_alpha_channel_is_preserved() {
        let mut base = solid(1, 1, Rgba([0, 0, 0, 200]));

        blend_over(&mut base, &solid(1, 1, WHITE), 0, 0, 1.0);

        assert_eq!(base.get_pixel(0, 0)[3], 200);
    }

    /// A negative offset must clip, not wrap around or panic.
    #[test]
    fn out_of_bounds_pixels_are_skipped() {
        let mut base = solid(2, 2, BLACK);

        blend_over(&mut base, &solid(2, 2, WHITE), -1, -1, 1.0);

        // Only the overlay's bottom-right pixel lands on the base's top-left.
        assert_eq!(*base.get_pixel(0, 0), WHITE);
        assert_eq!(*base.get_pixel(1, 1), BLACK);
    }

    #[test]
    fn an_overlay_entirely_outside_the_base_is_a_no_op() {
        let mut base = solid(2, 2, BLACK);

        blend_over(&mut base, &solid(2, 2, WHITE), 50, 50, 1.0);

        assert_eq!(*base.get_pixel(0, 0), BLACK);
    }

    /// The obvious, slow version: test every pixel for containment and reach it through
    /// `get_pixel`. Kept only as the oracle for the equivalence test below.
    fn blend_over_naive(base: &mut RgbaImage, overlay: &RgbaImage, x_offset: i32, y_offset: i32, opacity: f32) {
        let base_width = base.width() as i32;
        let base_height = base.height() as i32;

        for overlay_y in 0..overlay.height() as i32 {
            for overlay_x in 0..overlay.width() as i32 {
                let base_x = overlay_x + x_offset;
                let base_y = overlay_y + y_offset;

                if base_x >= 0 && base_x < base_width && base_y >= 0 && base_y < base_height {
                    let overlay_pixel = *overlay.get_pixel(overlay_x as u32, overlay_y as u32);
                    let alpha = (overlay_pixel[3] as f32 / 255.0) * opacity;

                    blend_pixel(base.get_pixel_mut(base_x as u32, base_y as u32), overlay_pixel, alpha);
                }
            }
        }
    }

    /// A gradient in every channel, including alpha, so no channel can be confused with
    /// another and both the transparent and opaque paths are exercised.
    fn gradient(width: u32, height: u32, seed: u8) -> RgbaImage {
        RgbaImage::from_fn(width, height, |x, y| {
            Rgba([
                (x * 7 + seed as u32) as u8,
                (y * 13 + seed as u32) as u8,
                (x * y + seed as u32) as u8,
                ((x * 11 + y * 5) % 256) as u8,
            ])
        })
    }

    /// The rewrite exists for speed, so it must not change a single byte of output. Covers
    /// clipping on every edge, partial overlap, and full containment.
    #[test]
    fn the_row_slice_version_matches_the_naive_one_exactly() {
        let offsets = [
            (0, 0),
            (5, 5),
            (-3, -7),
            (-30, 0),
            (0, -30),
            (25, 12),
            (-9, 21),
            (100, 100),
            (-100, -100),
        ];

        for opacity in [0.25_f32, 0.5, 1.0] {
            for (x_offset, y_offset) in offsets {
                let overlay = gradient(17, 13, 3);

                let mut fast = gradient(32, 24, 200);
                let mut naive = fast.clone();

                blend_over(&mut fast, &overlay, x_offset, y_offset, opacity);
                blend_over_naive(&mut naive, &overlay, x_offset, y_offset, opacity);

                assert_eq!(
                    fast.as_raw(),
                    naive.as_raw(),
                    "offset {:?} at opacity {} diverged",
                    (x_offset, y_offset),
                    opacity
                );
            }
        }
    }

    /// Zero opacity returns early now rather than looping. Same result, so prove it.
    #[test]
    fn the_zero_opacity_shortcut_matches_the_naive_one() {
        let overlay = gradient(17, 13, 3);

        let mut fast = gradient(32, 24, 200);
        let mut naive = fast.clone();

        blend_over(&mut fast, &overlay, 4, 4, 0.0);
        blend_over_naive(&mut naive, &overlay, 4, 4, 0.0);

        assert_eq!(fast.as_raw(), naive.as_raw());
    }
}
