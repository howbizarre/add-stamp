//! Pure geometry for placing the stamp. Kept free of `image` buffers so it can be tested
//! on the native target without constructing pixel data.

/// Uniform scale factor that fits a `stamp_w` x `stamp_h` stamp inside a
/// `img_w` x `img_h` image leaving `padding` on every side — "contain" semantics.
///
/// Deliberately allows upscaling above 1.0: the product stamps a small logo across the
/// whole frame, and that is intended behaviour, not an accident.
///
/// Returns 0.0 for a degenerate stamp so callers never divide by zero.
pub fn contain_scale(img_w: u32, img_h: u32, stamp_w: u32, stamp_h: u32, padding: u32) -> f32 {
    if stamp_w == 0 || stamp_h == 0 {
        return 0.0;
    }

    // Saturating throughout: `padding` is a caller-supplied option, so the doubling can
    // overflow on its own, and a photo narrower than twice it must not wrap around either.
    let both_sides = padding.saturating_mul(2);
    let available_w = img_w.saturating_sub(both_sides);
    let available_h = img_h.saturating_sub(both_sides);

    let scale_w = available_w as f32 / stamp_w as f32;
    let scale_h = available_h as f32 / stamp_h as f32;

    scale_w.min(scale_h)
}

/// Applies `scale` to a stamp size, clamped to at least 1x1.
///
/// The clamp matters: on an image smaller than the padding, `contain_scale` returns 0.0 and
/// the unclamped result would be 0x0, which makes `imageops::resize` panic.
pub fn scaled_size(stamp_w: u32, stamp_h: u32, scale: f32) -> (u32, u32) {
    let w = (stamp_w as f32 * scale) as u32;
    let h = (stamp_h as f32 * scale) as u32;

    (w.max(1), h.max(1))
}

/// Top-left offset that centres a `w` x `h` overlay on a `img_w` x `img_h` image.
///
/// Signed arithmetic throughout: an overlay larger than the image yields a negative offset
/// rather than the wrap-around that unsigned subtraction would produce.
pub fn centered_offsets(img_w: u32, img_h: u32, w: u32, h: u32) -> (i32, i32) {
    let x = (img_w as i32 - w as i32) / 2;
    let y = (img_h as i32 - h as i32) / 2;

    (x, y)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The real production case: stamp1.png (500x373) on a 24 MP frame. Height is the
    /// binding constraint, so the scale must come from it.
    #[test]
    fn contain_scale_is_limited_by_the_tighter_axis() {
        let scale = contain_scale(6000, 4000, 500, 373, 10);

        // 3980 / 373 = 10.67 is smaller than 5980 / 500 = 11.96
        assert!((scale - 3980.0 / 373.0).abs() < 1e-4, "got {scale}");

        let (w, h) = scaled_size(500, 373, scale);
        assert_eq!((w, h), (5335, 3980));
    }

    #[test]
    fn contain_scale_handles_a_degenerate_stamp() {
        assert_eq!(contain_scale(6000, 4000, 0, 373, 10), 0.0);
        assert_eq!(contain_scale(6000, 4000, 500, 0, 10), 0.0);
    }

    /// An image narrower than twice the padding must not wrap u32 around.
    #[test]
    fn contain_scale_saturates_on_tiny_images() {
        let scale = contain_scale(8, 8, 500, 373, 10);

        assert_eq!(scale, 0.0, "available space is zero, not enormous");
    }

    /// `padding` is a caller-settable option, so doubling it must not overflow u32 — that
    /// would wrap an enormous padding into a small one and stamp the photo anyway.
    #[test]
    fn contain_scale_saturates_on_absurd_padding() {
        assert_eq!(contain_scale(6000, 4000, 500, 373, u32::MAX), 0.0);
        assert_eq!(contain_scale(6000, 4000, 500, 373, u32::MAX / 2 + 1), 0.0);
    }

    /// Guards the `imageops::resize(.., 0, 0, ..)` edge case.
    #[test]
    fn scaled_size_never_returns_zero() {
        assert_eq!(scaled_size(500, 373, 0.0), (1, 1));
        assert_eq!(scaled_size(500, 373, 0.0001), (1, 1));
    }

    #[test]
    fn centered_offsets_centre_the_overlay() {
        assert_eq!(centered_offsets(6000, 4000, 5335, 3980), (332, 10));
    }

    #[test]
    fn centered_offsets_go_negative_when_the_overlay_is_larger() {
        let (x, y) = centered_offsets(100, 100, 200, 300);

        assert_eq!((x, y), (-50, -100));
    }
}
