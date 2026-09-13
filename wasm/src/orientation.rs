//! EXIF orientation.
//!
//! Most cameras and phones store a portrait shot as a landscape pixel array plus an
//! `Orientation` tag saying how to turn it. `image::load_from_memory` does not apply that
//! tag and `to_rgba8` throws it away, so before this module a portrait frame was stamped in
//! sensor orientation and written out with no EXIF left to correct it — the photo came out
//! sideways with a sideways watermark.
//!
//! Named `orientation` rather than `exif` so paths here cannot be confused with the
//! `exif` crate this module wraps.

use image::{RgbaImage, imageops};

/// The eight transforms an EXIF `Orientation` tag can express.
///
/// Values 5 and 7 are reflections across a diagonal. Real cameras essentially never emit
/// them, but they are cheap to support and a silent no-op would be worse than a rare
/// extra allocation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Orientation {
    /// 1 — already upright.
    Normal,
    /// 2 — mirrored left-to-right.
    FlipHorizontal,
    /// 3 — upside down.
    Rotate180,
    /// 4 — mirrored top-to-bottom.
    FlipVertical,
    /// 5 — mirrored, then rotated 270° clockwise. Reflection across the main diagonal.
    Transpose,
    /// 6 — rotated 90° clockwise.
    Rotate90,
    /// 7 — mirrored, then rotated 90° clockwise. Reflection across the anti-diagonal.
    Transverse,
    /// 8 — rotated 270° clockwise.
    Rotate270,
}

impl Orientation {
    /// Maps a raw tag value to a transform.
    ///
    /// Anything outside 1-8 means the tag is corrupt. Treat that as upright: a wrong guess
    /// here rotates a correct photo, which is worse than leaving a rare broken file alone.
    pub fn from_tag(value: u32) -> Orientation {
        match value {
            2 => Orientation::FlipHorizontal,
            3 => Orientation::Rotate180,
            4 => Orientation::FlipVertical,
            5 => Orientation::Transpose,
            6 => Orientation::Rotate90,
            7 => Orientation::Transverse,
            8 => Orientation::Rotate270,
            _ => Orientation::Normal,
        }
    }

    /// True when the transform exchanges width and height.
    pub fn swaps_axes(self) -> bool {
        matches!(
            self,
            Orientation::Transpose | Orientation::Rotate90 | Orientation::Transverse | Orientation::Rotate270
        )
    }

    /// Applies the transform, consuming the source buffer.
    ///
    /// `Normal` hands the buffer straight back, so the common case allocates nothing — worth
    /// having when the buffer is 96 MB for a 24 MP frame.
    pub fn apply(self, img: RgbaImage) -> RgbaImage {
        match self {
            Orientation::Normal => img,
            Orientation::FlipHorizontal => imageops::flip_horizontal(&img),
            Orientation::Rotate180 => imageops::rotate180(&img),
            Orientation::FlipVertical => imageops::flip_vertical(&img),
            // The two diagonal cases need an intermediate buffer. Acceptable: no mainstream
            // camera writes 5 or 7.
            Orientation::Transpose => imageops::rotate270(&imageops::flip_horizontal(&img)),
            Orientation::Rotate90 => imageops::rotate90(&img),
            Orientation::Transverse => imageops::rotate90(&imageops::flip_horizontal(&img)),
            Orientation::Rotate270 => imageops::rotate270(&img),
        }
    }
}

