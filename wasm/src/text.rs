//! Glyph rasterization on top of `ab_glyph`.
//!
//! This replaces `imageproc::drawing::draw_text_mut`, which was the crate's only use of
//! `imageproc` — a dependency that pulled `image` in with default features and so dragged a
//! full AV1 encoder, OpenEXR, TIFF, GIF, QOI, `nalgebra`, `rand` and `rayon` into the wasm
//! binary. Dropping it also fixes two bugs that were inherent to that function:
//!
//!   * `imageproc` weighted the composite by glyph coverage alone and interpolated the
//!     colour's alpha as just another channel, so the intended 50 % transparent text was
//!     drawn fully opaque. [`draw_text`] multiplies coverage by the colour alpha.
//!   * Centring used `str::len()`, i.e. **bytes**, overestimating Cyrillic filenames by
//!     roughly 2x. [`measure_text`] sums real per-glyph advances plus kerning.

use ab_glyph::{Font, FontRef, GlyphId, PxScale, ScaleFont, point};
use image::{Rgba, RgbaImage};

use crate::blend::blend_pixel;

/// Advance width of `text` in pixels at `scale`, including kerning pairs.
///
/// Iterates over `chars`, so a multi-byte character counts once — unlike `str::len()`.
pub fn measure_text(font: &FontRef<'_>, scale: PxScale, text: &str) -> f32 {
    let scaled = font.as_scaled(scale);

    let mut width = 0.0;
    let mut previous: Option<GlyphId> = None;

    for character in text.chars() {
        let id = scaled.glyph_id(character);

        if let Some(previous_id) = previous {
            width += scaled.kern(previous_id, id);
        }

        width += scaled.h_advance(id);
        previous = Some(id);
    }

    width
}

