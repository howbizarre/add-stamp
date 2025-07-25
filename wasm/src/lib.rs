use wasm_bindgen::prelude::*;
use image::{ImageBuffer, Rgba, imageops};
use imageproc::drawing::draw_text_mut;
use rusttype::{Font, Scale};

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
    
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub struct ImageStamper {
    stamp_data: Vec<u8>,
    stamp_width: u32,
    stamp_height: u32,
}

#[wasm_bindgen]
impl ImageStamper {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ImageStamper {
        init_panic_hook();
        ImageStamper {
            stamp_data: Vec::new(),
            stamp_width: 0,
            stamp_height: 0,
        }
    }

    #[wasm_bindgen]
    pub fn set_stamp(&mut self, stamp_bytes: &[u8]) -> Result<(), JsValue> {
        console_log!("Setting stamp image, size: {} bytes", stamp_bytes.len());
        
        let img = image::load_from_memory(stamp_bytes)
            .map_err(|e| JsValue::from_str(&format!("Failed to load stamp image: {}", e)))?;
            
        let rgba_img = img.to_rgba8();
        self.stamp_width = rgba_img.width();
        self.stamp_height = rgba_img.height();
        self.stamp_data = rgba_img.into_raw();
        
        console_log!("Stamp set successfully: {}x{}", self.stamp_width, self.stamp_height);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn apply_stamp(&self, image_bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
        self.apply_stamp_with_options(image_bytes, 75.0, "jpg")
    }

    #[wasm_bindgen]
    pub fn apply_stamp_with_quality(&self, image_bytes: &[u8], quality: f32) -> Result<Vec<u8>, JsValue> {
        self.apply_stamp_with_options(image_bytes, quality, "jpg")
    }

    #[wasm_bindgen]
    pub fn apply_stamp_with_options(&self, image_bytes: &[u8], quality: f32, format: &str) -> Result<Vec<u8>, JsValue> {
        self.apply_stamp_with_options_and_text(image_bytes, quality, format, "")
    }

    #[wasm_bindgen]
    pub fn apply_stamp_with_options_and_text(&self, image_bytes: &[u8], quality: f32, format: &str, filename: &str) -> Result<Vec<u8>, JsValue> {
        self.apply_stamp_with_options_text_and_opacity(image_bytes, quality, format, filename, 50.0)
    }

    #[wasm_bindgen]
    pub fn apply_stamp_with_options_text_and_opacity(&self, image_bytes: &[u8], quality: f32, format: &str, filename: &str, opacity: f32) -> Result<Vec<u8>, JsValue> {
        if self.stamp_data.is_empty() {
            return Err(JsValue::from_str("Stamp not set"));
        }

        console_log!("Processing image, size: {} bytes", image_bytes.len());

        // Load the main image
        let img = image::load_from_memory(image_bytes)
            .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;
        
        let mut rgba_img = img.to_rgba8();
        let img_width = rgba_img.width();
        let img_height = rgba_img.height();
        
        console_log!("Image dimensions: {}x{}", img_width, img_height);

        // Create stamp image buffer
        let stamp_img = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(
            self.stamp_width, 
            self.stamp_height, 
            self.stamp_data.clone()
        ).ok_or_else(|| JsValue::from_str("Failed to create stamp image buffer"))?;

        // Calculate scaling to contain the stamp within the image with 10px padding
        let padding = 10u32;
        let available_width = img_width.saturating_sub(padding * 2);
        let available_height = img_height.saturating_sub(padding * 2);
        
        let scale_x = available_width as f32 / self.stamp_width as f32;
        let scale_y = available_height as f32 / self.stamp_height as f32;
        let scale = scale_x.min(scale_y); // Use min to contain within the image

        let new_stamp_width = (self.stamp_width as f32 * scale) as u32;
        let new_stamp_height = (self.stamp_height as f32 * scale) as u32;

        console_log!("Scaling stamp to: {}x{} (scale: {:.2}) with {}px padding", new_stamp_width, new_stamp_height, scale, padding);

        // Resize stamp
        let resized_stamp = imageops::resize(
            &stamp_img,
            new_stamp_width,
            new_stamp_height,
            imageops::FilterType::Lanczos3
        );

        // Calculate position to center the stamp with padding
        let x_offset = ((img_width - new_stamp_width) / 2) as i32;
        let y_offset = ((img_height - new_stamp_height) / 2) as i32;

        console_log!("Stamp position: ({}, {})", x_offset, y_offset);

        // Apply stamp with custom opacity (convert from percentage to decimal)
        let stamp_opacity = opacity / 100.0;
        self.blend_images(&mut rgba_img, &resized_stamp, x_offset, y_offset, stamp_opacity);

        // Add filename text watermark if filename is provided
        if !filename.is_empty() {
            self.add_text_watermark(&mut rgba_img, filename);
        }

        // Convert to the specified format with quality
        let output_data = self.encode_image_with_format(&rgba_img, quality, format)?;

        console_log!("Generated {} image, size: {} bytes (quality: {}%)", format, output_data.len(), quality);
        Ok(output_data)
    }

    fn encode_image_with_format(&self, img: &ImageBuffer<Rgba<u8>, Vec<u8>>, quality: f32, format: &str) -> Result<Vec<u8>, JsValue> {
        use image::{DynamicImage, ImageFormat, codecs::jpeg::JpegEncoder, ImageEncoder};
        use std::io::Cursor;
        
        // Convert to DynamicImage
        let dynamic_img = DynamicImage::ImageRgba8(img.clone());
        
        // Create a buffer to write the image data
        let mut buffer = Vec::new();
        
        match format.to_lowercase().as_str() {
            "jpg" | "jpeg" => {
                // Convert RGBA to RGB for JPEG (JPEG doesn't support transparency)
                let rgb_img = dynamic_img.to_rgb8();
                
                // Use JPEG encoder with quality control
                let mut cursor = Cursor::new(&mut buffer);
                let encoder = JpegEncoder::new_with_quality(&mut cursor, quality as u8);
                
                let (width, height) = rgb_img.dimensions();
                encoder.write_image(rgb_img.as_raw(), width, height, image::ColorType::Rgb8)
                    .map_err(|e| JsValue::from_str(&format!("Failed to encode JPEG: {}", e)))?;
            },
            "webp" => {
                // Encode as WebP
                let mut cursor = Cursor::new(&mut buffer);
                dynamic_img.write_to(&mut cursor, ImageFormat::WebP)
                    .map_err(|e| JsValue::from_str(&format!("Failed to encode WebP: {}", e)))?;
            },
            _ => {
                return Err(JsValue::from_str(&format!("Unsupported format: {}. Use 'jpg' or 'webp'", format)));
            }
        }
        
        console_log!("Generated {} image, size: {} bytes (quality: {}%)", format, buffer.len(), quality);
        Ok(buffer)
    }

    fn add_text_watermark(&self, img: &mut ImageBuffer<Rgba<u8>, Vec<u8>>, filename: &str) {
        // Include Ubuntu-M.ttf font
        let font_data = include_bytes!("../Ubuntu-M.ttf");
        
        match Font::try_from_bytes(font_data) {
            Some(font) => {
                let font_size = 32.0;
                let scale = Scale::uniform(font_size);
                let padding_bottom = 10;
                
                // Text color: #7d7d7d with 50% opacity
                let text_color = Rgba([125u8, 125u8, 125u8, 128u8]); // RGB(125,125,125) with 128/255 = 0.5 (50% opacity)
                
                // Calculate text positioning
                let img_width = img.width() as i32;
                let img_height = img.height() as i32;
                
                // Position text at bottom center with padding
                let y_position = img_height - padding_bottom - (font_size as i32);
                
                // Calculate text width to center it
                let v_metrics = font.v_metrics(scale);
                let glyphs: Vec<_> = font
                    .layout(filename, scale, rusttype::point(0.0, v_metrics.ascent))
                    .collect();
                
                let text_width = glyphs
                    .iter()
                    .rev()
                    .map(|g| g.position().x as f32 + g.unpositioned().h_metrics().advance_width)
                    .next()
                    .unwrap_or(0.0);
                
                let x_position = ((img_width as f32 - text_width) / 2.0).max(10.0) as i32;
                
                // Draw the text using imageproc (no background)
                draw_text_mut(img, text_color, x_position, y_position, scale, &font, filename);
            },
            None => {
                console_log!("Failed to load Ubuntu font, falling back to simple text rendering");
                self.draw_fallback_text(img, filename);
            }
        }
    }
    
    fn draw_fallback_text(&self, img: &mut ImageBuffer<Rgba<u8>, Vec<u8>>, filename: &str) {
        // Fallback to simple rectangular text if font loading fails
        let font_size = 32;
        let padding_bottom = 10;
        
        let img_width = img.width();
        let img_height = img.height();
        
        // Text color: #7d7d7d with 50% opacity
        let text_color = Rgba([125u8, 125u8, 125u8, 128u8]); // RGB(125,125,125) with 128/255 = 0.5 (50% opacity)
        
        // Calculate text positioning
        let char_width = 16;
        let text_width = filename.len() as u32 * char_width;
        let text_height = font_size;
        
        let x_start = if text_width < img_width {
            (img_width - text_width) / 2
        } else {
            10
        };
        
        let y_start = img_height.saturating_sub(text_height + padding_bottom);
        
        // Draw simple text (no background)
        for (i, _) in filename.chars().enumerate() {
            let char_x = x_start + (i as u32 * char_width);
            
            // Draw simple rectangle for each character
            for py in y_start + 5..y_start + text_height - 5 {
                for px in char_x + 2..char_x + char_width - 2 {
                    if px < img_width && py < img_height {
                        let pixel = img.get_pixel_mut(px, py);
                        let alpha = text_color[3] as f32 / 255.0;
                        let inv_alpha = 1.0 - alpha;
                        
                        pixel[0] = ((pixel[0] as f32 * inv_alpha) + (text_color[0] as f32 * alpha)) as u8;
                        pixel[1] = ((pixel[1] as f32 * inv_alpha) + (text_color[1] as f32 * alpha)) as u8;
                        pixel[2] = ((pixel[2] as f32 * inv_alpha) + (text_color[2] as f32 * alpha)) as u8;
                    }
                }
            }
        }
    }

    fn blend_images(
        &self,
        base: &mut ImageBuffer<Rgba<u8>, Vec<u8>>,
        overlay: &ImageBuffer<Rgba<u8>, Vec<u8>>,
        x_offset: i32,
        y_offset: i32,
        opacity: f32,
    ) {
        let base_width = base.width() as i32;
        let base_height = base.height() as i32;
        let overlay_width = overlay.width() as i32;
        let overlay_height = overlay.height() as i32;

        for oy in 0..overlay_height {
            for ox in 0..overlay_width {
                let bx = ox + x_offset;
                let by = oy + y_offset;

                // Check if the overlay pixel is within the base image bounds
                if bx >= 0 && bx < base_width && by >= 0 && by < base_height {
                    let overlay_pixel = overlay.get_pixel(ox as u32, oy as u32);
                    let base_pixel = base.get_pixel_mut(bx as u32, by as u32);

                    // Apply alpha blending with additional opacity
                    let overlay_alpha = (overlay_pixel[3] as f32 / 255.0) * opacity;
                    let inv_alpha = 1.0 - overlay_alpha;

                    base_pixel[0] = ((base_pixel[0] as f32 * inv_alpha) + (overlay_pixel[0] as f32 * overlay_alpha)) as u8;
                    base_pixel[1] = ((base_pixel[1] as f32 * inv_alpha) + (overlay_pixel[1] as f32 * overlay_alpha)) as u8;
                    base_pixel[2] = ((base_pixel[2] as f32 * inv_alpha) + (overlay_pixel[2] as f32 * overlay_alpha)) as u8;
                    // Keep the base alpha channel unchanged
                }
            }
        }
    }
}

#[wasm_bindgen]
pub fn greet(name: &str) {
    alert(&format!("Hello, {}!", name));
}
