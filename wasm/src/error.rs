//! The crate's error type.
//!
//! Internals return `StampError`, not `JsValue`. Two reasons: `JsValue` panics the moment it
//! is constructed off the wasm target, which made the whole pipeline untestable natively;
//! and it crosses into JavaScript as a bare string, so the JS layer had to wrap it in
//! `new Error(...)` by hand and lost the stack trace doing so.
//!
//! The wasm-bindgen boundary converts to `JsError`, which arrives in JavaScript as a real
//! `Error` object.

use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub enum StampError {
    /// `applyStamp` was called before `setStamp`.
    StampNotSet,

    /// The image is past the caller's configured megapixel budget.
    ///
    /// Carries the limit as well as the size, because the limit is a
    /// [`crate::StampOptions`] field rather than a compile-time constant — a message naming
    /// only the size would leave the reader guessing what it was measured against.
    TooLarge {
        width: u32,
        height: u32,
        limit_megapixels: f32,
    },

    /// The bytes are not a readable image, or the header could not be parsed.
    Decode(String),

    /// The encoder rejected the finished image.
    Encode(String),
}

impl fmt::Display for StampError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StampError::StampNotSet => write!(f, "Stamp not set"),

            StampError::TooLarge {
                width,
                height,
                limit_megapixels,
            } => write!(
                f,
                "Image is too large: {}x{} is {} MP, the limit is {} MP",
                width,
                height,
                u64::from(*width) * u64::from(*height) / 1_000_000,
                limit_megapixels
            ),

            StampError::Decode(detail) => write!(f, "Failed to load image: {}", detail),
            StampError::Encode(detail) => write!(f, "Failed to encode image: {}", detail),
        }
    }
}

// wasm-bindgen blanket-converts any `std::error::Error` into `JsError`, so implementing
// this is all that is needed for `?` to work at the boundary.
impl std::error::Error for StampError {}

#[cfg(test)]
mod tests {
    use super::*;

    /// The message is what a user sees when a file is refused, so it has to name the file's
    /// size and the limit rather than just saying "too large".
    #[test]
    fn the_too_large_message_states_both_sizes() {
        let error = StampError::TooLarge {
            width: 30_000,
            height: 30_000,
            limit_megapixels: 120.0,
        };

        assert_eq!(
            error.to_string(),
            "Image is too large: 30000x30000 is 900 MP, the limit is 120 MP"
        );
    }

    /// The limit is caller-supplied, so the message has to reflect whatever was configured
    /// rather than a baked-in number.
    #[test]
    fn the_too_large_message_reports_the_configured_limit() {
        let error = StampError::TooLarge {
            width: 10_000,
            height: 10_000,
            limit_megapixels: 40.0,
        };

        assert_eq!(
            error.to_string(),
            "Image is too large: 10000x10000 is 100 MP, the limit is 40 MP"
        );
    }

    #[test]
    fn decode_and_encode_carry_the_underlying_detail() {
        assert_eq!(
            StampError::Decode("unexpected EOF".into()).to_string(),
            "Failed to load image: unexpected EOF"
        );
        assert_eq!(
            StampError::Encode("bad quality".into()).to_string(),
            "Failed to encode image: bad quality"
        );
    }
}
