//! Downscaling a photo to an output size.
//!
//! Lanczos3 through `fast_image_resize`, which has WebAssembly SIMD128 kernels. Measured in
//! the real wasm artifact on a 24 MP frame, a 1920 px output took about 440 ms with
//! `image::imageops::resize`; see `docs/PERFORMANCE.md` for the comparison that chose it.
//!
//! A cheaper route was tried first: average whole `factor` x `factor` blocks, then let
//! Lanczos3 finish (libvips' split). It is fast, but whenever the factor does not divide the
//! frame the last block is partial and the output drifts by up to half a pixel towards the
//! far edge, and `image`'s resize cannot be told the fractional extent to correct it.

use crate::error::StampError;
use fast_image_resize::images::{Image, ImageRef};
use fast_image_resize::{FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer};
use image::RgbaImage;

/// The size that fits `max_size` on the longer side, keeping the aspect ratio.
///
/// Never upscales: a frame already within `max_size` keeps its size, and so does every frame
/// when `max_size` is 0. The shorter side is rounded to the nearest pixel and is at least 1.
pub fn fit_within(width: u32, height: u32, max_size: u32) -> (u32, u32) {
    let longer = width.max(height);

    if max_size == 0 || max_size >= longer {
        return (width, height);
    }

    // Widened so a 65535 px side times a 65535 px target cannot overflow.
    let scale = |side: u32| {
        let scaled = (u64::from(side) * u64::from(max_size) + u64::from(longer) / 2) / u64::from(longer);

        (scaled as u32).max(1)
    };

    if width >= height {
        (max_size, scale(height))
    } else {
        (scale(width), max_size)
    }
}

/// `source` resized with Lanczos3 to exactly `width` x `height`, both at least 1.
///
/// `has_alpha` asks for the colour to be weighted by alpha while resampling, which keeps the
/// colour of transparent pixels from bleeding into their neighbours. A photograph has no
/// alpha, and skipping the weighting spares two passes over the frame.
pub fn downscale(source: &RgbaImage, width: u32, height: u32, has_alpha: bool) -> Result<RgbaImage, StampError> {
    if source.dimensions() == (width, height) {
        return Ok(source.clone());
    }

    let resize_error = |error: &dyn std::fmt::Display| StampError::Resize(error.to_string());

    let src = ImageRef::new(source.width(), source.height(), source.as_raw(), PixelType::U8x4)
        .map_err(|error| resize_error(&error))?;
    let mut dst = Image::new(width, height, PixelType::U8x4);
    let options = ResizeOptions::new()
        .resize_alg(ResizeAlg::Convolution(FilterType::Lanczos3))
        .use_alpha(has_alpha);

    Resizer::new()
        .resize(&src, &mut dst, &options)
        .map_err(|error| resize_error(&error))?;

    RgbaImage::from_raw(width, height, dst.into_vec())
        .ok_or_else(|| StampError::Resize("the resized buffer does not match its size".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    #[test]
    fn a_landscape_frame_fits_by_its_width() {
        assert_eq!(fit_within(6000, 4000, 960), (960, 640));
    }

    #[test]
    fn a_portrait_frame_fits_by_its_height() {
        assert_eq!(fit_within(4000, 6000, 960), (640, 960));
    }

    #[test]
    fn the_shorter_side_rounds_to_the_nearest_pixel() {
        // 4000 * 400 / 6000 = 266.67
        assert_eq!(fit_within(6000, 4000, 400), (400, 267));
    }

    #[test]
    fn a_frame_is_never_upscaled() {
        assert_eq!(fit_within(800, 600, 960), (800, 600));
        assert_eq!(fit_within(960, 640, 960), (960, 640));
    }

    #[test]
    fn zero_keeps_the_source_size() {
        assert_eq!(fit_within(6000, 4000, 0), (6000, 4000));
    }

    #[test]
    fn a_thin_strip_keeps_at_least_one_pixel() {
        assert_eq!(fit_within(65_535, 1, 100), (100, 1));
    }

    #[test]
    fn the_largest_sizes_do_not_overflow() {
        assert_eq!(fit_within(65_535, 65_535, 65_534), (65_534, 65_534));
    }

    #[test]
    fn downscaling_lands_on_the_exact_size() {
        let img = RgbaImage::from_pixel(600, 400, Rgba([120, 130, 140, 255]));

        for (width, height) in [(96, 64), (40, 27), (300, 200), (599, 399), (1, 1)] {
            let out = downscale(&img, width, height, false).unwrap();

            assert_eq!(out.dimensions(), (width, height));
            // A flat field stays flat.
            assert_eq!(*out.get_pixel(width / 2, height / 2), Rgba([120, 130, 140, 255]));
        }
    }

    /// The reason for leaving the box pass behind: a frame whose size the reduction does not
    /// divide must not drift. A one-pixel line at the far edge stays at the far edge.
    #[test]
    fn the_far_edge_stays_put() {
        let mut img = RgbaImage::from_pixel(6000, 40, Rgba([0, 0, 0, 255]));

        for y in 0..40 {
            for x in 5986..6000 {
                img.put_pixel(x, y, Rgba([255, 255, 255, 255]));
            }
        }

        // 6000 / 400 = 15: the white band is the last pixel of the output.
        let out = downscale(&img, 400, 3, false).unwrap();

        assert!(out.get_pixel(399, 1)[0] > 200, "the band must reach the last pixel");
        assert!(out.get_pixel(397, 1)[0] < 30, "and nothing before it");
    }

    #[test]
    fn downscaling_to_the_same_size_is_a_copy() {
        let img = RgbaImage::from_pixel(30, 20, Rgba([1, 2, 3, 255]));

        assert_eq!(downscale(&img, 30, 20, false).unwrap(), img);
    }

    /// With alpha weighting, the colour of a fully transparent pixel does not tint the
    /// opaque ones next to it.
    #[test]
    fn transparent_colour_does_not_bleed_when_alpha_is_used() {
        let img = RgbaImage::from_fn(40, 4, |x, _| {
            if x % 2 == 0 {
                Rgba([200, 200, 200, 255])
            } else {
                Rgba([255, 0, 0, 0])
            }
        });

        let out = downscale(&img, 10, 1, true).unwrap();
        let pixel = out.get_pixel(5, 0);

        assert!(pixel[0].abs_diff(pixel[1]) < 4, "no red cast: {pixel:?}");
    }
}