/// Draws `text` with its top-left at (`x`, `y`), compositing each glyph pixel with
/// `coverage * color_alpha`.
///
/// `y` is the top of the em box, not the baseline: the baseline is placed at `y + ascent`,
/// matching what `imageproc::draw_text_mut` did, so vertical placement is unchanged.
pub fn draw_text(
    canvas: &mut RgbaImage,
    font: &FontRef<'_>,
    scale: PxScale,
    color: Rgba<u8>,
    x: i32,
    y: i32,
    text: &str,
) {
    let color_alpha = color[3] as f32 / 255.0;

    if color_alpha <= 0.0 {
        return;
    }

    let scaled = font.as_scaled(scale);
    let canvas_width = canvas.width() as i32;
    let canvas_height = canvas.height() as i32;

    let baseline = y as f32 + scaled.ascent();
    let mut caret = x as f32;
    let mut previous: Option<GlyphId> = None;

    for character in text.chars() {
        let id = scaled.glyph_id(character);

        if let Some(previous_id) = previous {
            caret += scaled.kern(previous_id, id);
        }

        // Whitespace and unmapped characters have no outline; they still advance the caret.
        if let Some(outlined) = font.outline_glyph(id.with_scale_and_position(scale, point(caret, baseline))) {
            let bounds = outlined.px_bounds();
            let origin_x = bounds.min.x as i32;
            let origin_y = bounds.min.y as i32;

            outlined.draw(|glyph_x, glyph_y, coverage| {
                let px = origin_x + glyph_x as i32;
                let py = origin_y + glyph_y as i32;

                if px < 0 || py < 0 || px >= canvas_width || py >= canvas_height {
                    return;
                }

                // Clamp: the rasterizer can return coverage a hair above 1.0, which would
                // make inv_alpha negative and push the composite past the requested colour.
                let alpha = coverage.clamp(0.0, 1.0) * color_alpha;

                if alpha <= 0.0 {
                    return;
                }

                blend_pixel(canvas.get_pixel_mut(px as u32, py as u32), color, alpha);
            });
        }

        caret += scaled.h_advance(id);
        previous = Some(id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FONT_DATA: &[u8] = include_bytes!("./Ubuntu-M-subset.ttf");

    fn font() -> FontRef<'static> {
        FontRef::try_from_slice(FONT_DATA).expect("embedded font must parse")
    }

    #[test]
    fn the_embedded_font_parses() {
        let _ = font();
    }

    /// Guards the subset ranges. A character that survived subsetting has an outline; one
    /// that did not silently becomes `.notdef`, and the only visible symptom is a box in the
    /// corner of a delivered photo.
    #[test]
    fn the_subset_covers_every_alphabet_a_filename_might_use() {
        let font = font();
        let samples = [
            ("ASCII", "ABCXYZabcxyz0123456789 _-.()"),
            ("Bulgarian", "Сватба_Иван_и_Мария"),
            ("Russian ё", "Ёлка_Приём"),
            ("Latin-1", "Müller_Ångström_Señor"),
            ("Latin Extended-A", "Dvořák_Łódź_Ștefan"),
            ("punctuation", "–—‘’“”€"),
        ];

        for (label, sample) in samples {
            for character in sample.chars() {
                assert_ne!(
                    font.glyph_id(character),
                    GlyphId(0),
                    "{label}: U+{:04X} ({character:?}) is missing from the subset",
                    character as u32
                );
            }
        }
    }

    /// `pyftsubset` drops the legacy `kern` table by default, preferring GPOS — which
    /// `ab_glyph` never reads. That would have turned kerning into a silent no-op, so the
    /// subset is generated with `--legacy-kern` and this is what proves it took effect.
    #[test]
    fn kerning_survived_the_subset() {
        let font = font();
        let scale = PxScale::from(32.0);
        let scaled = font.as_scaled(scale);

        // "AV" is the textbook negative-kern pair.
        let kerned = scaled.kern(scaled.glyph_id('A'), scaled.glyph_id('V'));

        assert!(kerned < 0.0, "expected A/V to kern tighter, got {kerned}");
    }

    #[test]
    fn measure_text_is_zero_for_an_empty_string() {
        assert_eq!(measure_text(&font(), PxScale::from(32.0), ""), 0.0);
    }

    #[test]
    fn measure_text_grows_with_the_scale() {
        let font = font();
        let small = measure_text(&font, PxScale::from(16.0), "IMG_1234");
        let large = measure_text(&font, PxScale::from(32.0), "IMG_1234");

        assert!(large > small * 1.9, "16px {small}, 32px {large}");
    }

    /// The regression this replacement exists for: the old estimate was
    /// `filename.len() as f32 * font_size * 0.5`, i.e. bytes. In UTF-8 Cyrillic is two
    /// bytes per character, so an 11-character name was measured as if it were 21.
    #[test]
    fn cyrillic_is_measured_by_characters_not_bytes() {
        let name = "Сватба_Иван";
        let scale = PxScale::from(32.0);

        assert_eq!(name.chars().count(), 11);
        assert_eq!(name.len(), 21, "21 bytes is what the old code used");

        let actual = measure_text(&font(), scale, name);
        let old_byte_estimate = name.len() as f32 * 32.0 * 0.5;

        assert!(
            actual < old_byte_estimate * 0.75,
            "byte estimate {old_byte_estimate} should be far above the real {actual}"
        );
    }

    #[test]
    fn drawing_leaves_ink_on_the_canvas() {
        let mut canvas = RgbaImage::from_pixel(400, 80, Rgba([255u8, 255, 255, 255]));

        draw_text(
            &mut canvas,
            &font(),
            PxScale::from(32.0),
            Rgba([0, 0, 0, 255]),
            10,
            10,
            "IMG_1234",
        );

        let darkened = canvas.pixels().filter(|p| p[0] < 250).count();

        assert!(darkened > 100, "expected glyph coverage, got {darkened} touched pixels");
    }

    /// The bug `imageproc` had: text requested at 50 % came out fully opaque.
    #[test]
    fn the_colour_alpha_is_applied() {
        let scale = PxScale::from(32.0);
        let font = font();

        let mut opaque = RgbaImage::from_pixel(400, 80, Rgba([255u8, 255, 255, 255]));
        let mut half = RgbaImage::from_pixel(400, 80, Rgba([255u8, 255, 255, 255]));

        draw_text(
            &mut opaque,
            &font,
            scale,
            Rgba([125, 125, 125, 255]),
            10,
            10,
            "IMG_1234",
        );
        draw_text(&mut half, &font, scale, Rgba([125, 125, 125, 128]), 10, 10, "IMG_1234");

        let darkest_opaque = opaque.pixels().map(|p| p[0]).min().unwrap();
        let darkest_half = half.pixels().map(|p| p[0]).min().unwrap();

        assert_eq!(darkest_opaque, 125, "full alpha must reach the requested colour");
        assert!(darkest_half > 125, "half alpha must stay lighter, got {darkest_half}");
    }

    #[test]
    fn a_fully_transparent_colour_draws_nothing() {
        let mut canvas = RgbaImage::from_pixel(400, 80, Rgba([255u8, 255, 255, 255]));

        draw_text(
            &mut canvas,
            &font(),
            PxScale::from(32.0),
            Rgba([0, 0, 0, 0]),
            10,
            10,
            "IMG_1234",
        );

        assert!(canvas.pixels().all(|p| *p == Rgba([255, 255, 255, 255])));
    }

    /// Text wider than the canvas, and a negative origin, must clip rather than panic.
    #[test]
    fn drawing_outside_the_canvas_is_clipped() {
        let mut canvas = RgbaImage::from_pixel(40, 40, Rgba([255u8, 255, 255, 255]));

        draw_text(
            &mut canvas,
            &font(),
            PxScale::from(32.0),
            Rgba([0, 0, 0, 255]),
            -30,
            -20,
            "IMG_1234_LONG_NAME",
        );
        draw_text(
            &mut canvas,
            &font(),
            PxScale::from(32.0),
            Rgba([0, 0, 0, 255]),
            35,
            35,
            "IMG",
        );
    }
}