/// Reads the `Orientation` tag out of an encoded image.
///
/// Every failure — no EXIF block, unreadable EXIF, absent tag, non-numeric value — yields
/// `Normal`. A photo without orientation metadata is not an error.
pub fn read_orientation(image_bytes: &[u8]) -> Orientation {
    let mut cursor = std::io::Cursor::new(image_bytes);

    let Ok(reader) = exif::Reader::new().read_from_container(&mut cursor) else {
        return Orientation::Normal;
    };

    let Some(field) = reader.get_field(exif::Tag::Orientation, exif::In::PRIMARY) else {
        return Orientation::Normal;
    };

    field
        .value
        .get_uint(0)
        .map(Orientation::from_tag)
        .unwrap_or(Orientation::Normal)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    const A: Rgba<u8> = Rgba([10, 0, 0, 255]);
    const B: Rgba<u8> = Rgba([20, 0, 0, 255]);
    const C: Rgba<u8> = Rgba([30, 0, 0, 255]);
    const D: Rgba<u8> = Rgba([40, 0, 0, 255]);

    /// A B
    /// C D
    fn sample() -> RgbaImage {
        let mut img = RgbaImage::new(2, 2);

        img.put_pixel(0, 0, A);
        img.put_pixel(1, 0, B);
        img.put_pixel(0, 1, C);
        img.put_pixel(1, 1, D);

        img
    }

    fn quadrants(img: &RgbaImage) -> [Rgba<u8>; 4] {
        [
            *img.get_pixel(0, 0),
            *img.get_pixel(1, 0),
            *img.get_pixel(0, 1),
            *img.get_pixel(1, 1),
        ]
    }

    #[test]
    fn every_tag_value_maps_to_its_transform() {
        assert_eq!(Orientation::from_tag(1), Orientation::Normal);
        assert_eq!(Orientation::from_tag(2), Orientation::FlipHorizontal);
        assert_eq!(Orientation::from_tag(3), Orientation::Rotate180);
        assert_eq!(Orientation::from_tag(4), Orientation::FlipVertical);
        assert_eq!(Orientation::from_tag(5), Orientation::Transpose);
        assert_eq!(Orientation::from_tag(6), Orientation::Rotate90);
        assert_eq!(Orientation::from_tag(7), Orientation::Transverse);
        assert_eq!(Orientation::from_tag(8), Orientation::Rotate270);
    }

    /// 0 is the "unset" value writers use, and 9+ is corrupt. Neither should rotate a photo
    /// that is already upright.
    #[test]
    fn out_of_range_tags_fall_back_to_upright() {
        assert_eq!(Orientation::from_tag(0), Orientation::Normal);
        assert_eq!(Orientation::from_tag(9), Orientation::Normal);
        assert_eq!(Orientation::from_tag(u32::MAX), Orientation::Normal);
    }

    #[test]
    fn normal_is_the_identity() {
        assert_eq!(quadrants(&Orientation::Normal.apply(sample())), [A, B, C, D]);
    }

    #[test]
    fn flip_horizontal_mirrors_left_to_right() {
        assert_eq!(quadrants(&Orientation::FlipHorizontal.apply(sample())), [B, A, D, C]);
    }

    #[test]
    fn rotate_180_turns_the_image_upside_down() {
        assert_eq!(quadrants(&Orientation::Rotate180.apply(sample())), [D, C, B, A]);
    }

    #[test]
    fn flip_vertical_mirrors_top_to_bottom() {
        assert_eq!(quadrants(&Orientation::FlipVertical.apply(sample())), [C, D, A, B]);
    }

    /// Rotating clockwise moves the top-left pixel to the top-right.
    #[test]
    fn rotate_90_turns_clockwise() {
        assert_eq!(quadrants(&Orientation::Rotate90.apply(sample())), [C, A, D, B]);
    }

    #[test]
    fn rotate_270_turns_counter_clockwise() {
        assert_eq!(quadrants(&Orientation::Rotate270.apply(sample())), [B, D, A, C]);
    }

    /// Tag 5 is a reflection across the main diagonal, so result[y][x] == source[x][y] and
    /// the two corners on that diagonal stay put.
    #[test]
    fn transpose_reflects_across_the_main_diagonal() {
        assert_eq!(quadrants(&Orientation::Transpose.apply(sample())), [A, C, B, D]);
    }

    /// Tag 7 is the anti-diagonal reflection; B and C are the ones that stay put.
    #[test]
    fn transverse_reflects_across_the_anti_diagonal() {
        assert_eq!(quadrants(&Orientation::Transverse.apply(sample())), [D, B, C, A]);
    }

    /// The stamp is centred using the post-transform dimensions, so a wrong answer here
    /// would place the watermark off-centre on every rotated photo.
    #[test]
    fn only_the_quarter_turns_swap_the_axes() {
        assert!(!Orientation::Normal.swaps_axes());
        assert!(!Orientation::FlipHorizontal.swaps_axes());
        assert!(!Orientation::Rotate180.swaps_axes());
        assert!(!Orientation::FlipVertical.swaps_axes());

        assert!(Orientation::Transpose.swaps_axes());
        assert!(Orientation::Rotate90.swaps_axes());
        assert!(Orientation::Transverse.swaps_axes());
        assert!(Orientation::Rotate270.swaps_axes());
    }

    #[test]
    fn a_quarter_turn_swaps_the_dimensions() {
        let tall = RgbaImage::new(4, 2);
        let rotated = Orientation::Rotate90.apply(tall);

        assert_eq!(rotated.dimensions(), (2, 4));
    }

    /// Builds the smallest JPEG that carries an Orientation tag: SOI, an APP1 segment
    /// holding a one-entry TIFF IFD, then EOI. Enough to drive the real parser.
    fn jpeg_with_orientation(value: u16) -> Vec<u8> {
        let mut tiff = Vec::new();

        tiff.extend_from_slice(b"MM\x00\x2a"); // big-endian TIFF magic
        tiff.extend_from_slice(&8u32.to_be_bytes()); // offset of IFD0
        tiff.extend_from_slice(&1u16.to_be_bytes()); // one entry

        tiff.extend_from_slice(&0x0112u16.to_be_bytes()); // Orientation
        tiff.extend_from_slice(&3u16.to_be_bytes()); // type SHORT
        tiff.extend_from_slice(&1u32.to_be_bytes()); // one value
        tiff.extend_from_slice(&value.to_be_bytes()); // value, left-aligned in 4 bytes
        tiff.extend_from_slice(&[0, 0]);

        tiff.extend_from_slice(&0u32.to_be_bytes()); // no IFD1

        let mut app1 = Vec::from(b"Exif\x00\x00".as_slice());
        app1.extend_from_slice(&tiff);

        let mut jpeg = vec![0xFF, 0xD8]; // SOI
        jpeg.extend_from_slice(&[0xFF, 0xE1]); // APP1
        jpeg.extend_from_slice(&((app1.len() + 2) as u16).to_be_bytes());
        jpeg.extend_from_slice(&app1);
        jpeg.extend_from_slice(&[0xFF, 0xD9]); // EOI

        jpeg
    }

    #[test]
    fn the_tag_is_read_out_of_a_real_container() {
        assert_eq!(read_orientation(&jpeg_with_orientation(6)), Orientation::Rotate90);
        assert_eq!(read_orientation(&jpeg_with_orientation(3)), Orientation::Rotate180);
        assert_eq!(read_orientation(&jpeg_with_orientation(1)), Orientation::Normal);
    }

    #[test]
    fn an_image_without_exif_is_treated_as_upright() {
        assert_eq!(read_orientation(&[]), Orientation::Normal);
        assert_eq!(read_orientation(b"not an image at all"), Orientation::Normal);
        // Valid JPEG markers, no APP1 segment.
        assert_eq!(read_orientation(&[0xFF, 0xD8, 0xFF, 0xD9]), Orientation::Normal);
    }
}
